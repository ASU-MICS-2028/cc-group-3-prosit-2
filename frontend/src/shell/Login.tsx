import { useState, type FormEvent } from "react";
import { Wordmark } from "../components/brand";
import { PrimaryButton, TextButton } from "../components/buttons";
import { PersonRow } from "../components/display";
import { Icon } from "../components/icons";
import { Field } from "../components/inputs";
import { SignInRefused } from "../auth/liveApi";
import { ROLE_LABEL } from "../auth/roles";
import { useSession } from "../auth/Session";
import { t } from "../i18n";

/** A real account signs in with a password. The switch underneath opens test mode: made-up people, no server. */
export function Login() {
  const { api, signIn, signInLive, expired } = useSession();
  const [testMode, setTestMode] = useState(import.meta.env.VITE_START_IN_TEST_MODE === "true");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function attempt(key: string, work: () => Promise<void>) {
    setBusy(key); setError(null);
    try { await work(); } catch (e) { setError(e instanceof SignInRefused ? e.message : "We couldn't sign you in. Please try again."); } finally { setBusy(null); }
  }
  const submit = (e: FormEvent) => { e.preventDefault(); if (!busy && username && password) void attempt("live", () => signInLive(username, password)); };

  return (
    <main className="gallery">
      <div className="gallery-onboard"><Wordmark /><h1 className="display">{t("Welcome")}</h1><p className="caption">{testMode ? t("Choose who you are to continue.") : t("Sign in to continue.")}</p></div>
      {expired && <p role="alert" className="banner"><Icon name="warning" size="sm" />{" "}{t("Your sign-in has ended. Sign in again. Your records are safe on this phone and will be sent afterwards.")}</p>}
      {testMode ? (<>
        <p className="banner"><Icon name="warning" size="sm" />{" "}{t("Test mode: these are made-up people.")}</p>
        <div className="stack login-list">
          {api.demoAccounts().map((a) => (
            <PersonRow key={a.id} name={a.name} role={ROLE_LABEL[a.role]} hours={a.facility} onClick={busy ? undefined : () => attempt(a.id, () => signIn(a.id))} />
          ))}
        </div>
      </>) : (
        <form className="stack" onSubmit={submit}>
          <Field label={t("Username")} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" required />
          <Field label={t("Password")} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          <PrimaryButton type="submit" loading={busy === "live"}>{t("Sign in")}</PrimaryButton>
        </form>
      )}
      {error && <p role="alert" className="field-note has-error"><Icon name="warning" size="sm" />{t(error)}</p>}
      <TextButton onClick={() => { setTestMode(!testMode); setError(null); }}>{testMode ? t("Sign in with a real account") : t("Use test mode (made-up people)")}</TextButton>
    </main>
  );
}
