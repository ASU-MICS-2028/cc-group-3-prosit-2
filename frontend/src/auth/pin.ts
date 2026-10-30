/** Each person's PIN is stored only as a salted PBKDF2 hash, on this phone, under their own id. It works offline. */
const KEY = (userId: string) => `hc.pin.v1.${userId}`;
const ATTEMPTS = (userId: string) => `hc.pin.attempts.v1.${userId}`;
export const MAX_ATTEMPTS = 5;
const ITERATIONS = 150_000;

export type PinResult = "ok" | "wrong" | "signed-out";

const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, key, 256);
  return b64(bits);
}

export const isValidPin = (pin: string) => /^\d{4,6}$/.test(pin);
export const hasPin = (userId: string) => localStorage.getItem(KEY(userId)) !== null;

export async function setPin(userId: string, pin: string): Promise<void> {
  if (!isValidPin(pin)) throw new Error("PIN must be 4 to 6 digits");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(pin, salt, ITERATIONS);
  localStorage.setItem(KEY(userId), JSON.stringify({ salt: b64(salt), hash, iterations: ITERATIONS }));
  localStorage.removeItem(ATTEMPTS(userId));
}

export const attemptsLeft = (userId: string) => MAX_ATTEMPTS - Number(localStorage.getItem(ATTEMPTS(userId)) ?? 0);

/** After MAX_ATTEMPTS wrong tries the PIN is wiped and the user must sign in again. */
export async function checkPin(userId: string, pin: string): Promise<PinResult> {
  const raw = localStorage.getItem(KEY(userId));
  if (!raw) return "signed-out";
  const { salt, hash, iterations } = JSON.parse(raw) as { salt: string; hash: string; iterations: number };
  if ((await derive(pin, unb64(salt), iterations)) === hash) {
    localStorage.removeItem(ATTEMPTS(userId));
    return "ok";
  }
  const used = Number(localStorage.getItem(ATTEMPTS(userId)) ?? 0) + 1;
  if (used >= MAX_ATTEMPTS) { clearPin(userId); return "signed-out"; }
  localStorage.setItem(ATTEMPTS(userId), String(used));
  return "wrong";
}

export function clearPin(userId: string) {
  localStorage.removeItem(KEY(userId));
  localStorage.removeItem(ATTEMPTS(userId));
}
