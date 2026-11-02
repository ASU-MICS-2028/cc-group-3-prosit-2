/** Field rules, written once and used by the forms and by the repository (so a bad value can't get in either way).
 *  Each returns a short message in plain words, or null when the value is fine. Letters from every Ghanaian
 *  language are allowed in names and places (ɛ ɔ ŋ ɖ ƒ ɣ ʋ and tone marks). */
import { LOINC, type Vital } from "./model";

const NAME = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u;
const PLACE = /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} .,'’-]*$/u;

export function nameProblem(v: string): string | null {
  const t = v.trim();
  if (!t) return "Please enter the name.";
  if (t.length < 2) return "The name is too short.";
  if (t.length > 100) return "The name is too long.";
  if (/\d/.test(t)) return "Names use letters only, no numbers.";
  if (!NAME.test(t)) return "Names can have letters, spaces, hyphens and apostrophes only.";
  return null;
}

export function placeProblem(v: string): string | null {
  const t = v.trim();
  if (!t) return null;                                   // optional
  if (t.length > 100) return "That is too long.";
  if (!PLACE.test(t)) return "Use letters, numbers and spaces only.";
  return null;
}

export function yearProblem(v: string, now = new Date()): string | null {
  const t = v.trim();
  if (!t) return null;                                   // optional
  if (/\D/.test(t)) return "Numbers only. Use a 4-digit year, like 1984.";
  if (t.length !== 4) return "Use a 4-digit year, like 1984.";
  const y = Number(t);
  if (y < 1900 || y > now.getFullYear()) return `The year should be between 1900 and ${now.getFullYear()}.`;
  return null;
}

/** Digits after +233, with a leading 0 and spaces or dashes forgiven. Returns the 9 digits for the caller to use. */
export function ghanaPhone(v: string): { digits: string; problem: string | null } {
  const raw = v.trim();
  if (!raw) return { digits: "", problem: null };         // optional
  const cleaned = raw.replace(/[\s-]/g, "");
  if (/\D/.test(cleaned)) return { digits: "", problem: "Numbers only. Don't type letters or symbols." };
  const digits = cleaned.replace(/^0+/, "");
  if (digits.length !== 9) return { digits, problem: "A Ghana number has 9 digits after +233, like 244000001." };
  return { digits, problem: null };
}
export const phoneProblem = (v: string) => ghanaPhone(v).problem;

/** A reading typed by hand: digits with one decimal point or comma. Empty is fine (the form decides whether something is needed). */
export function numberProblem(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  if (!/^\d+([.,]\d+)?$/.test(t)) return "Numbers only. Use digits and one decimal point, like 37.4.";
  return null;
}
export const toNumber = (v: string): number | undefined => (v.trim() === "" ? undefined : Number(v.trim().replace(",", ".")));

export function vitalProblem(vital: Vital, v: string): string | null {
  const bad = numberProblem(v);
  if (bad || v.trim() === "") return bad;
  const { label, min, max, display } = LOINC[vital];
  const n = toNumber(v) as number;
  if (n < min || n > max) return `${label} of ${n} ${display} looks wrong. It should be between ${min} and ${max}.`;
  return null;
}

export function callCodeProblem(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  if (t.length > 64) return "That code is too long.";
  if (!/^[A-Za-z0-9 -]+$/.test(t)) return "Use letters, numbers, spaces and hyphens only.";
  return null;
}
