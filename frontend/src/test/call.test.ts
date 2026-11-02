import { AUTO_AFTER, QualityMonitor, SUGGEST_AFTER, WEAK, judge } from "../call/quality";
import { adviseNetwork, generateCode, normaliseCode } from "../call/network";
import { summariseStats } from "../call/stats";
import { parseSignal, MAX_NAME_LENGTH } from "../call/signaling";

const ok = { videoLossPercent: 0, audioLossPercent: 0, roundTripTimeMs: 80, framesPerSecond: 15 };

describe("is the call good or weak?", () => {
  it("good when loss, delay and frame rate are fine", () => expect(judge(ok, { videoExpected: true })).toBe("good"));
  it.each([
    ["video packet loss at the limit", { ...ok, videoLossPercent: WEAK.lossPercent }],
    ["audio packet loss", { ...ok, audioLossPercent: 9 }],
    ["slow replies", { ...ok, roundTripTimeMs: WEAK.rttMs }],
    ["video nearly stopped", { ...ok, framesPerSecond: 2 }],
  ])("weak on %s", (_n, s) => expect(judge(s, { videoExpected: true })).toBe("weak"));

  it("in audio only, frame rate and video loss don't count, audio loss does", () => {
    expect(judge({ ...ok, framesPerSecond: 0, videoLossPercent: 40 }, { videoExpected: false })).toBe("good");
    expect(judge({ ...ok, audioLossPercent: 8 }, { videoExpected: false })).toBe("weak");
  });

  it("missing numbers (not measured yet) are not treated as weak", () => {
    expect(judge({ videoLossPercent: 0, audioLossPercent: 0, roundTripTimeMs: null, framesPerSecond: null }, { videoExpected: true })).toBe("good");
  });
});

describe("quality monitor", () => {
  it("one bad reading changes nothing", () => {
    const m = new QualityMonitor();
    expect(m.feed("weak")).toEqual({ quality: "good", suggestAudio: false, switchToAudio: false });
  });
  it("suggests audio after two weak readings in a row, and switches by itself after five", () => {
    const m = new QualityMonitor();
    for (let i = 1; i < SUGGEST_AFTER; i++) m.feed("weak");
    expect(m.feed("weak")).toMatchObject({ quality: "weak", suggestAudio: true, switchToAudio: false });
    for (let i = SUGGEST_AFTER + 1; i < AUTO_AFTER; i++) m.feed("weak");
    expect(m.feed("weak").switchToAudio).toBe(true);
  });
  it("a good reading starts the count again", () => {
    const m = new QualityMonitor();
    m.feed("weak"); m.feed("weak"); m.feed("good");
    expect(m.feed("weak").suggestAudio).toBe(false);
  });
  it("reset forgets the history", () => {
    const m = new QualityMonitor();
    for (let i = 0; i < AUTO_AFTER; i++) m.feed("weak");
    m.reset();
    expect(m.feed("weak").suggestAudio).toBe(false);
  });
});

describe("network advice before the call", () => {
  it("offline: no call, audio only recommended", () => expect(adviseNetwork({ effectiveType: "4g" }, false)).toMatchObject({ level: "weak", recommendAudioOnly: true }));
  it.each([["2g", {}], ["slow-2g", {}], ["4g", { downlink: 0.2 }], ["4g", { saveData: true }]])("slow (%s %j) recommends audio only", (effectiveType, extra) =>
    expect(adviseNetwork({ effectiveType, ...extra }, true).recommendAudioOnly).toBe(true));
  it("3g: warns, but still offers video", () => expect(adviseNetwork({ effectiveType: "3g" }, true)).toMatchObject({ level: "weak", recommendAudioOnly: false }));
  it("4g: good", () => expect(adviseNetwork({ effectiveType: "4g", downlink: 8 }, true)).toMatchObject({ level: "good", recommendAudioOnly: false }));
  it("an unknown connection is not guessed", () => {
    expect(adviseNetwork(undefined, true)).toMatchObject({ level: "unknown", recommendAudioOnly: false });
    expect(adviseNetwork({}, true).level).toBe("unknown");
  });
});

describe("call codes", () => {
  it("make 'Clinic 1 ' and 'clinic-1' the same room", () => { expect(normaliseCode(" Clinic 1 ")).toBe("clinic-1"); expect(normaliseCode("clinic-1")).toBe("clinic-1"); });
  it("generated codes look like hc-0042 and pad with zeros", () => { expect(generateCode(() => 42)).toBe("hc-0042"); expect(generateCode()).toMatch(/^hc-\d{4}$/); });
});

describe("stats", () => {
  const report = new Map<string, unknown>([
    ["t", { id: "t", type: "transport", selectedCandidatePairId: "p" }],
    ["p", { id: "p", type: "candidate-pair", currentRoundTripTime: 0.12, localCandidateId: "l", remoteCandidateId: "r" }],
    ["l", { id: "l", type: "local-candidate", candidateType: "srflx" }],
    ["r", { id: "r", type: "remote-candidate", candidateType: "relay" }],
    ["v", { id: "v", type: "inbound-rtp", kind: "video", packetsReceived: 90, packetsLost: 10, jitter: 0.02, framesPerSecond: 14 }],
    ["a", { id: "a", type: "inbound-rtp", kind: "audio", packetsReceived: 95, packetsLost: 5 }],
  ]);
  it("reduces the browser's report to the numbers that matter", () => {
    const s = summariseStats(report);
    expect(s.videoLossPercent).toBeCloseTo(10); expect(s.audioLossPercent).toBeCloseTo(5);
    expect(s.roundTripTimeMs).toBeCloseTo(120); expect(s.videoJitterMs).toBeCloseTo(20); expect(s.framesPerSecond).toBe(14);
    expect(s.localCandidateType).toBe("srflx"); expect(s.remoteCandidateType).toBe("relay");
  });
  it("an empty report gives zeros and nulls, not a crash", () => {
    expect(summariseStats(new Map())).toMatchObject({ videoLossPercent: 0, audioLossPercent: 0, roundTripTimeMs: null, framesPerSecond: null, localCandidateType: null });
  });
  it("negative lost-packet counts (the browser allows them) don't give a negative loss", () => {
    const s = summariseStats(new Map([["v", { id: "v", type: "inbound-rtp", kind: "video", packetsReceived: 10, packetsLost: -3 }]]));
    expect(s.videoLossPercent).toBe(0);
  });
});

describe("signaling messages (untrusted text from the server)", () => {
  it.each(["", "not json", "42", "null", '{"type":"bogus"}', '{"type":"join"}', '{"type":"join","room":""}', `{"type":"join","room":"${"x".repeat(65)}"}`, `{"type":"offer","name":"${"n".repeat(MAX_NAME_LENGTH + 1)}"}`, '{"type":"offer","name":5}'])("rejects %s", (raw) => expect(parseSignal(raw)).toBeNull());
  it("accepts the real messages", () => {
    expect(parseSignal('{"type":"join","room":"hc-1"}')).toMatchObject({ type: "join" });
    expect(parseSignal('{"type":"joined","initiator":true}')).toMatchObject({ type: "joined" });
    expect(parseSignal('{"type":"offer","sdp":{"type":"offer"},"name":"Ama"}')).toMatchObject({ type: "offer" });
    expect(parseSignal('{"type":"peer-left"}')).toMatchObject({ type: "peer-left" });
  });
});
