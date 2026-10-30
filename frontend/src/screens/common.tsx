import { useEffect, useState } from "react";
import { Chip, PrimaryButton, SecondaryButton } from "../components/buttons";
import { Icon } from "../components/icons";
import { FINGERPRINT_ROLES, ROLE_LABEL } from "../auth/roles";
import { useSession } from "../auth/Session";
import { clearFingerprint, enrolFingerprint, fingerprintAvailable, fingerprintEnrolled } from "../auth/webauthn";
import { Heading, KV, Rows, go, sync, type ScreenDef } from "./kit";

const LANGS = ["English", "Twi", "Ewe", "Dagbani", "Hausa"];
const LANG_KEY = "hc.lang.v1";

function Fingerprint() {
  const { user } = useSession();
  const [avail, setAvail] = useState<"checking" | "yes" | "no-https" | "no-sensor">("checking");
  const [enrolled, setEnrolled] = useState(() => (user ? fingerprintEnrolled(user.id) : false));
  const [msg, setMsg] = useState<string>();
  useEffect(() => { fingerprintAvailable().then(setAvail); }, []);
  if (!user || !FINGERPRINT_ROLES.includes(user.role)) return <p className="caption">Patients unlock with a PIN. A fingerprint on a shared phone isn't reliable.</p>;
  if (avail === "checking") return null;
  if (avail === "no-https") return <p className="caption">Fingerprint needs a secure (https) page. Use the secure address to turn it on.</p>;
  if (avail === "no-sensor") return <p className="caption">This phone has no fingerprint set up. Add one in the phone's settings, then come back.</p>;
  return (<>
    {enrolled ? (
      <SecondaryButton onClick={() => { clearFingerprint(user.id); setEnrolled(false); setMsg("Fingerprint turned off."); }}>Turn off fingerprint unlock</SecondaryButton>
    ) : (
      <SecondaryButton onClick={async () => { const ok = await enrolFingerprint(user.id, user.name); setEnrolled(ok); setMsg(ok ? "Fingerprint turned on." : "It didn't work. You can try again."); }}>Turn on fingerprint unlock</SecondaryButton>
    )}
    {msg && <p role="status" className="caption">{msg}</p>}
    <p className="caption">Test mode: the phone checks your fingerprint; no server checks it yet.</p>
  </>);
}

function Me() {
  const { user, signOut } = useSession();
  const [lang, setLang] = useState(() => { try { return localStorage.getItem(LANG_KEY) ?? "English"; } catch { return "English"; } });
  if (!user) return null;
  return (<>
    <KV k="Name" v={user.name} /><KV k="Role" v={ROLE_LABEL[user.role]} />{user.facility && <KV k="Area" v={user.facility} />}
    <Heading>Language</Heading>
    <div className="chip-row">{LANGS.map((l) => <Chip key={l} selected={lang === l} onClick={() => { setLang(l); try { localStorage.setItem(LANG_KEY, l); } catch { /* storage blocked: choice lasts until reload */ } }}>{l}</Chip>)}</div>
    <p className="caption">English and Twi will be complete; the others are ready for a native speaker to finish.</p>
    <Heading>Security</Heading>
    <Fingerprint />
    <Heading>Sending</Heading>
    <SecondaryButton onClick={() => go("sync")}><Icon name="phone" size="sm" /> What's waiting to send</SecondaryButton>
    <PrimaryButton onClick={() => signOut()}>Sign out</PrimaryButton>
    <p className="caption">Your PIN stays on this phone for next time.</p>
  </>);
}

export const common: Record<string, ScreenDef> = {
  me: { title: "Me", render: () => <Me /> },
  sync: { title: "Waiting to send", render: () => (<Rows items={[
    { name: "Esi Quaye: vitals", role: "Saved on this phone", trailing: sync("saved") },
    { name: "Akosua Boateng: photo", role: "Sending", trailing: sync("sending") },
    { name: "Yaw Owusu: referral", role: "Sent 8:05 am", trailing: sync("sent") },
  ]} />) },
};
