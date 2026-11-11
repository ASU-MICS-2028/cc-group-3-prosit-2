import { useEffect, useState } from "react";
import { Chip, PrimaryButton, SecondaryButton } from "../components/buttons";
import { Icon } from "../components/icons";
import { FINGERPRINT_ROLES, ROLE_LABEL } from "../auth/roles";
import { useSession } from "../auth/Session";
import { clearFingerprint, enrolFingerprint, fingerprintAvailable, fingerprintEnrolled } from "../auth/webauthn";
import { Heading, KV, Rows, go, sync, type ScreenDef } from "./kit";
import { LANGS, getLang, setLang, t, type Lang } from "../i18n";
import { TEXT_SIZES, getTextSize, setTextSize, type TextSize } from "../textSize";


function Fingerprint() {
  const { user } = useSession();
  const [avail, setAvail] = useState<"checking" | "yes" | "no-https" | "no-sensor">("checking");
  const [enrolled, setEnrolled] = useState(() => (user ? fingerprintEnrolled(user.id) : false));
  const [msg, setMsg] = useState<string>();
  useEffect(() => { fingerprintAvailable().then(setAvail); }, []);
  if (!user || !FINGERPRINT_ROLES.includes(user.role)) return <p className="caption">{t("Patients unlock with a PIN. A fingerprint on a shared phone isn't reliable.")}</p>;
  if (avail === "checking") return null;
  if (avail === "no-https") return <p className="caption">{t("Fingerprint needs a secure (https) page. Use the secure address to turn it on.")}</p>;
  if (avail === "no-sensor") return <p className="caption">{t("This phone has no fingerprint set up. Add one in the phone's settings, then come back.")}</p>;
  return (<>
    {enrolled ? (
      <SecondaryButton onClick={() => { clearFingerprint(user.id); setEnrolled(false); setMsg("Fingerprint turned off."); }}>{t("Turn off fingerprint unlock")}</SecondaryButton>
    ) : (
      <SecondaryButton onClick={async () => { const ok = await enrolFingerprint(user.id, user.name); setEnrolled(ok); setMsg(ok ? "Fingerprint turned on." : "It didn't work. You can try again."); }}>{t("Turn on fingerprint unlock")}</SecondaryButton>
    )}
    {msg && <p role="status" className="caption">{t(msg)}</p>}
    <p className="caption">{t("Test mode: the phone checks your fingerprint; no server checks it yet.")}</p>
  </>);
}

function Me() {
  const { user, signOut } = useSession();
  const [size, setSize] = useState(getTextSize);
  if (!user) return null;
  return (<>
    <KV k={t("Name")} v={user.name} /><KV k={t("Role")} v={t(ROLE_LABEL[user.role])} />{user.facility && <KV k={t("Area")} v={user.facility} />}
    <Heading>{t("Language")}</Heading>
    <div className="row">{(Object.keys(LANGS) as Lang[]).map((l) => <Chip key={l} lang={LANGS[l]} selected={getLang() === l} onClick={() => setLang(l)}>{l}</Chip>)}</div>
    <p className="caption">{t("Twi is a first draft made with a computer and still needs checking by a Twi speaker. Ewe, Dagbani and Hausa show English until a native speaker fills them in.")}</p>
    <Heading>{t("Text size")}</Heading>
    <div className="row">{(Object.keys(TEXT_SIZES) as TextSize[]).map((s) => <Chip key={s} selected={size === s} onClick={() => { setTextSize(s); setSize(s); }}>{s}</Chip>)}</div>
    <Heading>{t("Security")}</Heading>
    <Fingerprint />
    <Heading>{t("Sending")}</Heading>
    <SecondaryButton onClick={() => go("sync")}><Icon name="phone" size="sm" />{" "}{t("What's waiting to send")}</SecondaryButton>
    <PrimaryButton onClick={() => signOut()}>{t("Sign out")}</PrimaryButton>
    <p className="caption">{t("Your PIN stays on this phone for next time.")}</p>
  </>);
}

export const common: Record<string, ScreenDef> = {
  me: { title: "Me", render: () => <Me /> },
};
