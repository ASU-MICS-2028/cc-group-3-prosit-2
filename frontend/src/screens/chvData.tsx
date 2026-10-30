import { useState } from "react";
import { Chip, PrimaryButton, SecondaryButton, TextButton } from "../components/buttons";
import { PersonRow, StateView, SyncBadge, type SyncStatus } from "../components/display";
import { Field, SearchField } from "../components/inputs";
import { ConfirmDialog } from "../components/nav";
import { EmergencyButton, RangeFlag, VitalCard, VitalField, type Flag } from "../components/clinical";
import { Icon } from "../components/icons";
import { PromoCard } from "../components/display";
import { useData, useLoad } from "../data/DataProvider";
import { PhotosSection, VoiceSection } from "./media";
import {
  RepoError, createPatient, getPatient, listConsents, listMedia, listObservations, listPatients, markObservationInError, pendingCount, recordConsent, recordVitals, withdrawConsent,
  type View,
} from "../data/repo";
import { LOINC, VITAL_BY_CODE, consentPurpose, consentWithdrawnAt, observationGroup, type Gender, type GivenBy, type Observation, type Patient, type Vital } from "../data/model";
import { THRESHOLDS, flagFor } from "../config/thresholds";
import { Heading, KV, Tiles, go, type ScreenDef } from "./kit";

const Emergency = () => <div className="stack"><EmergencyButton onClick={() => go("chv.emergency")} /></div>;
const Alert = ({ children }: { children: React.ReactNode }) => <p role="alert" className="field-note has-error"><Icon name="warning" size="sm" />{children}</p>;
const badge = (s: SyncStatus) => <SyncBadge status={s} />;
const name = (p: Patient) => p.name[0].text;
const ageOf = (p: Patient) => (p.birthDate ? `${new Date().getFullYear() - Number(p.birthDate.slice(0, 4))} years` : undefined);
const when = (iso: string) => new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function Loading({ error, loading }: { error?: string; loading: boolean }) {
  if (error) return <StateView kind="error" plain text={error} />;
  return loading ? <StateView kind="loading" text="Opening saved records…" /> : null;
}

