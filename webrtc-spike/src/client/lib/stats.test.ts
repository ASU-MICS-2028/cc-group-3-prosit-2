import { describe, expect, it } from "vitest";
import { isRelayed, summariseStats } from "./stats";

const report = (remoteType: string) =>
  new Map<string, unknown>([
    ["t", { id: "t", type: "transport", selectedCandidatePairId: "p" }],
    ["p", { id: "p", type: "candidate-pair", localCandidateId: "l", remoteCandidateId: "r", currentRoundTripTime: 0.045 }],
    ["l", { id: "l", type: "local-candidate", candidateType: "srflx" }],
    ["r", { id: "r", type: "remote-candidate", candidateType: remoteType }],
    ["v", { id: "v", type: "inbound-rtp", kind: "video", packetsReceived: 95, packetsLost: 5, jitter: 0.012, framesPerSecond: 24 }],
  ]);

describe("summariseStats", () => {
  it("computes loss %, converts seconds to ms and reads candidate types", () => {
    const s = summariseStats(report("host"));
    expect(s.videoLossPercent).toBeCloseTo(5);
    expect(s.videoJitterMs).toBeCloseTo(12);
    expect(s.roundTripTimeMs).toBeCloseTo(45);
    expect(s.localCandidateType).toBe("srflx");
    expect(isRelayed(s)).toBe(false);
  });
  it("flags a relayed path", () => {
    expect(isRelayed(summariseStats(report("relay")))).toBe(true);
  });
  it("copes with an empty report", () => {
    const s = summariseStats(new Map());
    expect(s.videoLossPercent).toBe(0);
    expect(s.roundTripTimeMs).toBeNull();
  });
});
