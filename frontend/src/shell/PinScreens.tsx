import { useState } from "react";
import { Logo } from "../components/brand";
import { PrimaryButton, SecondaryButton } from "../components/buttons";
import { Field } from "../components/inputs";
import { attemptsLeft, checkPin, isValidPin, setPin } from "../auth/pin";
import { FINGERPRINT_ROLES } from "../auth/roles";
import { useSession } from "../auth/Session";
import { fingerprintEnrolled, unlockWithFingerprint } from "../auth/webauthn";

/** Shown once after the first sign-in. The PIN never leaves this phone. */
export function PinSetup({ onDone }: { onDone: () => void }) {
  const { user, refreshPin } = useSession();
  const [pin, setP] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!isValidPin(pin)) return setError("Use 4 to 6 digits.");
    if (pin !== again) return setError("The two PINs are different.");
    setBusy(true);
    if (!user) return;
    await setPin(user.id, pin);
    refreshPin();
    onDone();
  }
  return (
    <main className="gallery lock">
      <Logo size={64} full label="HealthConnect" />
      <h1 className="title-1">Choose a PIN</h1>
      <p className="caption">You'll use it to open the app again after it has been in the background for 5 minutes. It stays on this phone.</p>
      <Field label="PIN (4 to 6 digits)" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin} onChange={(e) => setP(e.target.value.replace(/\D/g, ""))} />
      <Field label="Type it again" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={again} onChange={(e) => setAgain(e.target.value.replace(/\D/g, ""))} error={error} />
      <PrimaryButton loading={busy} onClick={save}>Save PIN</PrimaryButton>
    </main>
  );
}

/** The lock screen shows only the mark, never a name or health details. */
export function LockScreen() {
  const { user, session, unlock, signOut } = useSession();
  const [pin, setP] = useState("");
  const [error, setError] = useState<string>();
  const canFinger = !!user && FINGERPRINT_ROLES.includes(user.role) && fingerprintEnrolled(user.id);

  async function submit() {
    if (!user) return;
    const r = await checkPin(user.id, pin);
    setP("");
    if (r === "ok") return unlock();
    if (r === "signed-out") { await signOut(); return; }
    setError(`That PIN isn't right. ${attemptsLeft(user.id)} tries left.`);
  }
  return (
    <main className="gallery lock" aria-label="App locked">
      <Logo size={64} full label="HealthConnect" />
      <h1 className="title-1">Enter your PIN</h1>
      <Field label="PIN" type="password" inputMode="numeric" autoComplete="current-password" maxLength={6} value={pin} onChange={(e) => setP(e.target.value.replace(/\D/g, ""))} error={error} />
      <PrimaryButton disabled={pin.length < 4} onClick={submit}>Unlock</PrimaryButton>
      {canFinger && <SecondaryButton onClick={async () => { if (user && await unlockWithFingerprint(user.id)) unlock(); else setError("Fingerprint didn't work. Use your PIN."); }}>Use fingerprint</SecondaryButton>}
      <SecondaryButton onClick={() => signOut()}>{session?.mode === "test" ? "Switch account" : "Sign out"}</SecondaryButton>
    </main>
  );
}
