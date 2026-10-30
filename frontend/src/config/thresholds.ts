import type { Vital } from "../data/model";

/** Thresholds are configuration, never guesses in the code (design system 7.20). These are EXAMPLE
 *  values so the flags can be seen working; a clinician from the medical partner must replace them
 *  and set `signedOff` to true. Until then the app says so on screen. */
export const THRESHOLDS = {
  signedOff: false,
  note: "Example ranges for testing. A clinician must approve the real ones.",
  rules: {
    systolic: { lowUrgent: 80, check: 140, urgent: 180 },
    diastolic: { lowUrgent: 50, check: 90, urgent: 120 },
    temperature: { lowUrgent: 35, check: 37.5, urgent: 39.5 },
    weight: {},
    height: {},
  } as Record<Vital, { lowUrgent?: number; check?: number; urgent?: number }>,
};

export type Flag = "normal" | "check" | "urgent";

export function flagFor(vital: Vital, value: number): Flag {
  const r = THRESHOLDS.rules[vital];
  if ((r.lowUrgent !== undefined && value < r.lowUrgent) || (r.urgent !== undefined && value >= r.urgent)) return "urgent";
  if (r.check !== undefined && value >= r.check) return "check";
  return "normal";
}
