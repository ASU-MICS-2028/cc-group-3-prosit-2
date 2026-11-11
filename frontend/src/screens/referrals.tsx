import { useEffect, useMemo, useRef, useState } from "react";
import { Chip, PrimaryButton, SecondaryButton, TextButton } from "../components/buttons";
import { EmergencyButton, EscalationTimeline, OfflineEmergencyActions, PriorityBadge, type Priority, type Step } from "../components/clinical";
import { PersonRow, StateView } from "../components/display";
import { Icon } from "../components/icons";
import { Field } from "../components/inputs";
import { ConfirmDialog } from "../components/nav";
import { useSession } from "../auth/Session";
import { EMERGENCY_NUMBER, SPECIALISTS } from "../config/people";
import { THRESHOLDS } from "../config/thresholds";
import { useData, useLoad } from "../data/DataProvider";
import { VITAL_BY_CODE, newId } from "../data/model";
import { CareError, DANGER_SIGNS, NO_CONNECTION, careApiFor, type CareEvent, type Emergency, type Referral, type Suggestion, type VitalReadings } from "../data/referrals";
import { getPatient, listObservations, listPatients } from "../data/repo";
import { toNumber, vitalProblem } from "../data/validate";
import { Heading, KV, TestMode, go, type ScreenDef } from "./kit";
import { t } from "../i18n";

type Family = "chv" | "clinician" | "facility" | "ghs";
const Alert = ({ children }: { children: React.ReactNode }) => <p role="alert" className="field-note has-error"><Icon name="warning" size="sm" />{typeof children === "string" ? t(children) : children}</p>;
const messageOf = (e: unknown) => (e instanceof CareError ? e.message : "We couldn't do that. Please try again.");
const isOffline = (e: unknown) => e instanceof CareError && e.code === "offline";
const when = (iso: string) => new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const PRIORITIES: Priority[] = ["emergency", "urgent", "soon", "routine"];
const POLL_MS = 20_000;
const openReferral = (family: Family, id: string) => (family === "chv" ? go("chv.referralDetail", id) : go("clinician.referralDetail", id));
const openEmergency: Record<Family, (id: string) => void> = {
  chv: (id) => go("chv.emergencyDetail", id), clinician: (id) => go("clinician.emergencyDetail", id),
  facility: (id) => go("facility.emergencyDetail", id), ghs: (id) => go("ghs.emergencyDetail", id),
};

function useCare() {
  const { session } = useSession();
  return useMemo(() => careApiFor(session!), [session]);
}
/** A number that goes up every so often, for useLoad to fetch again: escalation moves with the clock, not with taps. */
function usePoll() {
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), POLL_MS); return () => clearInterval(t); }, []);
  return tick;
}
const ModeNote = () => {
  const { session } = useSession();
  return session?.mode === "live" ? null : <TestMode what={t("This referral and emergency flow")} />;
};
const RulesNote = () => <p className="caption">{t("Example rules. {note}", { note: t(THRESHOLDS.note) })}</p>;

/** Offline, this is the whole of what the app can do, so it says so and gets out of the way. */
function CallOrSms({ noSignal, sms }: { noSignal: boolean; sms?: string }) {
  return (<>
    {noSignal && <Alert>{t("No signal. This app can't reach anyone right now. Call or text instead.")}</Alert>}
    {!noSignal && <p className="caption">{t("If there is no signal:")}</p>}
    <OfflineEmergencyActions number={EMERGENCY_NUMBER} {...(sms ? { body: sms } : {})} />
    <p className="caption">{t("Placeholder number for testing. The real emergency line has not been set.")}</p>
  </>);
}

function Messages({ events }: { events: CareEvent[] }) {
  if (events.length === 0) return null;
  return (<>
    <Heading>{t("Messages")}</Heading>
    {events.map((m, i) => <p key={i} className="caption">{m.notified ? `${t("To {name}", { name: t(m.notified) })}: ` : ""}{t(m.message)} · {when(m.at)}</p>)}
    <p className="caption">{t("Logged in this app only. No SMS was sent.")}</p>
  </>);
}

