import { useEffect, useMemo, useRef, useState } from "react";
import { Chip, PrimaryButton, SecondaryButton, TextButton } from "../components/buttons";
import { PrescriptionCard, type RxStatus } from "../components/clinical";
import { PersonRow, StateView } from "../components/display";
import { Icon } from "../components/icons";
import { Field } from "../components/inputs";
import { useSession } from "../auth/Session";
import { useData, useLoad } from "../data/DataProvider";
import { listConsents, listMedia, listPatients, type View } from "../data/repo";
import { newId, type Media, consentPurpose, consentWithdrawnAt } from "../data/model";
import { RxError, rxApiFor, type Rx, type RxFlag } from "../data/prescriptions";
import { useObjectUrl } from "./media";
import { Heading, KV, TestMode, go } from "./kit";
import { t } from "../i18n";

const Alert = ({ children }: { children: React.ReactNode }) => <p role="alert" className="field-note has-error"><Icon name="warning" size="sm" />{typeof children === "string" ? t(children) : children}</p>;
const messageOf = (e: unknown) => (e instanceof RxError ? e.message : "We couldn't do that. Please try again.");
const spaced = (code?: string) => (code ? `${code.slice(0, 4)} ${code.slice(4)}` : undefined);
const cardStatus: Record<Rx["status"], RxStatus> = { active: "issued", dispensed: "dispensed", cancelled: "cancelled", expired: "expired" };
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });

function useRx() {
  const { session } = useSession();
  return useMemo(() => rxApiFor(session!), [session]);
}
const ModeNote = () => {
  const { session } = useSession();
  return session?.mode === "live"
    ? <p className="caption">{t("The licence check uses a test register, not the real GMDC list.")}</p>
    : <TestMode what={t("This prescription and licence check")} />;
};

function Card({ rx }: { rx: Rx }) {
  return <PrescriptionCard medicine={rx.medication} dose={`${rx.dose}, ${rx.frequency}`} duration={`${rx.durationDays} days · ${rx.quantity} in total`}
    prescriber={rx.prescriber.name} licence={rx.prescriber.licence} {...(rx.code ? { code: spaced(rx.code) as string } : {})} {...(rx.qr ? { qr: rx.qr } : {})} status={cardStatus[rx.status]} />;
}
function Flags({ flags }: { flags: RxFlag[] }) {
  if (flags.length === 0) return null;
  return <div className="stack" aria-label={t("Warnings")}>{flags.map((f) => <p key={f.kind} className="field-note has-error"><Icon name="warning" size="sm" />{f.detail}</p>)}</div>;
}

/* ---------------- Doctor ---------------- */
export function Prescribe() {
  const { userId } = useData();
  const rx = useRx();
  const patients = useLoad(() => listPatients(userId));
  const [patientId, setPatientId] = useState<string>();
  const [medicine, setMedicine] = useState("");
  const [dose, setDose] = useState("");
  const [frequency, setFrequency] = useState("");
  const [days, setDays] = useState("30");
  const [quantity, setQuantity] = useState("30");
  const [problem, setProblem] = useState<string>();
  const [issued, setIssued] = useState<Rx>();
  const [busy, setBusy] = useState(false);
  const idRef = useRef(newId());                                  // kept across a retry, so a lost reply can't issue it twice
  const list = patients.data ?? [];
  const chosen = list.find((p) => p.resource.id === patientId);

  async function issue() {
    if (!chosen) return;
    setProblem(undefined); setBusy(true);
    try {
      const consents = await listConsents(userId, chosen.resource.id);
      const ok = consents.some((c) => consentPurpose(c.resource) === "clinical_care" && !consentWithdrawnAt(c.resource));
      if (!ok) { setProblem("This patient has not given consent for care. Ask them first."); return; }
      const done = await rx.issue({
        id: idRef.current, patient: { id: chosen.resource.id, name: chosen.resource.name[0].text },
        medication: medicine.trim(), dose: dose.trim(), frequency: frequency.trim(), durationDays: Number(days), quantity: Number(quantity),
      });
      setIssued(done);
      idRef.current = newId();
    } catch (e) { setProblem(messageOf(e)); } finally { setBusy(false); }
  }
  async function cancel() {
    if (!issued) return;
    try { await rx.cancel(issued.id); setIssued({ ...issued, status: "cancelled" }); } catch (e) { setProblem(messageOf(e)); }
  }

  if (issued) return (<>
    <KV k={t("For")} v={issued.patient.name} />
    <Card rx={issued} />
    <Flags flags={issued.flags} />
    {problem && <Alert>{problem}</Alert>}
    {issued.status === "active" && <SecondaryButton onClick={() => void cancel()}>{t("Cancel this prescription")}</SecondaryButton>}
    <PrimaryButton onClick={() => { setIssued(undefined); setMedicine(""); setDose(""); setFrequency(""); }}>{t("Write another")}</PrimaryButton>
    <ModeNote />
  </>);

  const whole = (v: string, max: number) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= max;
  const ready = chosen && medicine.trim() && dose.trim() && frequency.trim() && whole(days, 365) && whole(quantity, 10_000);
  return (<>
    <Heading>{t("Patient")}</Heading>
    {patients.loading ? <StateView kind="loading" text={t("Loading…")} /> : list.length === 0
      ? <StateView kind="empty" text={t("No patients on this phone yet. They arrive when a visit is booked with you.")} />
      : <div className="row">{list.map((p) => <Chip key={p.resource.id} selected={p.resource.id === patientId} onClick={() => setPatientId(p.resource.id)}>{p.resource.name[0].text}</Chip>)}</div>}
    <Field label={t("Medicine")} value={medicine} onChange={(e) => setMedicine(e.target.value)} helper={t("Name and strength, e.g. Amlodipine 5 mg")} />
    <Field label={t("How much each time")} value={dose} onChange={(e) => setDose(e.target.value)} helper={t("e.g. 1 tablet")} />
    <Field label={t("How often")} value={frequency} onChange={(e) => setFrequency(e.target.value)} helper={t("e.g. each morning")} />
    <div className="row">
      <Field label={t("Days")} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
      <Field label={t("Quantity")} inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
    </div>
    {problem && <Alert>{problem}</Alert>}
    <PrimaryButton disabled={!ready} loading={busy} onClick={() => void issue()}>{t("Issue prescription")}</PrimaryButton>
    <ModeNote />
  </>);
}