/* ---------------- Today ---------------- */
function Today() {
  const { userId, sync, online, lastSync } = useData();
  const { data, error, loading } = useLoad(async () => ({ patients: await listPatients(userId), waiting: await pendingCount(userId) }));
  const [sending, setSending] = useState(false);
  if (!data) return <Loading error={error} loading={loading} />;
  const attention = data.patients.filter((p) => p.syncState === "attention").length;
  return (<>
    <div className="row">
      {badge(data.waiting > 0 ? "saved" : "sent")}
      <span className="caption">{data.waiting > 0 ? `${data.waiting} waiting to send` : "Everything is sent"}</span>
    </div>
    {data.waiting > 0 && (online
      ? <SecondaryButton disabled={sending} onClick={async () => { setSending(true); await sync(); setSending(false); }}>{sending ? "Sending…" : "Send now"}</SecondaryButton>
      : <p className="caption">You're offline. It will send by itself when there is a signal.</p>)}
    {lastSync && lastSync.conflicts + attention > 0 && <PersonRow name="Needs your attention" role="Two versions of a record differ" trailing={badge("attention")} onClick={() => go("sync")} />}
    <Heading>Recent patients</Heading>
    {data.patients.length === 0
      ? <StateView kind="empty" text="No patients yet. Add the first one." action={<PrimaryButton onClick={() => go("chv.register")}>Add patient</PrimaryButton>} />
      : <div className="stack">{data.patients.slice(0, 4).map((v) => <PersonRow key={v.resource.id} name={name(v.resource)} role={v.resource.address?.[0].city ?? "Patient"} trailing={badge(v.syncState)} onClick={() => go("chv.patient", v.resource.id)} />)}</div>}
    <Heading>Quick actions</Heading>
    <Tiles items={[{ icon: "users", label: "Add patient", to: "chv.register" }, { icon: "baby", label: "Mothers & babies", to: "chv.maternal" }, { icon: "calendar-check", label: "Survey", to: "chv.survey" }]} />
    <PromoCard title="Vaccination day: Saturday at the clinic" action="Learn more" />
  </>);
}

/* ---------------- Patients ---------------- */
function Patients() {
  const { userId } = useData();
  const { data, error, loading } = useLoad(() => listPatients(userId));
  const [q, setQ] = useState("");
  if (!data) return <Loading error={error} loading={loading} />;
  const shown = data.filter((v) => name(v.resource).toLowerCase().includes(q.trim().toLowerCase()));
  return (<>
    <SearchField placeholder="Search patients" value={q} onChange={(e) => setQ(e.target.value)} />
    {data.length === 0 ? <StateView kind="empty" text="No patients yet. Add the first one." />
      : shown.length === 0 ? <StateView kind="empty" text={`No patient called "${q}".`} />
      : <div className="stack">{shown.map((v) => <PersonRow key={v.resource.id} name={name(v.resource)} role={[ageOf(v.resource), v.resource.address?.[0].city].filter(Boolean).join(" · ") || "Patient"} trailing={badge(v.syncState)} onClick={() => go("chv.patient", v.resource.id)} />)}</div>}
    <PrimaryButton onClick={() => go("chv.register")}>Add patient</PrimaryButton>
  </>);
}

/* ---------------- Register ---------------- */
function Register() {
  const { userId, notify, sync } = useData();
  const [f, setF] = useState({ name: "", village: "", year: "", phone: "" });
  const [gender, setGender] = useState<Gender>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function save() {
    if (busy) return;                                   // a second tap while saving does nothing
    setError(undefined);
    const year = f.year.trim();
    if (year && (!/^\d{4}$/.test(year) || Number(year) < 1900 || Number(year) > new Date().getFullYear())) return setError("Please enter a 4-digit year of birth, like 1984.");
    const digits = f.phone.replace(/\D/g, "").replace(/^0+/, "");
    setBusy(true);
    try {
      const p = await createPatient(userId, { fullName: f.name, village: f.village, birthDate: year || undefined, gender, phone: digits ? `+233${digits}` : undefined });
      notify(); void sync();
      go("chv.consent", p.id);
    } catch (e) {
      setError(e instanceof RepoError ? e.message : "We couldn't save this. Please try again.");
      setBusy(false);
    }
  }
  return (<>
    <Field label="Full name" value={f.name} onChange={set("name")} />
    <Field label="Village or town" value={f.village} onChange={set("village")} />
    <Field label="Year of birth" inputMode="numeric" maxLength={4} value={f.year} onChange={set("year")} helper="An estimate is fine" />
    <div className="row">{(["female", "male"] as Gender[]).map((g) => <Chip key={g} selected={gender === g} onClick={() => setGender(gender === g ? undefined : g)}>{g === "female" ? "Female" : "Male"}</Chip>)}</div>
    <Field label="Phone number (optional)" inputMode="tel" prefix="+233" value={f.phone} onChange={set("phone")} helper="Only if they agree to reminders" />
    {error && <Alert>{error}</Alert>}
    <PrimaryButton loading={busy} onClick={save}>Save and continue</PrimaryButton>
    <Emergency />
  </>);
}

/* ---------------- Consent ---------------- */
function Consent({ id }: { id?: string }) {
  const { userId, notify, sync } = useData();
  const { data, error, loading } = useLoad(() => (id ? getPatient(userId, id) : Promise.reject(new Error("No patient chosen."))), [id]);
  const [step, setStep] = useState<"care" | "reminders">("care");
  const [givenBy, setGivenBy] = useState<GivenBy>("patient");
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);
  if (!data || !id) return <Loading error={error} loading={loading} />;
  const patient = data.resource;

  async function agree(purpose: "clinical_care" | "appointment_reminders") {
    if (busy) return;
    setBusy(true); setProblem(undefined);
    try {
      await recordConsent(userId, id!, purpose, givenBy);
      notify(); void sync();
      if (purpose === "clinical_care" && patient.telecom) { setStep("reminders"); setBusy(false); } else go("chv.patient", id!);
    } catch (e) {
      setProblem(e instanceof RepoError ? e.message : "We couldn't save that. Please try again."); setBusy(false);
    }
  }
  return step === "care" ? (<>
    <p className="body-strong">{name(patient)}</p>
    <p>May we write down your health readings, like blood pressure and temperature, so your nurse and doctor can look after you?</p>
    <p className="caption">You can say no. You can change your mind at any time.</p>
    <div className="row">
      {([["patient", "They agree"], ["guardian", "A guardian agrees"], ["chv_on_behalf", "I agree for them"]] as [GivenBy, string][]).map(([k, l]) => <Chip key={k} selected={givenBy === k} onClick={() => setGivenBy(k)}>{l}</Chip>)}
    </div>
    {problem && <Alert>{problem}</Alert>}
    <PrimaryButton loading={busy} onClick={() => agree("clinical_care")}>I agree</PrimaryButton>
    <SecondaryButton onClick={() => go("chv.patients")}>Not now</SecondaryButton>
  </>) : (<>
    <p className="body-strong">Reminders</p>
    <p>May we send you reminders by SMS about your visits?</p>
    {problem && <Alert>{problem}</Alert>}
    <PrimaryButton loading={busy} onClick={() => agree("appointment_reminders")}>Yes, send reminders</PrimaryButton>
    <SecondaryButton onClick={() => go("chv.patient", id)}>No thanks</SecondaryButton>
  </>);
}

/* ---------------- Patient ---------------- */
type Reading = { key: string; ids: string[]; label: string; text: string; at: string; flag: Flag; mistake: boolean; vital: Vital | "bp" };

function readingsOf(obs: View<Observation>[]): Reading[] {
  const out: Reading[] = [];
  const pairs = new Map<string, Reading & { sys?: Observation; dia?: Observation }>();
  for (const { resource: o } of obs) {
    const vital = VITAL_BY_CODE[o.code.coding[0].code];
    if (!vital) continue;
    const group = observationGroup(o);
    const mistake = o.status === "entered-in-error";
    if (group) {
      const r = pairs.get(group) ?? { key: group, ids: [], label: "Blood pressure", text: "", at: o.effectiveDateTime, flag: "normal" as Flag, mistake, vital: "bp" as const };
      r.ids.push(o.id);
      if (vital === "systolic") r.sys = o; else r.dia = o;
      pairs.set(group, r);
    } else {
      out.push({ key: o.id, ids: [o.id], label: LOINC[vital].label, text: `${o.valueQuantity.value} ${o.valueQuantity.unit}`, at: o.effectiveDateTime, flag: flagFor(vital, o.valueQuantity.value), mistake, vital });
    }
  }
  for (const r of pairs.values()) {
    const s = r.sys?.valueQuantity.value, d = r.dia?.valueQuantity.value;
    const f = [s !== undefined ? flagFor("systolic", s) : "normal", d !== undefined ? flagFor("diastolic", d) : "normal"];
    out.push({ ...r, text: `${s ?? "?"}/${d ?? "?"} mmHg`, flag: f.includes("urgent") ? "urgent" : f.includes("check") ? "check" : "normal" });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

function PatientDetail({ id }: { id?: string }) {
  const { userId, notify, sync } = useData();
  const { data, error, loading } = useLoad(async () => {
    if (!id) throw new Error("No patient chosen.");
    return { patient: await getPatient(userId, id), consents: await listConsents(userId, id), obs: await listObservations(userId, id), media: await listMedia(userId, id) };
  }, [id]);
  const [confirm, setConfirm] = useState<{ kind: "mistake" | "withdraw"; id: string } | null>(null);
  const [problem, setProblem] = useState<string>();
  if (!data || !id) return <Loading error={error} loading={loading} />;

  const { patient, consents, obs, media } = data;
  const care = consents.map((c) => c.resource).filter((c) => consentPurpose(c) === "clinical_care");
  const active = care.find((c) => c.status === "active");
  const readings = readingsOf(obs);
  const latest = readings.filter((r) => !r.mistake).filter((r, i, all) => all.findIndex((x) => x.vital === r.vital) === i);

  async function confirmed() {
    if (!confirm) return;
    try {
      if (confirm.kind === "mistake") await markObservationInError(userId, confirm.id); else await withdrawConsent(userId, confirm.id);
      notify(); void sync();
    } catch (e) { setProblem(e instanceof RepoError ? e.message : "We couldn't save that."); }
    setConfirm(null);
  }

  return (<>
    <div className="row">{badge(patient.syncState)}<span className="caption">{[ageOf(patient.resource), patient.resource.address?.[0].city].filter(Boolean).join(" · ")}</span></div>
    {problem && <Alert>{problem}</Alert>}
    <Heading>Permission</Heading>
    {active ? (
      <div className="row"><span className="body-strong">Readings may be recorded</span><TextButton onClick={() => setConfirm({ kind: "withdraw", id: active.id })}>Withdraw</TextButton></div>
    ) : (<>
      <p className="caption">{care.some((c) => consentWithdrawnAt(c)) ? "Permission was withdrawn." : "No permission yet."} Ask before recording readings.</p>
      <SecondaryButton onClick={() => go("chv.consent", id)}>Ask for permission</SecondaryButton>
    </>)}
    {confirm && (confirm.kind === "withdraw"
      ? <ConfirmDialog title="Withdraw permission?" body="No new readings can be recorded until permission is given again. Old records stay." cancel={<SecondaryButton onClick={() => setConfirm(null)}>Cancel</SecondaryButton>} confirm={<PrimaryButton onClick={confirmed}>Withdraw</PrimaryButton>} />
      : <ConfirmDialog title="Mark this reading as a mistake?" body="It stays in the history, marked as a mistake. It is not deleted." cancel={<SecondaryButton onClick={() => setConfirm(null)}>Cancel</SecondaryButton>} confirm={<PrimaryButton onClick={confirmed}>Mark as mistake</PrimaryButton>} />)}
    <Heading>Latest readings</Heading>
    {latest.length === 0 ? <p className="caption">No readings yet.</p> : (<div className="row">{latest.map((r) => <VitalCard key={r.key} label={r.label} value={r.text.split(" ")[0]} unit={r.text.split(" ").slice(1).join(" ")} taken={when(r.at)} flag={r.flag} />)}</div>)}
    {latest.some((r) => r.flag !== "normal") && !THRESHOLDS.signedOff && <p className="caption">{THRESHOLDS.note}</p>}
    <PrimaryButton onClick={() => go("chv.vitals", id)}>Record vitals</PrimaryButton>
    <Heading>Photos</Heading>
    <PhotosSection patientId={id} media={media} />
    <Heading>Voice notes</Heading>
    <VoiceSection patientId={id} media={media} />
    <Heading>History</Heading>
    {readings.length === 0 ? <p className="caption">Nothing recorded yet.</p> : readings.map((r) => (
      <div className="kv" key={r.key}>
        <span><span className="body-strong">{r.label}</span><br /><span className="caption tabular">{when(r.at)}</span></span>
        <span style={{ textAlign: "right" }}>
          <span className="body-strong tabular">{r.text}</span><br />
          {r.mistake ? <span className="caption">Marked as a mistake</span> : <><RangeFlag flag={r.flag} /><TextButton onClick={() => setConfirm({ kind: "mistake", id: r.ids[0] })}>Mark as a mistake</TextButton></>}
        </span>
      </div>
    ))}
    <KV k="Record id" v={<span className="caption tabular">{id.slice(0, 8)}</span>} />
    <div className="row"><SecondaryButton onClick={() => go("chv.referral")}>Refer</SecondaryButton><SecondaryButton onClick={() => go("chv.book")}>Book visit</SecondaryButton></div>
    <Emergency />
  </>);
}

/* ---------------- Vitals ---------------- */
function Vitals({ id }: { id?: string }) {
  const { userId, notify, sync } = useData();
  const { data, error, loading } = useLoad(() => (id ? getPatient(userId, id) : Promise.reject(new Error("No patient chosen."))), [id]);
  const [v, setV] = useState({ sys: "", dia: "", temp: "", weight: "", height: "" });
  const [problem, setProblem] = useState<{ text: string; consent: boolean }>();
  const [busy, setBusy] = useState(false);
  if (!data || !id) return <Loading error={error} loading={loading} />;
  const num = (s: string) => (s.trim() === "" ? undefined : Number(s.trim().replace(",", ".")));

  async function save() {
    if (busy) return;
    setBusy(true); setProblem(undefined);
    try {
      await recordVitals(userId, id!, { systolic: num(v.sys), diastolic: num(v.dia), temperature: num(v.temp), weight: num(v.weight), height: num(v.height) });
      notify(); void sync();
      go("chv.patient", id!);
    } catch (e) {
      const r = e instanceof RepoError ? e : undefined;
      setProblem({ text: r?.message ?? "We couldn't save this. Please try again.", consent: r?.code === "consent-required" || r?.code === "consent-withdrawn" });
      setBusy(false);
    }
  }
  return (<>
    <p className="body-strong">{name(data.resource)}</p>
    <VitalField vital="bp" value={v.sys} onChange={(x) => setV({ ...v, sys: x })} diastolic={v.dia} onDiastolic={(x) => setV({ ...v, dia: x })} />
    <VitalField vital="temp" value={v.temp} onChange={(x) => setV({ ...v, temp: x })} />
    <VitalField vital="weight" value={v.weight} onChange={(x) => setV({ ...v, weight: x })} />
    <VitalField vital="height" value={v.height} onChange={(x) => setV({ ...v, height: x })} />
    {problem && <><Alert>{problem.text}</Alert>{problem.consent && <SecondaryButton onClick={() => go("chv.consent", id)}>Ask for permission</SecondaryButton>}</>}
    <PrimaryButton loading={busy} onClick={save}>Save</PrimaryButton>
    <Emergency />
  </>);
}

export const chvData: Record<string, ScreenDef> = {
  "chv.today": { title: "Hi Ama", caption: "Here is your day", render: () => <Today /> },
  "chv.patients": { title: "Patients", render: () => <Patients /> },
  "chv.register": { title: "Add patient", render: () => <Register /> },
  "chv.consent": { title: "Permission", render: (id) => <Consent id={id} key={id} /> },
  "chv.patient": { title: "Patient", render: (id) => <PatientDetail id={id} key={id} /> },
  "chv.vitals": { title: "Record vitals", render: (id) => <Vitals id={id} key={id} /> },
};
