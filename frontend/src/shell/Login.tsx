import { useState } from "react";
import { Wordmark } from "../components/brand";
import { PersonRow } from "../components/display";
import { Icon } from "../components/icons";
import { ROLE_LABEL } from "../auth/roles";
import { useSession } from "../auth/Session";

/** Test-mode sign-in: pick a synthetic account. A live auth-service will replace the list with a form. */
export function Login() {
  const { api, signIn } = useSession();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function go(id: string) {
    setBusy(id); setError(null);
    try { await signIn(id); } catch { setError("We couldn't sign you in. Please try again."); } finally { setBusy(null); }
  }

  return (
    <main className="gallery">
      <div className="gallery-onboard"><Wordmark /><h1 className="display">Welcome</h1><p className="caption">Choose who you are to continue.</p></div>
      <p className="banner"><Icon name="warning" size="sm" /> Test mode: these are made-up people.</p>
      <div className="stack login-list">
        {api.demoAccounts().map((a) => (
          <PersonRow key={a.id} name={a.name} role={ROLE_LABEL[a.role]} hours={a.facility} onClick={busy ? undefined : () => go(a.id)} />
        ))}
      </div>
      {error && <p role="alert" className="field-note has-error"><Icon name="warning" size="sm" />{error}</p>}
    </main>
  );
}