/* ---------------- Pharmacist ---------------- */
type Detector = { detect(v: HTMLVideoElement): Promise<{ rawValue: string }[]> };
const scannerAvailable = () => "BarcodeDetector" in window && Boolean(navigator.mediaDevices?.getUserMedia);

/** Uses the phone's own QR reader where it has one. Without it, the typed code always works. */
function Scanner({ onResult, onClose }: { onResult: (qr: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [problem, setProblem] = useState<string>();
  useEffect(() => {
    let stream: MediaStream | undefined, stopped = false, timer: ReturnType<typeof setTimeout>;
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        const el = video.current!;
        el.srcObject = stream;
        await el.play();
        const Ctor = (window as unknown as { BarcodeDetector: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
        const detector = new Ctor({ formats: ["qr_code"] });
        const tick = async () => {
          if (stopped) return;
          const found = await detector.detect(el).catch(() => []);
          if (found[0]) onResult(found[0].rawValue); else timer = setTimeout(() => void tick(), 300);
        };
        void tick();
      } catch { setProblem("We couldn't open the camera. Type the code instead."); }
    })();
    return () => { stopped = true; clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()); };   // leaving the page turns the camera off
  }, [onResult]);
  return (<>
    {problem ? <Alert>{problem}</Alert> : <video ref={video} className="scan-video" muted playsInline aria-label={t("Camera view for scanning")} />}
    <SecondaryButton onClick={onClose}>{t("Stop scanning")}</SecondaryButton>
  </>);
}

