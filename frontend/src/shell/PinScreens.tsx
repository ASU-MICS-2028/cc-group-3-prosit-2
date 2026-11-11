import { useState } from "react";
import { Logo } from "../components/brand";
import { PrimaryButton, SecondaryButton } from "../components/buttons";
import { Field } from "../components/inputs";
import { attemptsLeft, checkPin, isValidPin, recordFailure, resetAttempts, setPin } from "../auth/pin";
import { passphraseProblem } from "../auth/passphrase";
import { FINGERPRINT_ROLES } from "../auth/roles";
import { useSession } from "../auth/Session";
import { fingerprintEnrolled, unlockWithFingerprint } from "../auth/webauthn";
import { createVault, isUnlocked, unlockVault } from "../data/vault";
import { wipeLocalData } from "../data/wipe";
import { t } from "../i18n";

const digits = (v: string) => v.replace(/\D/g, "");

/** Two steps, once, after the first sign-in. Nothing here leaves the phone. */
export function PinSetup({ onDone }: { onDone: () => void }) {
  const { user, refreshPin } = useSession();
  const [step, setStep] = useState<"passphrase" | "pin">("passphrase");
  const [phrase, setPhrase] = useState("");
  const [phrase2, setPhrase2] = useState("");
  const [pin, setP] = useState("");
  const [pin2, setP2] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  function nextStep() {
    const problem = passphraseProblem(phrase);
    if (problem) return setError(problem);
    if (phrase !== phrase2) return setError("The two passphrases are different.");
    setError(undefined);
    setStep("pin");
  }
  async function save() {
    if (!user) return;
    if (!isValidPin(pin)) return setError("Use 4 to 6 digits.");
    if (pin !== pin2) return setError("The two PINs are different.");
    const problem = passphraseProblem(phrase, pin);
    if (problem) { setStep("passphrase"); return setError(problem); }
    setBusy(true);
    await createVault(user.id, phrase);
    await setPin(user.id, pin);
    refreshPin();
    onDone();
  }

  if (step === "passphrase") {
    return (
      <main className="gallery lock">
        <Logo size={64} full label="HealthConnect" />
        <h1 className="title-1">{t("Choose a passphrase")}</h1>
        <p className="caption">{t("It protects the health records saved on this phone. You'll type it when the phone has been restarted. Use four words you can remember, like \"blue goat river morning\". It never leaves this phone, and nobody can reset it.")}</p>
        <Field label={t("Passphrase")} type="password" autoComplete="new-password" value={phrase} onChange={(e) => setPhrase(e.target.value)} helper={t("At least 10 characters")} />
        <Field label={t("Type it again")} type="password" autoComplete="new-password" value={phrase2} onChange={(e) => setPhrase2(e.target.value)} error={error} />
        <PrimaryButton onClick={nextStep}>{t("Continue")}</PrimaryButton>
      </main>
    );
  }
  return (
    <main className="gallery lock">
      <Logo size={64} full label="HealthConnect" />
      <h1 className="title-1">{t("Choose a PIN")}</h1>
      <p className="caption">{t("A short PIN opens the app again after it has been in the background for 5 minutes. It stays on this phone.")}</p>
      <Field label={t("PIN (4 to 6 digits)")} type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin} onChange={(e) => setP(digits(e.target.value))} />
      <Field label={t("Type it again")} type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin2} onChange={(e) => setP2(digits(e.target.value))} error={error} />
      <PrimaryButton loading={busy} onClick={save}>{t("Save")}</PrimaryButton>
      <SecondaryButton onClick={() => { setError(undefined); setStep("passphrase"); }}>{t("Back")}</SecondaryButton>
    </main>
  );
}

/** Shown only with the mark: never a name or health details. With the app still open in memory the PIN
 *  is enough; after a restart the passphrase is needed to unlock the data. */
export function LockScreen() {
  const { user, session, unlock, signOut } = useSession();
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  if (!user) return null;
  const withPin = isUnlocked(user.id);
  const canFinger = withPin && FINGERPRINT_ROLES.includes(user.role) && fingerprintEnrolled(user.id);

  async function failed(result: "wrong" | "signed-out") {
    if (result === "signed-out") { await wipeLocalData(user!.id); await signOut(); return; }
    setError(t("That isn't right. {n} tries left.", { n: attemptsLeft(user!.id) }));
  }

  async function submit() {
    setBusy(true);
    try {
      if (withPin) {
        const r = await checkPin(user!.id, secret);
        if (r === "ok") return unlock();
        return await failed(r === "signed-out" ? "signed-out" : "wrong");
      }
      if (await unlockVault(user!.id, secret)) { resetAttempts(user!.id); return unlock(); }
      return await failed(recordFailure(user!.id));
    } finally {
      setSecret(""); setBusy(false);
    }
  }

  return (
    <main className="gallery lock" aria-label={t("App locked")}>
      <Logo size={64} full label="HealthConnect" />
      <h1 className="title-1">{withPin ? t("Enter your PIN") : t("Enter your passphrase")}</h1>
      {!withPin && <p className="caption">{t("The phone was restarted, so your passphrase is needed to open the saved records.")}</p>}
      {withPin
        ? <Field label={t("PIN")} type="password" inputMode="numeric" autoComplete="current-password" maxLength={6} value={secret} onChange={(e) => setSecret(digits(e.target.value))} error={error} />
        : <Field label={t("Passphrase")} type="password" autoComplete="current-password" value={secret} onChange={(e) => setSecret(e.target.value)} error={error} />}
      <PrimaryButton loading={busy} disabled={withPin ? secret.length < 4 : secret.length < 1} onClick={submit}>{t("Unlock")}</PrimaryButton>
      {canFinger && <SecondaryButton onClick={async () => { if (await unlockWithFingerprint(user.id)) unlock(); else setError("Fingerprint didn't work. Use your PIN."); }}>{t("Use fingerprint")}</SecondaryButton>}
      <SecondaryButton onClick={() => signOut()}>{session?.mode === "test" ? t("Switch account") : t("Sign out")}</SecondaryButton>
    </main>
  );
}
