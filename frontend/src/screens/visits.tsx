import { useState } from "react";
import { PrimaryButton, SecondaryButton, TextButton } from "../components/buttons";
import { PersonRow, StateView, SyncBadge } from "../components/display";
import { Icon } from "../components/icons";
import { ConfirmDialog } from "../components/nav";
import { DateStrip, TimeSlots } from "../components/schedule";
import { useSession } from "../auth/Session";
import { useData, useLoad } from "../data/DataProvider";
import { RepoError, bookAppointment, cancelAppointment, listAppointments, listPatients, reminderStatus, type View } from "../data/repo";
import { appointmentPatientId, appointmentCallCode, type Appointment } from "../data/model";
import { AVAILABILITY, SPECIALISTS, dayStartUtc, slotsForDay } from "../config/people";
import { Heading, Tiles, go, type ScreenDef } from "./kit";
import { PatientDetail } from "./chvData";
import { t } from "../i18n";

const Alert = ({ children }: { children: React.ReactNode }) => <p role="alert" className="field-note has-error"><Icon name="warning" size="sm" />{typeof children === "string" ? t(children) : children}</p>;
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
const tzName = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/* ---------------- Book ---------------- */
function Book({ patientId }: { patientId?: string }) {
  const { userId, api, online, notify, sync } = useData();
  const patients = useLoad(() => listPatients(userId));
  const [dayKey, setDayKey] = useState<string>();
  const [slot, setSlot] = useState<string>();
  const [specialistId, setSpecialistId] = useState(SPECIALISTS[0].id);
  const [problem, setProblem] = useState<{ text: string; consent: boolean }>();
  const [busy, setBusy] = useState(false);
  const now = new Date();
  const days = Array.from({ length: AVAILABILITY.daysAhead }, (_, i) => dayStartUtc(now, i)).filter((d) => slotsForDay(d).length > 0);
  const day = days.find((d) => d.toISOString() === dayKey) ?? days[0];
  const specialist = SPECIALISTS.find((x) => x.id === specialistId)!;

  // Times already taken: what this phone knows, plus what the server says when there is a signal.
  const taken = useLoad(async () => {
    const local = (await listAppointments(userId)).map((v) => v.resource).filter((a) => a.status === "booked" && a.participant[1].actor.reference === `Practitioner/${specialistId}`).map((a) => ({ start: a.start, end: a.end }));
    let remote: { start: string; end: string }[] = [];
    let checked = false;
    if (online && api.taken) { try { remote = await api.taken(specialistId, day.toISOString(), new Date(day.getTime() + 86_400_000).toISOString()); checked = true; } catch { /* offline: use what we know */ } }
    return { list: [...local, ...remote], checked };
  }, [specialistId, day.toISOString(), online]);

  if (!patientId) {
    if (!patients.data) return <StateView kind="loading" text={t("Opening saved records…")} />;
    return patients.data.length === 0 ? <StateView kind="empty" text={t("Add a patient first.")} action={<PrimaryButton onClick={() => go("chv.register")}>{t("Add patient")}</PrimaryButton>} /> : (<>
      <p className="body-strong">{t("Who is the visit for?")}</p>
      <div className="stack">{patients.data.map((v) => <PersonRow key={v.resource.id} name={v.resource.name[0].text} role={v.resource.address?.[0].city ?? "Patient"} onClick={() => go("chv.book", v.resource.id)} />)}</div>
    </>);
  }

  const isTaken = (iso: string) => {
    const end = new Date(new Date(iso).getTime() + AVAILABILITY.slotMinutes * 60_000).toISOString();
    return (taken.data?.list ?? []).some((t) => t.start < end && iso < t.end);
  };
  const slots = slotsForDay(day).map((iso) => ({ iso, time: fmtTime(iso), unavailable: new Date(iso) <= now || isTaken(iso) }));
  const label = (d: Date) => new Date(d.getTime() + 12 * 3_600_000);
  const stripDays = days.map((d) => ({ key: d.toISOString(), weekday: label(d).toLocaleDateString([], { weekday: "narrow" }), date: label(d).getDate() }));

  async function book() {
    if (busy || !slot) return;
    setBusy(true); setProblem(undefined);
    try {
      await bookAppointment(userId, { patientId: patientId!, specialistId, specialistName: specialist.name, start: new Date(slot) });
      notify(); void sync(); go("chv.visits");
    } catch (e) {
      const r = e instanceof RepoError ? e : undefined;
      setProblem({ text: r?.message ?? "We couldn't book that. Please try again.", consent: r?.code === "consent-required" || r?.code === "consent-withdrawn" });
      setBusy(false);
    }
  }

  return (<>
    {!taken.loading && !taken.data?.checked && (
      <div className="notice" role="status">
        <Icon name="cloud-slash" size="sm" />
        <div className="stack">
          <span className="body-strong">{online ? t("We couldn't check which times are free.") : t("You're offline.")}</span>
          <span className="caption">{t("We'll check the times are still free when you have a signal. If someone else took your time, the visit will show \"Needs attention\" and you can choose another.")}</span>
        </div>
      </div>
    )}
    <PersonRow name={specialist.name} role={t(specialist.title)} hours={t("30-minute video visit")} />
    <DateStrip days={stripDays} selected={day.toISOString()} onSelect={(k) => { setDayKey(k); setSlot(undefined); }} />
    <TimeSlots slots={slots} selected={slots.find((s) => s.iso === slot)?.time} onSelect={(t) => setSlot(slots.find((s) => s.time === t)?.iso)} />
    <p className="caption">{t("Times are shown in this phone's time zone ({tzName}).", { tzName: tzName() })}</p>
    {slot && <p className="body-strong">{fmtDay(slot)}, {fmtTime(slot)}</p>}
    {problem && <><Alert>{problem.text}</Alert>{problem.consent && <SecondaryButton onClick={() => go("chv.consent", patientId)}>{t("Ask for permission")}</SecondaryButton>}</>}
    <PrimaryButton loading={busy} disabled={!slot} onClick={book}>{t("Book visit")}</PrimaryButton>
  </>);
}