export function Verify() {
  const rx = useRx();
  const [code, setCode] = useState("");
  const [found, setFound] = useState<Rx>();
  const [usedCode, setUsedCode] = useState("");
  const [problem, setProblem] = useState<string>();
  const [held, setHeld] = useState<RxFlag[]>([]);
  const [read, setRead] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);

  async function check(by: { code: string } | { qr: string }) {
    setProblem(undefined); setFound(undefined); setHeld([]); setRead(false); setBusy(true);
    try {
      const r = await rx.verify(by);
      setFound(r);
      setUsedCode("code" in by ? by.code : by.qr.split(":")[3] ?? "");
      if (r.status === "dispensed") setProblem(r.dispensedAtPlace ? t("Already dispensed on {date} at {place}. Do not give the medicine.", { date: fmtDate(r.dispensedAt as string), place: r.dispensedAtPlace }) : t("Already dispensed on {date}. Do not give the medicine.", { date: fmtDate(r.dispensedAt as string) }));
    } catch (e) { setProblem(messageOf(e)); } finally { setBusy(false); }
  }
  async function dispense() {
    if (!found) return;
    setProblem(undefined); setBusy(true);
    try {
      setFound(await rx.dispense(found.id, usedCode, read)); setHeld([]);
    } catch (e) {
      if (e instanceof RxError && e.code === "flags_need_review") setHeld(e.flags);
      else setProblem(messageOf(e));
    } finally { setBusy(false); }
  }
  const open = found?.flags.filter((f) => !f.reviewed) ?? [];

  return (<>
    <Field label={t("Verification code")} inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} helper={t("Type the code, or scan the QR")} />
    <PrimaryButton disabled={code.trim() === ""} loading={busy && !found} onClick={() => void check({ code })}>{t("Check code")}</PrimaryButton>
    {scannerAvailable() && !scanning && <SecondaryButton onClick={() => setScanning(true)}>{t("Scan QR")}</SecondaryButton>}
    {scanning && <Scanner onClose={() => setScanning(false)} onResult={(qr) => { setScanning(false); void check({ qr }); }} />}
    {problem && <Alert>{problem}</Alert>}
    {found && <>
      <KV k={t("For")} v={found.patient.name} />
      <Card rx={found} />
      {found.status === "dispensed" && !problem && <p className="caption">{t("Dispensed. This code can't be used again.")}</p>}
      {found.status === "active" && <>
        <Flags flags={held.length ? held : open} />
        {open.length > 0 && <label className="check-row"><input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)} /><span>{t("I've read the warnings and checked with the patient")}</span></label>}
        <PrimaryButton disabled={open.length > 0 && !read} loading={busy} onClick={() => void dispense()}>{t("Dispense")}</PrimaryButton>
      </>}
    </>}
    <ModeNote />
  </>);
}

function ListOf({ empty }: { empty: string }) {
  const rx = useRx();
  const list = useLoad(() => rx.mine());
  if (list.loading) return <StateView kind="loading" text={t("Loading…")} />;
  if (list.error) return <Alert>{list.error}</Alert>;
  if (!list.data?.length) return <StateView kind="empty" text={empty} />;
  return <div className="stack">{list.data.map((r) => <Card key={r.id} rx={r} />)}</div>;
}
export const DispensedList = () => <><ListOf empty="Nothing dispensed yet." /><ModeNote /></>;

/* ---------------- Patient ---------------- */
export const Medicines = () => <><ListOf empty="No prescriptions yet." /><ModeNote /></>;

/* ---------------- Doctor's image viewer ---------------- */
function BigPhoto({ v }: { v: View<Media> }) {
  const url = useObjectUrl(v.resource);
  const [large, setLarge] = useState(false);
  return (
    <div className="stack">
      {/* Full width, and the phone's own pinch-to-zoom does the rest. */}
      <button className="plain-button" onClick={() => setLarge(!large)} aria-expanded={large} aria-label={large ? t("Show smaller") : t("Show larger")}>
        <img className={large ? "photo-full" : "photo-thumb"} src={url} alt={t("Photo shared by a health worker")} />
      </button>
      <span className="caption tabular">{t("{kb} KB ·", { kb: Math.max(1, Math.round(v.resource.content.size / 1000)) })}{" "}{new Date(v.resource.createdDateTime).toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
    </div>
  );
}

export function ImageViewer({ patientId }: { patientId?: string | undefined }) {
  const { userId } = useData();
  const data = useLoad(async () => {
    const people = await listPatients(userId);
    const out = [];
    for (const p of people) {
      if (patientId && p.resource.id !== patientId) continue;
      const photos = (await listMedia(userId, p.resource.id)).filter((m) => m.resource.type.coding[0].code === "image" && m.resource.status !== "entered-in-error");
      if (photos.length) out.push({ name: p.resource.name[0].text, id: p.resource.id, photos });
    }
    return out;
  }, [patientId]);
  if (data.loading) return <StateView kind="loading" text={t("Loading…")} />;
  if (!data.data?.length) return <StateView kind="empty" text={t("No images yet. They arrive when a health worker shares a photo of a patient with a visit booked with you.")} />;
  return (<>
    {data.data.map((p) => (
      <section key={p.id} className="stack">
        {patientId ? <Heading>{p.name}</Heading> : <PersonRow name={p.name} role={`${p.photos.length} ${p.photos.length === 1 ? "image" : "images"}`} onClick={() => go("clinician.images", p.id)} />}
        {patientId && p.photos.map((v) => <BigPhoto key={v.resource.id} v={v} />)}
      </section>
    ))}
    {patientId && <TextButton onClick={() => go("clinician.images")}>{t("All patients")}</TextButton>}
  </>);
}
