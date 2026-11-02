import type { CallStats } from "./stats";

/** The call is judged "weak" when packets are being lost, replies are slow, or video has nearly stopped.
 *  These are starting values from the Lab 7 throttling tests; they are settings, not facts about every network. */
export const WEAK = { lossPercent: 5, rttMs: 500, minFps: 6 };

/** Two weak readings in a row (2 seconds each) suggest audio only; ten in a row switch to it automatically. */
export const SUGGEST_AFTER = 2;
export const AUTO_AFTER = 5;

export type Judgement = "good" | "weak";

export function judge(s: Pick<CallStats, "videoLossPercent" | "audioLossPercent" | "roundTripTimeMs" | "framesPerSecond">, { videoExpected }: { videoExpected: boolean }): Judgement {
  const loss = videoExpected ? Math.max(s.videoLossPercent, s.audioLossPercent) : s.audioLossPercent;
  if (loss >= WEAK.lossPercent) return "weak";
  if (s.roundTripTimeMs !== null && s.roundTripTimeMs >= WEAK.rttMs) return "weak";
  if (videoExpected && s.framesPerSecond !== null && s.framesPerSecond < WEAK.minFps) return "weak";
  return "good";
}

export type MonitorResult = { quality: Judgement; suggestAudio: boolean; switchToAudio: boolean };

/** Remembers how many weak readings came in a row, so one bad moment doesn't change the call. */
export class QualityMonitor {
  private weakRun = 0;
  feed(j: Judgement): MonitorResult {
    this.weakRun = j === "weak" ? this.weakRun + 1 : 0;
    return { quality: this.weakRun >= SUGGEST_AFTER ? "weak" : "good", suggestAudio: this.weakRun >= SUGGEST_AFTER, switchToAudio: this.weakRun >= AUTO_AFTER };
  }
  reset() { this.weakRun = 0; }
}