/* ---------------- Visits list ---------------- */
function Reminder({ patientId }: { patientId: string }) {
  const { userId } = useData();
  const { data } = useLoad(() => reminderStatus(userId, patientId), [patientId]);
  if (!data) return null;
  return <span className="caption">{data === "scheduled" ? t("SMS reminder will be sent (test mode)") : data === "no-phone" ? t("No reminder: no phone number") : t("No reminder: no permission for SMS")}</span>;
}

function VisitCard({ v, onCancel, forDoctor }: { v: View<Appointment>; onCancel?: (id: string) => void; forDoctor?: boolean }) {
  const a = v.resource;
  const pid = appointmentPatientId(a);
  const cancelled = a.status === "cancelled";
  return (
    <div className="person visit-card">
      <span className="person-text">
        <span className="person-name">{a.participant[0].actor.display ?? t("Patient")}</span>
        <span className="caption tabular">{fmtDay(a.start)}, {fmtTime(a.start)}</span>
        <span className="caption">{forDoctor ? t("Video visit") : t("Video visit with {doctor}", { doctor: a.participant[1].actor.display ?? t("the doctor") })}</span>
        {!cancelled && !forDoctor && <Reminder patientId={pid} />}
      </span>
      {cancelled ? <span className="badge prio-routine">{t("Cancelled")}</span> : v.syncState === "attention" ? <SyncBadge status="attention" /> : <SyncBadge status={v.syncState} />}
      <div className="row visit-actions">
        {!cancelled && <SecondaryButton onClick={() => go(forDoctor ? "clinician.call" : "chv.call", appointmentCallCode(a.id))}><Icon name="video-camera" size="sm" />{" "}{t("Join call")}</SecondaryButton>}
        {v.syncState === "attention" && <SecondaryButton onClick={() => go("conflict", a.id)}>{t("See what happened")}</SecondaryButton>}
        {!cancelled && !forDoctor && onCancel && <TextButton onClick={() => onCancel(a.id)}>{t("Cancel visit")}</TextButton>}
      </div>
    </div>
  );
}

function Visits({ doctor }: { doctor?: boolean }) {
  const { userId, notify, sync } = useData();
  const { data, error, loading } = useLoad(() => listAppointments(userId));
  const [confirm, setConfirm] = useState<string | null>(null);
  const [problem, setProblem] = useState<string>();
  if (!data) return error ? <StateView kind="error" plain text={error} /> : loading ? <StateView kind="loading" text={t("Opening saved records…")} /> : null;
  const cutoff = Date.now() - 60 * 60_000;
  const upcoming = data.filter((v) => v.resource.status === "booked" && new Date(v.resource.end).getTime() > cutoff);
  const others = data.filter((v) => !upcoming.includes(v)).reverse();

  async function cancel() {
    if (!confirm) return;
    try { await cancelAppointment(userId, confirm); notify(); void sync(); } catch (e) { setProblem(e instanceof RepoError ? e.message : "We couldn't cancel that."); }
    setConfirm(null);
  }
  return (<>
    {problem && <Alert>{problem}</Alert>}
    {confirm && (() => {
      const a = data.find((v) => v.resource.id === confirm)?.resource;
      return (
        <ConfirmDialog
          title={t("Cancel this visit?")}
          onClose={() => setConfirm(null)}
          body={<>
            {a && <p className="body-strong">{a.participant[0].actor.display ?? t("Patient")}</p>}
            {a && <p className="caption tabular">{t("{day}, {time} with {doctor}", { day: fmtDay(a.start), time: fmtTime(a.start), doctor: a.participant[1].actor.display ?? t("the doctor") })}</p>}
            <p>{t("The time is freed for someone else. The visit stays in the list, marked as cancelled.")}</p>
          </>}
          confirm={<PrimaryButton onClick={cancel}>{t("Yes, cancel the visit")}</PrimaryButton>}
          cancel={<SecondaryButton onClick={() => setConfirm(null)}>{t("Keep the visit")}</SecondaryButton>}
        />
      );
    })()}
    <Heading>{t("Coming up")}</Heading>
    {upcoming.length === 0 ? <StateView kind="empty" text={doctor ? t("No visits are booked with you yet.") : t("No visits booked.")} action={doctor ? undefined : <PrimaryButton onClick={() => go("chv.book")}>{t("Book a visit")}</PrimaryButton>} />
      : <div className="stack">{upcoming.map((v) => <VisitCard key={v.resource.id} v={v} forDoctor={doctor} onCancel={setConfirm} />)}</div>}
    {!doctor && upcoming.length > 0 && <PrimaryButton onClick={() => go("chv.book")}>{t("Book another visit")}</PrimaryButton>}
    {others.length > 0 && <><Heading>{t("Earlier and cancelled")}</Heading><div className="stack">{others.map((v) => <VisitCard key={v.resource.id} v={v} forDoctor={doctor} />)}</div></>}
  </>);
}

