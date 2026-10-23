export interface CallStats {
  videoPacketsReceived: number;
  videoPacketsLost: number;
  videoLossPercent: number;
  videoJitterMs: number | null;
  framesPerSecond: number | null;
  roundTripTimeMs: number | null;
  localCandidateType: string | null;
  remoteCandidateType: string | null;
}

/** "relay" means the video went through a TURN server; host/srflx/prflx mean a direct path. */
export function isRelayed(stats: CallStats): boolean {
  return stats.localCandidateType === "relay" || stats.remoteCandidateType === "relay";
}

type Entry = Record<string, unknown> & { type: string; id: string };

const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** Reduce the browser's raw getStats() report to the numbers Lab 7 asks for. */
export function summariseStats(report: ReadonlyMap<string, unknown>): CallStats {
  const entries = [...report.values()] as Entry[];
  const transport = entries.find((e) => e.type === "transport");
  const pair = entries.find(
    (e) => e.type === "candidate-pair" && (e.id === transport?.["selectedCandidatePairId"] || e["selected"] === true),
  );
  const inbound = entries.find((e) => e.type === "inbound-rtp" && e["kind"] === "video");

  const received = num(inbound?.["packetsReceived"]) ?? 0;
  const lost = num(inbound?.["packetsLost"]) ?? 0;
  const jitter = num(inbound?.["jitter"]);
  const rtt = num(pair?.["currentRoundTripTime"]);
  const candidateType = (id: unknown) => str((report.get(String(id)) as Entry | undefined)?.["candidateType"]);

  return {
    videoPacketsReceived: received,
    videoPacketsLost: lost,
    videoLossPercent: received + lost > 0 ? (100 * lost) / (received + lost) : 0,
    videoJitterMs: jitter === null ? null : jitter * 1000,
    framesPerSecond: num(inbound?.["framesPerSecond"]),
    roundTripTimeMs: rtt === null ? null : rtt * 1000,
    localCandidateType: pair ? candidateType(pair["localCandidateId"]) : null,
    remoteCandidateType: pair ? candidateType(pair["remoteCandidateId"]) : null,
  };
}
