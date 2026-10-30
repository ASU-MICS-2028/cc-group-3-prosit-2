/** The passphrase protects the data on the phone. It is typed rarely (after a restart), so it can be
 *  long. A few random words are easier to remember than symbols and much harder to guess. */
export const MIN_PASSPHRASE = 10;

const COMMON = ["password", "passphrase", "healthconnect", "qwerty", "letmein", "welcome", "ghana", "akwaaba", "123456", "abcdef"];

/** Returns a plain-words problem, or null if the passphrase is acceptable. */
export function passphraseProblem(p: string, pin?: string): string | null {
  const t = p.normalize("NFKC");
  if (t.trim() !== t) return "Remove the spaces at the start and end.";
  if (t.length < MIN_PASSPHRASE) return `Use at least ${MIN_PASSPHRASE} characters. Four words work well, like "blue goat river morning".`;
  if (/^\d+$/.test(t)) return "Numbers alone are easy to guess. Add words.";
  if (new Set(t.toLowerCase()).size < 5) return "That has too few different letters. Try four words.";
  const lower = t.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (COMMON.some((c) => lower.includes(c))) return "That is too common. Choose words only you would think of.";
  if (pin && t.includes(pin)) return "Your passphrase shouldn't contain your PIN.";
  return null;
}
