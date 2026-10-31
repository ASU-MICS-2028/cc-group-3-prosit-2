/** What the browser reports about a call, reduced to the few numbers that matter (Lab 7 Part C). */
export interface CallStats {
  videoLossPercent: number;
  audioLossPercent: number;
  videoJitterMs: number | null;
  framesPerSecond: number | null;
  roundTripTimeMs: number | null;
  localCandidateType: string | null;
  remoteCandidateType: string | null;
  videoPacketsReceived: number;
  videoPacketsLost: number;
}

/** "relay" means the call went through a TURN server; host/srflx/prflx are a direct path. */
export const isRelayed = (s: CallStats): boolean => s.localCandidateType === "relay" || s.remoteCandidateType === "relay";

type Entry = Record<string, unknown> & { type: string; id: string };
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const lossPct = (received: number, lost: number) => (received + lost > 0 ? (100 * Math.max(0, lost)) / (received + Math.max(0, lost)) : 0);

export function summariseStats(report: ReadonlyMap<string, unknown>): CallStats {
  const entries = [...report.values()] as Entry[];
  const transport = entries.find((e) => e.type === "transport");
  const pair = entries.find((e) => e.type === "candidate-pair" && (e.id === transport?.["selectedCandidatePairId"] || e["selected"] === true));
  const inbound = (kind: string) => entries.find((e) => e.type === "inbound-rtp" && e["kind"] === kind);
  const video = inbound("video");
  const audio = inbound("audio");

  const vr = num(video?.["packetsReceived"]) ?? 0, vl = num(video?.["packetsLost"]) ?? 0;
  const ar = num(audio?.["packetsReceived"]) ?? 0, al = num(audio?.["packetsLost"]) ?? 0;
  const jitter = num(video?.["jitter"]);
  const rtt = num(pair?.["currentRoundTripTime"]);
  const candidateType = (id: unknown) => str((report.get(String(id)) as Entry | undefined)?.["candidateType"]);

  return {
    videoPacketsReceived: vr, videoPacketsLost: vl,
    videoLossPercent: lossPct(vr, vl), audioLossPercent: lossPct(ar, al),
    videoJitterMs: jitter === null ? null : jitter * 1000,
    framesPerSecond: num(video?.["framesPerSecond"]),
    roundTripTimeMs: rtt === null ? null : rtt * 1000,
    localCandidateType: pair ? candidateType(pair["localCandidateId"]) : null,
    remoteCandidateType: pair ? candidateType(pair["remoteCandidateId"]) : null,
  };
}