/* ---------------- Referring ---------------- */
export function Refer({ patientId, family }: { patientId?: string; family: "chv" | "clinician" }) {
  const { userId, online, sync } = useData();
  const care = useCare();
  const patients = useLoad(() => listPatients(userId));
  const sent = useLoad(() => care.referrals().then((all) => all.filter((r) => r.relation === "sent")).catch(() => [] as Referral[]));
  const [chosen, setChosen] = useState(patientId);
  const [to, setTo] = useState(SPECIALISTS[0].id);
  const [reason, setReason] = useState("");
  const [signs, setSigns] = useState<string[]>([]);
  const [vitals, setVitals] = useState({ systolic: "", diastolic: "", temperature: "" });
  const [suggestion, setSuggestion] = useState<Suggestion>();
  const [pick, setPick] = useState<Priority>();
  const [problem, setProblem] = useState<string>();
  const [noSignal, setNoSignal] = useState(false);
  const [busy, setBusy] = useState(false);
  const idRef = useRef(newId());                                  // kept across a retry, so a lost reply can't send it twice

  // Fill in the patient's newest readings, so the suggestion starts from what's already known.
  useEffect(() => {
    if (!chosen) return;
    void listObservations(userId, chosen).then((list) => {
      const latest: Record<string, string> = {};
      for (const o of [...list.map((v) => v.resource)].filter((r) => r.status !== "entered-in-error").sort((a, b) => b.effectiveDateTime.localeCompare(a.effectiveDateTime))) {
        const name = VITAL_BY_CODE[o.code.coding[0].code];
        if (name && !(name in latest)) latest[name] = String(o.valueQuantity.value);
      }
      setVitals((v) => ({ systolic: latest.systolic ?? v.systolic, diastolic: latest.diastolic ?? v.diastolic, temperature: latest.temperature ?? v.temperature }));
    }).catch(() => undefined);
  }, [chosen, userId]);

  const readings: VitalReadings = {};
  for (const name of ["systolic", "diastolic", "temperature"] as const) if (vitals[name] && !vitalProblem(name, vitals[name])) readings[name] = toNumber(vitals[name]) as number;
  const key = JSON.stringify([signs, readings]);
  useEffect(() => {
    const t = setTimeout(() => {
      care.suggest(signs, readings).then((s) => { setSuggestion(s); setNoSignal(false); }, (e: unknown) => { setSuggestion(undefined); setNoSignal(isOffline(e)); });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, care]);

  const patient = patients.data?.find((p) => p.resource.id === chosen);
  const target = SPECIALISTS.find((s) => s.id === to)!;
  const toggle = (id: string) => setSigns((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const set = (name: keyof typeof vitals) => (e: React.ChangeEvent<HTMLInputElement>) => setVitals((v) => ({ ...v, [name]: e.target.value }));
  const locked = suggestion?.priority === "emergency";
  const shown = locked ? "emergency" : pick ?? suggestion?.priority;

  async function send() {
    if (!patient) return;
    setProblem(undefined); setBusy(true);
    try {
      if (online) await sync().catch(() => null);                 // the server needs the patient and their consent first
      const done = await care.refer({
        id: idRef.current, patient: { id: patient.resource.id, name: patient.resource.name[0].text }, to: { id: target.id, name: target.name }, reason: reason.trim(),
        ...(pick && !locked ? { priority: pick } : {}), signs, vitals: readings,
      });
      idRef.current = newId();
      openReferral(family, done.id);
    } catch (e) {
      if (isOffline(e)) setNoSignal(true); else setProblem(messageOf(e));
    } finally { setBusy(false); }
  }

  return (<>
    {!patientId && <Heading>{t("Patient")}</Heading>}
    {patients.loading ? <StateView kind="loading" text={t("Loading…")} /> : (patients.data ?? []).length === 0
      ? <StateView kind="empty" text={t("No patients on this phone yet.")} />
      : <div className="row">{patients.data!.filter((p) => !patientId || p.resource.id === patientId).map((p) => <Chip key={p.resource.id} selected={p.resource.id === chosen} onClick={() => setChosen(p.resource.id)}>{p.resource.name[0].text}</Chip>)}</div>}
    <Field label={t("Reason")} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} helper={t("What's happening, in a few words")} />
    <Heading>{t("Danger signs")}</Heading>
    <div className="row">{DANGER_SIGNS.map((s) => <Chip key={s.id} selected={signs.includes(s.id)} onClick={() => toggle(s.id)}>{s.label}</Chip>)}</div>
    <div className="row">
      <Field label={t("Top BP")} inputMode="numeric" value={vitals.systolic} onChange={set("systolic")} error={vitalProblem("systolic", vitals.systolic) ?? undefined} />
      <Field label={t("Bottom BP")} inputMode="numeric" value={vitals.diastolic} onChange={set("diastolic")} error={vitalProblem("diastolic", vitals.diastolic) ?? undefined} />
      <Field label={t("Temperature")} inputMode="decimal" value={vitals.temperature} onChange={set("temperature")} error={vitalProblem("temperature", vitals.temperature) ?? undefined} />
    </div>
    <Heading>{t("Priority")}</Heading>
    {suggestion && <>
      <div className="row"><PriorityBadge priority={shown ?? suggestion.priority} /></div>
      <p className="caption">{t(suggestion.reason)}</p>
      <p className="caption">{t("{note}. You decide.", { note: t(suggestion.note) })}{locked ? " " + t("An emergency can't be lowered.") : ""}</p>
      {!locked && <div className="row">{PRIORITIES.map((p) => <Chip key={p} selected={p === shown} onClick={() => setPick(p)}>{p[0].toUpperCase() + p.slice(1)}</Chip>)}</div>}
    </>}
    <Heading>{t("Send to")}</Heading>
    <div className="row">{SPECIALISTS.map((s) => <Chip key={s.id} selected={s.id === to} onClick={() => setTo(s.id)}>{s.name}</Chip>)}</div>
    {problem && <Alert>{problem}</Alert>}
    {(noSignal || !online)
      ? <CallOrSms noSignal sms={`Referral for ${patient ? patient.resource.name[0].text : "a patient"}: ${reason.trim()}`} />
      : <PrimaryButton disabled={!patient || !reason.trim() || !suggestion} loading={busy} onClick={() => void send()}>{t("Send referral")}</PrimaryButton>}
    {family === "chv" && locked && <div className="stack"><EmergencyButton onClick={() => go("chv.emergency", chosen)} /></div>}
    <RulesNote />
    <ModeNote />
    {(sent.data ?? []).length > 0 && <>
      <Heading>{t("Referrals you sent")}</Heading>
      <div className="stack">{sent.data!.map((r) => <PersonRow key={r.id} name={r.patient.name} role={`${r.to} · ${r.status}`} hours={when(r.sentAt)} trailing={<PriorityBadge priority={r.priority} />} onClick={() => openReferral(family, r.id)} />)}</div>
    </>}
  </>);
}

const REFERRAL_ACTIONS: Record<string, string> = { accept: "Accept", decline: "Decline", complete: "Mark as done", cancel: "Cancel this referral" };

export function ReferralDetail({ id, family }: { id?: string; family: Family }) {
  const care = useCare();
  const { sync } = useData();
  const [bump, setBump] = useState(0);
  const [problem, setProblem] = useState<string>();
  const { data, error } = useLoad(() => care.referral(id!), [id, bump]);
  if (error) return <StateView kind="error" plain text={error} />;
  if (!data) return <StateView kind="loading" text={t("Loading…")} />;
  const act = async (action: string) => {
    setProblem(undefined);
    try { await care.actOnReferral(data.id, action); if (action === "accept") void sync(); setBump((n) => n + 1); } catch (e) { setProblem(messageOf(e)); }
  };
  return (<>
    <KV k={t("Patient")} v={data.patient.name} />
    <KV k={t("From")} v={data.from} />
    <KV k={t("To")} v={data.to} />
    <KV k={t("Status")} v={data.status} />
    <KV k={t("Reason")} v={data.reason} />
    <div className="row"><PriorityBadge priority={data.priority} /></div>
    <p className="caption">{data.priorityReason}</p>
    <p className="caption">{t("A suggestion from example rules, not a diagnosis.")}</p>
    {problem && <Alert>{problem}</Alert>}
    {data.actions.map((a) => a === "accept" ? <PrimaryButton key={a} onClick={() => void act(a)}>{REFERRAL_ACTIONS[a]}</PrimaryButton> : <SecondaryButton key={a} onClick={() => void act(a)}>{REFERRAL_ACTIONS[a]}</SecondaryButton>)}
    {family === "clinician" && (data.status === "accepted" || data.status === "completed") && data.relation === "received" && <SecondaryButton onClick={() => go("clinician.patient", data.patient.id)}>{t("Open patient record")}</SecondaryButton>}
    <Messages events={data.events ?? []} />
    <ModeNote />
  </>);
}

/* ---------------- Emergencies ---------------- */
const EMERGENCY_SIGNS = DANGER_SIGNS.filter((s) => s.tier === "emergency");
const LEVEL_LABEL = ["Raised", "Doctors notified", "Health centre admin notified", "Ghana Health Service notified"];

export function RaiseEmergency({ patientId }: { patientId?: string }) {
  const { userId, online } = useData();
  const care = useCare();
  const open = useLoad(() => care.emergencies().catch(() => [] as Emergency[]));
  const who = useLoad(() => (patientId ? getPatient(userId, patientId).then((p) => p.resource.name[0].text).catch(() => undefined) : Promise.resolve(undefined)), [patientId]);
  const [signs, setSigns] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [location, setLocation] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [failedOffline, setFailedOffline] = useState(false);
  const idRef = useRef(newId());
  const labels = EMERGENCY_SIGNS.filter((s) => signs.includes(s.id)).map((s) => s.label);
  const name = who.data;
  const description = [name ? `For ${name}:` : "", labels.join(", "), note.trim()].filter(Boolean).join(" ") || "Emergency: no details given";
  const noSignal = !online || failedOffline;

  async function raise() {
    setConfirm(false); setProblem(undefined); setBusy(true);
    try {
      const e = await care.raise({ id: idRef.current, description, ...(patientId ? { patientId } : {}), ...(location.trim() ? { location: location.trim() } : {}) });
      idRef.current = newId();
      go("chv.emergencyDetail", e.id);
    } catch (e) {
      if (isOffline(e)) setFailedOffline(true); else setProblem(messageOf(e));
    } finally { setBusy(false); }
  }

  return (<>
    {(open.data ?? []).length > 0 && <>
      <Heading>{t("Open emergencies")}</Heading>
      <div className="stack">{open.data!.map((e) => <PersonRow key={e.id} name={e.patient?.name ?? t("No patient linked")} role={e.description} hours={when(e.raisedAt)} trailing={<PriorityBadge priority="emergency" />} onClick={() => go("chv.emergencyDetail", e.id)} />)}</div>
    </>}
    {name && <KV k={t("Patient")} v={name} />}
    <Heading>{t("What is happening?")}</Heading>
    <div className="row">{EMERGENCY_SIGNS.map((s) => <Chip key={s.id} selected={signs.includes(s.id)} onClick={() => setSigns((all) => (all.includes(s.id) ? all.filter((x) => x !== s.id) : [...all, s.id]))}>{s.label}</Chip>)}</div>
    <Field label={t("Anything else (optional)")} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
    <Field label={t("Where (optional)")} value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200} helper={t("e.g. house behind the market")} />
    {problem && <Alert>{problem}</Alert>}
    {noSignal
      ? <CallOrSms noSignal sms={[description, location.trim()].filter(Boolean).join(" · ")} />
      : <>
        <div className="stack"><EmergencyButton disabled={busy} onClick={() => setConfirm(true)} /></div>
        {confirm && <ConfirmDialog title={t("Raise an emergency?")} body={t("It appears in nurses' apps now. If nobody answers, it goes further every 5 minutes. No SMS is sent. {description}", { description })}
          confirm={<PrimaryButton loading={busy} onClick={() => void raise()}>{t("Yes, raise it")}</PrimaryButton>} cancel={<SecondaryButton onClick={() => setConfirm(false)}>{t("Not now")}</SecondaryButton>} onClose={() => setConfirm(false)} />}
        <CallOrSms noSignal={false} sms={[description, location.trim()].filter(Boolean).join(" · ")} />
      </>}
    <ModeNote />
  </>);
}

const ACTION_LABEL: Record<string, string> = { acknowledge: "I'm on it", resolve: "Mark as resolved", cancel: "Cancel: false alarm" };
const STEP_LABEL: Record<string, string> = { acknowledged: "Acknowledged", resolved: "Resolved", cancelled: "Cancelled" };

export function EmergencyDetail({ id, family }: { id?: string; family: Family }) {
  const care = useCare();
  const tick = usePoll();
  const [bump, setBump] = useState(0);
  const [problem, setProblem] = useState<string>();
  const { data, error } = useLoad(() => care.emergency(id!), [id, tick, bump]);
  const last = useRef<Emergency | undefined>(undefined);
  if (data) last.current = data;
  const e = data ?? last.current;
  if (!e) return error ? <><StateView kind="error" plain text={error} /><CallOrSms noSignal={false} /></> : <StateView kind="loading" text={t("Loading…")} />;
  const act = async (action: string) => {
    setProblem(undefined);
    try { await care.actOnEmergency(e.id, action); setBump((n) => n + 1); } catch (x) { setProblem(messageOf(x)); }
  };
  const steps: Step[] = (e.events ?? []).map((s) => ({
    label: s.kind === "raised" ? "Raised" : s.kind === "escalated" ? LEVEL_LABEL[s.level ?? 0] : STEP_LABEL[s.kind] ?? s.kind,
    who: s.kind === "escalated" ? s.notified ?? undefined : s.who ?? undefined, time: clock(s.at), state: "done",
  }));
  if (e.status === "raised") steps.push({ label: "Acknowledged", state: "waiting" });
  if (e.nextEscalationAt) steps.push({ label: "Next escalation", who: "If nobody answers", time: clock(e.nextEscalationAt), state: "todo" });
  return (<>
    <KV k={t("What")} v={e.description} />
    {e.location && <KV k={t("Where")} v={e.location} />}
    <KV k={t("Raised by")} v={e.raisedBy} />
    <EscalationTimeline steps={steps} />
    {problem && <Alert>{problem}</Alert>}
    {e.actions.map((a) => a === "acknowledge" ? <PrimaryButton key={a} onClick={() => void act(a)}>{ACTION_LABEL[a]}</PrimaryButton> : <SecondaryButton key={a} onClick={() => void act(a)}>{ACTION_LABEL[a]}</SecondaryButton>)}
    {family === "clinician" && <TextButton onClick={() => go("clinician.call")}>{t("Start a call")}</TextButton>}
    <CallOrSms noSignal={error === NO_CONNECTION} sms={e.description} />
    <Messages events={e.events ?? []} />
    <RulesNote />
    <ModeNote />
  </>);
}

/* ---------------- Inbox ---------------- */
export function Inbox({ family, referrals }: { family: Family; referrals: boolean }) {
  const care = useCare();
  const tick = usePoll();
  const { data, error } = useLoad(async () => ({
    emergencies: await care.emergencies(),
    referrals: referrals ? (await care.referrals()).filter((r) => r.relation === "received") : [],
  }), [tick]);
  if (error) return <><StateView kind="error" plain text={error} /><CallOrSms noSignal={error === NO_CONNECTION} /></>;
  if (!data) return <StateView kind="loading" text={t("Loading…")} />;
  const empty = data.emergencies.length === 0 && data.referrals.length === 0;
  return (<>
    {empty && <StateView kind="empty" text={t("Nothing waiting for you.")} />}
    <div className="stack">
      {data.emergencies.map((e) => <PersonRow key={e.id} name={e.patient?.name ?? t("No patient linked")} role={t("Emergency · {state} · {description}", { state: e.status === "raised" ? t("not acknowledged, level {level}", { level: e.level }) : t("with {name}", { name: e.acknowledgedBy ?? "" }), description: e.description })} hours={when(e.raisedAt)} trailing={<PriorityBadge priority="emergency" />} onClick={() => openEmergency[family](e.id)} />)}
      {data.referrals.map((r) => <PersonRow key={r.id} name={r.patient.name} role={t("Referral · {reason}", { reason: r.reason })} hours={when(r.sentAt)} trailing={<PriorityBadge priority={r.priority} />} onClick={() => openReferral(family, r.id)} />)}
    </div>
    {family === "clinician" && <SecondaryButton onClick={() => go("clinician.refer")}>{t("Refer a patient")}</SecondaryButton>}
    <p className="caption">{t("Priorities are suggestions from example rules, not diagnoses.")}</p>
    <ModeNote />
  </>);
}

export const careScreens: Record<string, ScreenDef> = {
  "chv.referral": { title: "Refer a patient", render: (id) => <Refer patientId={id} family="chv" key={id ?? "pick"} /> },
  "chv.referralDetail": { title: "Referral", render: (id) => <ReferralDetail id={id} family="chv" key={id} /> },
  "chv.emergency": { title: "Emergency", render: (id) => <RaiseEmergency patientId={id} key={id ?? "none"} /> },
  "chv.emergencyDetail": { title: "Emergency", render: (id) => <EmergencyDetail id={id} family="chv" key={id} /> },
  "clinician.inbox": { title: "Referrals & emergencies", caption: "Most urgent first", render: () => (<><Inbox family="clinician" referrals /><SecondaryButton onClick={() => go("clinician.healers")}>{t("Traditional healers")}</SecondaryButton></>) },
  "clinician.refer": { title: "Refer a patient", render: () => <Refer family="clinician" /> },
  "clinician.referralDetail": { title: "Referral", render: (id) => <ReferralDetail id={id} family="clinician" key={id} /> },
  "clinician.emergencyDetail": { title: "Emergency", render: (id) => <EmergencyDetail id={id} family="clinician" key={id} /> },
  "facility.emergencies": { title: "Escalated emergencies", caption: "Most urgent first", render: () => <Inbox family="facility" referrals={false} /> },
  "facility.emergencyDetail": { title: "Emergency", render: (id) => <EmergencyDetail id={id} family="facility" key={id} /> },
  "ghs.emergencies": { title: "Escalated emergencies", caption: "Most urgent first", render: () => <Inbox family="ghs" referrals={false} /> },
  "ghs.emergencyDetail": { title: "Emergency", render: (id) => <EmergencyDetail id={id} family="ghs" key={id} /> },
};