/* ---------------- Doctor ---------------- */
function DoctorPatients() {
  const { userId } = useData();
  const { data, error, loading } = useLoad(() => listPatients(userId));
  if (!data) return error ? <StateView kind="error" plain text={error} /> : loading ? <StateView kind="loading" text={t("Opening saved records…")} /> : null;
  return data.length === 0 ? <StateView kind="empty" text={t("Patients appear here once a visit is booked with you.")} /> : (
    <div className="stack">{data.map((v) => <PersonRow key={v.resource.id} name={v.resource.name[0].text} role={v.resource.address?.[0].city ?? "Patient"} onClick={() => go("clinician.patient", v.resource.id)} />)}</div>
  );
}

function DoctorToday() {
  const { userId, sync, online } = useData();
  const { user } = useSession();
  const { data } = useLoad(() => listAppointments(userId));
  const [busy, setBusy] = useState(false);
  const upcoming = (data ?? []).filter((v) => v.resource.status === "booked" && new Date(v.resource.end).getTime() > Date.now() - 60 * 60_000);
  return (<>
    <div className="row">
      <SecondaryButton disabled={!online || busy} onClick={async () => { setBusy(true); await sync(); setBusy(false); }}>{busy ? t("Checking…") : t("Check for new visits")}</SecondaryButton>
      {!online && <span className="caption">{t("You're offline. Showing what is saved on this phone.")}</span>}
    </div>
    <SecondaryButton onClick={() => go("clinician.recordings")}>{t("Recorded visits")}</SecondaryButton>
    <Heading>{t("Visits booked with you")}</Heading>
    {upcoming.length === 0 ? <StateView kind="empty" text={t("No visits yet, {name}. New bookings appear here.", { name: user?.name.split(" ")[0] ?? "" })} /> : (
      <div className="stack">{upcoming.map((v) => (
        <div key={v.resource.id}>
          <PersonRow name={v.resource.participant[0].actor.display ?? "Patient"} role={`${fmtDay(v.resource.start)}, ${fmtTime(v.resource.start)}`} onClick={() => go("clinician.patient", appointmentPatientId(v.resource))} trailing={<SyncBadge status={v.syncState} />} />
          <div className="row visit-actions"><SecondaryButton onClick={() => go("clinician.call", appointmentCallCode(v.resource.id))}>{t("Join call")}</SecondaryButton></div>
        </div>
      ))}</div>
    )}
    <Tiles items={[{ icon: "baby", label: "Mothers & babies", to: "clinician.maternal" }, { icon: "chat-circle-text", label: "Symptom check", to: "clinician.symptoms" }]} />
  </>);
}

export const visitScreens: Record<string, ScreenDef> = {
  "chv.care": { title: "Care", render: () => (<><Tiles items={[{ icon: "calendar-check", label: "Book a visit", to: "chv.book" }, { icon: "users", label: "Referrals", to: "chv.referral" }, { icon: "users", label: "Healers", to: "chv.healers" }, { icon: "users", label: "Emergencies", to: "chv.emergency" }]} /><Visits /></>) },
  "chv.book": { title: "Book a visit", render: (id) => <Book patientId={id} key={id ?? "pick"} /> },
  "chv.visits": { title: "Visits", render: () => <Visits /> },
  "clinician.today": { title: "Hi Dr. Mensah", caption: "Visits booked with you", render: () => <DoctorToday /> },
  "clinician.patients": { title: "Patients", render: () => <DoctorPatients /> },
  "clinician.patient": { title: "Patient", caption: "Read only", render: (id) => <PatientDetail id={id} readOnly key={id} /> },
};
