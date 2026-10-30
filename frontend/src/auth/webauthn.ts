/** Staff fingerprint unlock with the phone's own sensor (WebAuthn). The browser only allows it on
 *  https or localhost. In test mode nothing is verified by a server; a live service would check the
 *  signature (SVC-1). The credential id is stored on this phone only. */
const KEY = (userId: string) => `hc.webauthn.v1.${userId}`;

export async function fingerprintAvailable(): Promise<"yes" | "no-https" | "no-sensor"> {
  if (!window.isSecureContext) return "no-https";
  if (!window.PublicKeyCredential) return "no-sensor";
  const ok = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(() => false);
  return ok ? "yes" : "no-sensor";
}

export const fingerprintEnrolled = (userId: string) => localStorage.getItem(KEY(userId)) !== null;
export const clearFingerprint = (userId: string) => localStorage.removeItem(KEY(userId));

const challenge = () => crypto.getRandomValues(new Uint8Array(32));

export async function enrolFingerprint(userId: string, name: string): Promise<boolean> {
  try {
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge: challenge(),
        rp: { name: "HealthConnect" },
        user: { id: new TextEncoder().encode(userId), name, displayName: name },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" },
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;
    if (!cred) return false;
    localStorage.setItem(KEY(userId), btoa(String.fromCharCode(...new Uint8Array(cred.rawId))));
    return true;
  } catch {
    return false; // cancelled, or no enrolled fingerprint on the phone
  }
}

export async function unlockWithFingerprint(userId: string): Promise<boolean> {
  const stored = localStorage.getItem(KEY(userId));
  if (!stored) return false;
  try {
    const id = Uint8Array.from(atob(stored), (c) => c.charCodeAt(0));
    const res = await navigator.credentials.get({
      publicKey: { challenge: challenge(), allowCredentials: [{ type: "public-key", id }], userVerification: "required", timeout: 60_000 },
    });
    return res !== null;
  } catch {
    return false;
  }
}
