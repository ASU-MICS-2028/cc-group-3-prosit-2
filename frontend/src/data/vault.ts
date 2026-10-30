/** The vault: patient data on the phone is encrypted with a random data key. That key is itself
 *  locked with a key made from the person's PASSPHRASE (at least 10 characters, see passphrase.ts),
 *  so the data is unreadable without it, even for someone who copies the phone's storage. The data
 *  key lives only in memory after the passphrase is entered; the short PIN only guards the screen
 *  while the key is already in memory. */

const KEY = (userId: string) => `hc.vault.v1.${userId}`;
/** 600,000 rounds is the current OWASP advice for PBKDF2-SHA256. Tests lower it to stay fast. */
export const DEFAULT_ITERATIONS = 600_000;
let iterations = DEFAULT_ITERATIONS;
export const setKdfIterations = (n: number) => { iterations = n; };

export class VaultLockedError extends Error {
  constructor() { super("The vault is locked. Enter your passphrase."); this.name = "VaultLockedError"; }
}

const memory = new Map<string, CryptoKey>();

/** Chunked: passing a whole photo to fromCharCode at once overflows the call stack (found by a test with an 84 KB photo). */
const b64 = (b: ArrayBuffer | Uint8Array) => {
  const bytes = new Uint8Array(b);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function passphraseKey(passphrase: string, salt: Uint8Array, rounds: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase.normalize("NFKC")), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: rounds },
    base, { name: "AES-GCM", length: 256 }, false, ["wrapKey", "unwrapKey"],
  );
}

type Stored = { salt: string; iv: string; wrapped: string; iterations: number };
const unwrap = (wrapped: Uint8Array, kek: CryptoKey, iv: Uint8Array) =>
  crypto.subtle.unwrapKey("raw", wrapped as BufferSource, kek, { name: "AES-GCM", iv: iv as BufferSource }, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);

export const hasVault = (userId: string) => localStorage.getItem(KEY(userId)) !== null;
export const isUnlocked = (userId: string) => memory.has(userId);

/** Makes a new data key for this person and locks it with their passphrase. Leaves the vault unlocked. */
export async function createVault(userId: string, passphrase: string): Promise<void> {
  const dataKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const kek = await passphraseKey(passphrase, salt, iterations);
  const wrapped = await crypto.subtle.wrapKey("raw", dataKey, kek, { name: "AES-GCM", iv });
  const stored: Stored = { salt: b64(salt), iv: b64(iv), wrapped: b64(wrapped), iterations };
  localStorage.setItem(KEY(userId), JSON.stringify(stored));
  memory.set(userId, await unwrap(new Uint8Array(wrapped), kek, iv)); // keep a non-exportable copy
}

/** True if the passphrase opened the vault. A wrong one fails the lock's built-in check. */
export async function unlockVault(userId: string, passphrase: string): Promise<boolean> {
  const raw = localStorage.getItem(KEY(userId));
  if (!raw) return false;
  try {
    const s = JSON.parse(raw) as Stored;
    const kek = await passphraseKey(passphrase, unb64(s.salt), s.iterations);
    memory.set(userId, await unwrap(unb64(s.wrapped), kek, unb64(s.iv)));
    return true;
  } catch {
    return false;
  }
}

export const lockVault = (userId: string) => { memory.delete(userId); };
export function wipeVault(userId: string) { memory.delete(userId); localStorage.removeItem(KEY(userId)); }

export type Sealed = { iv: string; ct: string };

/** `aad` ties the ciphertext to one record, so a sealed blob copied onto another record fails to open. */
export async function seal(userId: string, value: unknown, aad: string): Promise<Sealed> {
  const key = memory.get(userId);
  if (!key) throw new VaultLockedError();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(aad) }, key, new TextEncoder().encode(JSON.stringify(value)));
  return { iv: b64(iv), ct: b64(ct) };
}

export async function open<T>(userId: string, sealed: Sealed, aad: string): Promise<T> {
  const key = memory.get(userId);
  if (!key) throw new VaultLockedError();
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(sealed.iv) as BufferSource, additionalData: new TextEncoder().encode(aad) }, key, unb64(sealed.ct) as BufferSource);
  return JSON.parse(new TextDecoder().decode(pt)) as T;
}
