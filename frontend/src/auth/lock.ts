/** App lock: the PIN is asked again after 5 minutes in the background (design system section 8). */
export const LOCK_AFTER_MS = 5 * 60 * 1000;

export function shouldLock(hiddenAt: number | null, now: number, limit = LOCK_AFTER_MS): boolean {
  return hiddenAt !== null && now - hiddenAt >= limit;
}
