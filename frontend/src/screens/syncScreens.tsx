import { useState } from "react";
import { PrimaryButton, SecondaryButton, Chip } from "../components/buttons";
import { PersonRow, StateView, SyncBadge } from "../components/display";
import { Icon } from "../components/icons";
import { useData, useLoad } from "../data/DataProvider";
import { listActivity } from "../data/repo";
import { conflictOf, resolveConflict } from "../data/sync";
import type { Consent, Resource } from "../data/model";
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
      <SecondaryButton onClick={() => { server.loseNextReply = true; setNote("The next send will reach the server, but the reply will be lost. Add a patient and press Send now."); }}>Lose the next reply</SecondaryButton>
      <SecondaryButton onClick={() => { server.store.clear(); localStorage.removeItem("hc.mock.server.v1"); notify(); setNote("The test server was emptied."); }}>Empty the test server</SecondaryButton>
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

function Conflict({ id }: { id?: string }) {
  const { userId, sync, notify } = useData();
  const { data, error, loading } = useLoad(() => (id ? conflictOf(userId, id) : Promise.resolve(null)), [id]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  if (error) return <StateView kind="error" plain text={error} />;
  if (loading) return <StateView kind="loading" text="Opening…" />;
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
