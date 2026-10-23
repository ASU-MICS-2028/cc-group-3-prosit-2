import { isRelayed, type CallStats } from "../lib/stats";

const fmt = (v: number | null, digits: number, unit = "") => (v === null ? "n/a" : `${v.toFixed(digits)}${unit}`);

export function StatsPanel({ stats }: { stats: CallStats | null }) {
  if (!stats) return <p>Stats appear once the call connects.</p>;
  return (
    <dl className="stats">
      <dt>Path</dt>
      <dd>
        {isRelayed(stats) ? "relayed (TURN)" : "direct"} ({stats.localCandidateType ?? "?"} ↔ {stats.remoteCandidateType ?? "?"})
      </dd>
      <dt>Round-trip time</dt>
      <dd>{fmt(stats.roundTripTimeMs, 0, " ms")}</dd>
      <dt>Video packet loss</dt>
      <dd>
        {fmt(stats.videoLossPercent, 2, " %")} ({stats.videoPacketsLost} lost / {stats.videoPacketsReceived} received)
      </dd>
      <dt>Video jitter</dt>
      <dd>{fmt(stats.videoJitterMs, 1, " ms")}</dd>
      <dt>Frames per second</dt>
      <dd>{fmt(stats.framesPerSecond, 0)}</dd>
    </dl>
  );
}
