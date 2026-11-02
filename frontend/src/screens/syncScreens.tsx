import { useState } from "react";
import { PrimaryButton, SecondaryButton, Chip } from "../components/buttons";
import { PersonRow, StateView, SyncBadge } from "../components/display";
import { Icon } from "../components/icons";
import { useData, useLoad } from "../data/DataProvider";
import { listActivity } from "../data/repo";
import { cancelRejected, conflictOf, rejectedOf, resolveConflict } from "../data/sync";
import type { Appointment, Consent, Resource } from "../data/model";
import { SPECIALISTS, dayStartUtc, slotsForDay } from "../config/people";
import { Heading, go, type ScreenDef } from "./kit";

function SyncScreen() {
  const { userId, sync, online, simulatedOffline, setSimulatedOffline, server, notify, lastSync } = useData();
  const { data, error } = useLoad(() => listActivity(userId));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string>();
  const waiting = data?.filter((a) => a.syncState === "saved" || a.syncState === "sending").length ?? 0;

  async function send() {
    setBusy(true);
    const r = await sync();
    setBusy(false);
    setNote(!r ? "Couldn't send. Your records are safe on this phone." : r.offline ? "No signal. Your records are safe on this phone and will be sent later." : r.sent + r.conflicts === 0 ? "Nothing to send." : `${r.sent} sent${r.conflicts ? `, ${r.conflicts} need your attention` : ""}.`);
  }
  /** Edits a permission on the "server" as if another phone had. Then withdrawing that permission here makes a clash. */
  function pretendOtherPhone() {
    const entry = [...server.store].find(([, v]) => v.resource.resourceType === "Consent");
    if (!entry) return setNote("Send a patient with a permission first, then try this.");
    server.editElsewhere(entry[0], (r) => ({ ...(r as Consent), performer: [{ display: (r as Consent).performer[0].display === "guardian" ? "patient" : "guardian" }] }));
    setNote("Pretended another phone edited a permission. Now open that patient, press Withdraw, then Send now.");
  }

  /** Puts a booking by "someone else" on the server at the first free time, so a clash can be tried on one phone. */
  function pretendOtherBooking() {
    const now = new Date();
    const doctor = SPECIALISTS[0];
    const busy = [...server.store.values()].map((x) => x.resource).filter((r): r is Appointment => r.resourceType === "Appointment" && r.status === "booked");
    for (let d = 0; d < 8; d++) {
      for (const iso of slotsForDay(dayStartUtc(now, d))) {
        const end = new Date(new Date(iso).getTime() + 30 * 60_000).toISOString();
        if (new Date(iso) <= now || busy.some((a) => a.start < end && iso < a.end)) continue;
        const a: Appointment = { resourceType: "Appointment", id: crypto.randomUUID(), status: "booked", start: iso, end, participant: [{ actor: { reference: "Patient/another-phone", display: "Another patient" }, status: "accepted" }, { actor: { reference: `Practitioner/${doctor.id}`, display: doctor.name }, status: "accepted" }] };
        server.store.set(a.id, { version: 1, resource: a, owner: "another-phone", patientId: null });
        return setNote(`Pretended another phone booked ${doctor.name} on ${new Date(iso).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}. Turn "Pretend I'm offline" on, book that time, then turn it off.`);
      }
    }
    setNote("No free time found this week.");
  }

  return (<>
    <div className="row">
      <SyncBadge status={waiting > 0 ? "saved" : "sent"} />
      <span className="caption">{online ? "Connected" : simulatedOffline ? "Pretending to be offline" : "No signal"}</span>
    </div>
    <PrimaryButton loading={busy} disabled={waiting === 0 && online} onClick={send}>Send now</PrimaryButton>
    {note && <p role="status" className="caption">{note}</p>}
    {lastSync?.offline && <p className="caption">Last try: no signal.</p>}
    {error && <StateView kind="error" plain text={error} />}
    <Heading>Your records</Heading>
    {data && data.length === 0 && <StateView kind="empty" text="Nothing saved on this phone yet." />}
    <div className="stack">
      {data?.map((a) => <PersonRow key={a.id} name={a.label} role={new Date(a.updatedAt).toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} trailing={<SyncBadge status={a.syncState} />} onClick={a.syncState === "attention" ? () => go("conflict", a.id) : undefined} />)}
    </div>
    <Heading>Test tools</Heading>
    <p className="caption">For testing only. Not part of the real app.</p>
    <div className="row">
      <Chip selected={simulatedOffline} onClick={() => setSimulatedOffline(!simulatedOffline)}>Pretend I'm offline</Chip>
      <SecondaryButton onClick={pretendOtherPhone}>Pretend another phone edited a permission</SecondaryButton>
      <SecondaryButton onClick={pretendOtherBooking}>Pretend another phone booked the first free time</SecondaryButton>
      <SecondaryButton onClick={() => { server.loseNextReply = true; setNote("The next send will reach the server, but the reply will be lost. Add a patient and press Send now."); }}>Lose the next reply</SecondaryButton>
      <SecondaryButton onClick={() => { server.clear(); notify(); setNote("The test server was emptied."); }}>Empty the test server</SecondaryButton>
    </div>
  </>);
}

/** Flattens two records so the differences can be listed field by field. */
function flat(v: unknown, path = ""): Record<string, string> {
  if (v === null || typeof v !== "object") return { [path]: String(v) };
  const out: Record<string, string> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) Object.assign(out, flat(x, path ? `${path}.${k}` : k));
  return out;
}
const human = (p: string) => p.replace(/\.(\d+)/g, "").replace(/\./g, " › ").replace(/^name › text$/, "Name").replace(/^address › city$/, "Village");

const REJECTED: Record<string, string> = { "slot-taken": "Someone else booked that time first, so this visit was not made. Nothing else was lost." };

/** A booking the server refused for good: the person chooses another time or cancels. */
function Rejected({ id, reason, patientId }: { id: string; reason: string; patientId: string | null }) {
  const { userId, notify, sync } = useData();
  const [busy, setBusy] = useState(false);
  const done = async (next: () => void) => { setBusy(true); await cancelRejected(userId, id); notify(); void sync(); next(); };
  return (<>
    <p>{REJECTED[reason] ?? "The server could not accept this."}</p>
    <PrimaryButton loading={busy} onClick={() => done(() => go("chv.book", patientId ?? undefined))}>Choose another time</PrimaryButton>
    <SecondaryButton disabled={busy} onClick={() => done(() => go("chv.visits"))}>Cancel this visit</SecondaryButton>
  </>);
}

function Conflict({ id }: { id?: string }) {
  const { userId, sync, notify } = useData();
  const refused = useLoad(() => (id ? rejectedOf(userId, id) : Promise.resolve(null)), [id]);
  const { data, error, loading } = useLoad(() => (id ? conflictOf(userId, id) : Promise.resolve(null)), [id]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  if (error) return <StateView kind="error" plain text={error} />;
  if (loading || refused.loading) return <StateView kind="loading" text="Opening…" />;
  if (refused.data && id) {
    const res = refused.data.resource;
    return <Rejected id={id} reason={refused.data.reason} patientId={res.resourceType === "Appointment" ? res.participant[0].actor.reference.replace("Patient/", "") : null} />;
  }
  if (!data || !id) return <StateView kind="empty" plain text="Nothing needs your attention here." action={<SecondaryButton onClick={() => go("sync")}>Back to sending</SecondaryButton>} />;

  const a = flat(data.mine as Resource), b = flat(data.theirs as Resource);
  const diffs = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k]);

  async function choose(choice: "mine" | "theirs") {
    if (busy) return;
    setBusy(true);
    try {
      await resolveConflict(userId, id!, choice);
      notify();
      if (choice === "mine") void sync();
      go("sync");
    } catch (e) { setProblem(e instanceof Error ? e.message : "We couldn't save your choice."); setBusy(false); }
  }
  return (<>
    <p>Two versions of this record are different. Nothing was lost. Choose which one to keep.</p>
    {diffs.map((k) => (
      <div className="kv" key={k}>
        <span className="body-strong">{human(k)}</span>
        <span style={{ textAlign: "right" }}><span className="caption">This phone: </span>{a[k] ?? "(empty)"}<br /><span className="caption">Other: </span>{b[k] ?? "(empty)"}</span>
      </div>
    ))}
    {problem && <p role="alert" className="field-note has-error"><Icon name="warning" size="sm" />{problem}</p>}
    <PrimaryButton loading={busy} onClick={() => choose("mine")}>Keep the version on this phone</PrimaryButton>
    <SecondaryButton disabled={busy} onClick={() => choose("theirs")}>Use the other version</SecondaryButton>
  </>);
}

export const syncScreens: Record<string, ScreenDef> = {
  sync: { title: "Waiting to send", render: () => <SyncScreen /> },
  conflict: { title: "Needs attention", render: (id) => <Conflict id={id} key={id} /> },
};
