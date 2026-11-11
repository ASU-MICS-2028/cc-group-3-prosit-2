import { useMemo, useRef, useState } from "react";
import { Chip, PrimaryButton, SecondaryButton } from "../components/buttons";
import { VitalCard } from "../components/clinical";
import { StateView } from "../components/display";
import { Icon } from "../components/icons";
import { Field } from "../components/inputs";
import { useSession } from "../auth/Session";
import { useData, useLoad } from "../data/DataProvider";
import { HEALER_DISCLAIMER, HealerStockError, healerStockApiFor, type Healer, type Referral, type StockItem } from "../data/healersStock";
import { consentPurpose, consentWithdrawnAt, newId, type GivenBy } from "../data/model";
import { listConsents, listPatients, recordConsent, withdrawConsent } from "../data/repo";
import { Heading, KV, Rows, type ScreenDef } from "./kit";

function useApi() {
  const { session } = useSession();
  return useMemo(() => healerStockApiFor(session!), [session]);
}
const Problem = ({ text }: { text?: string }) => (text ? <p role="alert" className="field-note has-error"><Icon name="warning" size="sm" />{text}</p> : null);
const say = (e: unknown) => (e instanceof HealerStockError ? e.message : "We couldn't do that. Please try again.");
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString([], { day: "numeric", month: "short" });
const STATUS: Record<Referral["status"], string> = { pending: "Waiting", accepted: "Accepted", completed: "Completed", declined: "Declined", cancelled: "Cancelled" };
const Disclaimer = () => <p className="caption">{HEALER_DISCLAIMER}</p>;
const SyntheticNote = () => <p className="caption">Synthetic directory: these healers are made-up examples for testing, not a register of certified healers.</p>;

/* ---------------- Directory and referral (CHV, doctor, nurse, specialist) ---------------- */

function ReferToHealer() {
  const api = useApi();
  const { userId, sync, notify } = useData();
  const [version, setVersion] = useState(0);
  const directory = useLoad(() => api.healers(), []);
  const patients = useLoad(() => listPatients(userId), []);
  const sent = useLoad(() => api.referrals(), [version]);
  const [healer, setHealer] = useState<Healer>();
  const [patientId, setPatientId] = useState<string>();
  const [reason, setReason] = useState("");
  const [givenBy, setGivenBy] = useState<GivenBy>("patient");
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);
  const idRef = useRef(newId());                                  // kept across a retry, so a lost reply can't send it twice
  const consents = useLoad(async () => (patientId ? listConsents(userId, patientId) : []), [patientId, version]);
  const active = consents.data?.map((c) => c.resource).find((c) => consentPurpose(c) === "healer_referral" && !consentWithdrawnAt(c));
  const patient = patients.data?.find((p) => p.resource.id === patientId);

  async function run(work: () => Promise<void>) {
    setBusy(true); setProblem(undefined);
    try { await work(); setVersion((v) => v + 1); } catch (e) { setProblem(say(e)); } finally { setBusy(false); }
  }
  const agree = () => run(async () => { await recordConsent(userId, patientId!, "healer_referral", givenBy); notify(); await sync(); });
  const withdraw = () => run(async () => { await withdrawConsent(userId, active!.id); notify(); await sync(); });
  const send = () => run(async () => {
    await sync();                                                  // the consent has to be on the server first
    await api.refer({ id: idRef.current, patient: { id: patientId!, name: patient!.resource.name[0].text }, healer: healer!, reason: reason.trim() });
    idRef.current = newId(); setReason(""); setPatientId(undefined); setHealer(undefined);
  });

  if (directory.error) return <StateView kind="error" text={directory.error} />;
  if (!directory.data) return <StateView kind="loading" text="Loading the directory…" />;
  return (<>
    <SyntheticNote />
    <Disclaimer />
    <Heading>Healers</Heading>
    <div className="stack">{directory.data.map((h) => <SecondaryButton key={h.id} onClick={() => setHealer(h)}>{`${h.name} · ${h.community ?? "?"} · ${h.practice ?? "Not stated"}${healer?.id === h.id ? " (chosen)" : ""}`}</SecondaryButton>)}</div>
    <Heading>Patient</Heading>
    {patients.loading ? <StateView kind="loading" text="Loading…" /> : (patients.data ?? []).length === 0
      ? <StateView kind="empty" text="No patients on this phone yet." />
      : <div className="row">{patients.data!.map((p) => <Chip key={p.resource.id} selected={p.resource.id === patientId} onClick={() => setPatientId(p.resource.id)}>{p.resource.name[0].text}</Chip>)}</div>}
    {patientId && (active ? (<>
      <p className="body-strong">Consent recorded for a healer referral.</p>
      <SecondaryButton disabled={busy} onClick={() => void withdraw()}>They changed their mind: withdraw</SecondaryButton>
    </>) : (<>
      <p>May we send your name and the reason below to this healer? You can say no, and you can change your mind at any time. Your care at the clinic stays the same.</p>
      <div className="row">{([["patient", "They agree"], ["guardian", "A guardian agrees"], ["chv_on_behalf", "I agree for them"]] as [GivenBy, string][]).map(([k, l]) => <Chip key={k} selected={givenBy === k} onClick={() => setGivenBy(k)}>{l}</Chip>)}</div>
      <PrimaryButton loading={busy} onClick={() => void agree()}>Record consent</PrimaryButton>
    </>))}
    <Field label="Reason for the referral" value={reason} onChange={(e) => setReason(e.target.value)} />
    <Problem text={problem} />
    <PrimaryButton disabled={!healer || !patient || !active || !reason.trim()} loading={busy} onClick={() => void send()}>Send to healer</PrimaryButton>
    <Heading>Sent and returned</Heading>
    {!sent.data ? <StateView kind="loading" text="Loading…" /> : sent.data.length === 0 ? <StateView kind="empty" text="No healer referrals yet." />
      : <Rows items={sent.data.map((r) => ({ name: r.patient.name, role: `${r.direction === "from_healer" ? `Back from ${r.from.name}` : `To ${r.to.name}`}: ${r.reason}${r.remedies ? ` · Remedies reported: ${r.remedies}` : ""}`, hours: STATUS[r.status] }))} />}
  </>);
}

/* ---------------- Healer ---------------- */

function HealerInbox({ view }: { view: "new" | "mine" }) {
  const api = useApi();
  const [version, setVersion] = useState(0);
  const list = useLoad(() => api.referrals(), [version]);
  const [remedies, setRemedies] = useState<Record<string, string>>({});
  const [back, setBack] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string>();
  async function act(work: () => Promise<unknown>) {
    setProblem(undefined);
    try { await work(); setVersion((v) => v + 1); } catch (e) { setProblem(say(e)); }
  }
  if (list.error) return <StateView kind="error" text={list.error} />;
  if (!list.data) return <StateView kind="loading" text="Loading referrals…" />;
  const items = list.data.filter((r) => r.direction === "to_healer" && (view === "new" ? r.status === "pending" : r.status === "accepted" || r.status === "completed"));
  return (<>
    <Disclaimer />
    <Problem text={problem} />
    {items.length === 0 && <StateView kind="empty" text={view === "new" ? "No new referrals." : "No patients yet."} />}
    {items.map((r) => (
      <section key={r.id} className="stack">
        <KV k="Patient (referred with consent)" v={r.patient.name} />
        <KV k="Reason" v={r.reason} />
        <KV k="From" v={r.from.name} />
        {view === "new" ? <div className="row">
          <PrimaryButton onClick={() => void act(() => api.answer(r.id, "accepted"))}>Accept</PrimaryButton>
          <SecondaryButton onClick={() => void act(() => api.answer(r.id, "declined"))}>Decline</SecondaryButton>
        </div> : <>
          {r.status === "accepted" && <>
            <Field label="Remedies in use (optional)" value={remedies[r.id] ?? ""} onChange={(e) => setRemedies({ ...remedies, [r.id]: e.target.value })} helper="Shared with who referred them. As told, not reviewed." />
            <PrimaryButton onClick={() => void act(() => api.answer(r.id, "completed", remedies[r.id]?.trim() || undefined))}>Mark finished</PrimaryButton>
          </>}
          <Field label="Why refer back to the clinic" value={back[r.id] ?? ""} onChange={(e) => setBack({ ...back, [r.id]: e.target.value })} />
          <SecondaryButton disabled={!back[r.id]?.trim()} onClick={() => void act(async () => { await api.referBack(r.id, newId(), back[r.id].trim()); setBack({ ...back, [r.id]: "" }); })}>Refer back to the clinic</SecondaryButton>
        </>}
      </section>))}
  </>);
}

/* ---------------- Stock (pharmacist, health centre admin) ---------------- */

const lowItems = (items: StockItem[]) => items.filter((i) => i.low);

function Stock() {
  const api = useApi();
  const [version, setVersion] = useState(0);
  const view = useLoad(() => api.stock(), [version]);
  const [item, setItem] = useState<StockItem>();
  const [counted, setCounted] = useState("");
  const [moved, setMoved] = useState("");
  const [to, setTo] = useState<string>();
  const [fresh, setFresh] = useState({ name: "", unit: "", quantity: "", reorder: "" });
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);
  const moveId = useRef(newId());
  const whole = (v: string) => /^\d+$/.test(v);

  async function run(work: () => Promise<unknown>, after: () => void) {
    setBusy(true); setProblem(undefined);
    try { await work(); after(); setVersion((v) => v + 1); } catch (e) { setProblem(say(e)); } finally { setBusy(false); }
  }
  if (view.error) return <StateView kind="error" text={view.error} />;
  if (!view.data) return <StateView kind="loading" text="Loading stock…" />;
  const { facility, items, facilities, lowElsewhere, transfers } = view.data;
  const low = lowItems(items);
  return (<>
    <p className="caption">{facility.name}. Stock figures are test data, not a real facility's.</p>
    {low.length > 0 && <p role="alert" className="field-note has-error"><Icon name="warning" size="sm" />Low stock: {low.map((i) => `${i.name} (${i.quantity} ${i.unit})`).join(", ")}</p>}
    <Heading>Levels</Heading>
    {items.length === 0 ? <StateView kind="empty" text="No stock recorded yet. Add an item below." /> : <div className="row">{items.map((i) => <Chip key={i.id} selected={item?.id === i.id} onClick={() => { setItem(i); setCounted(String(i.quantity)); setMoved(""); }}>{`${i.name}: ${i.quantity} ${i.unit}${i.low ? " (low)" : ""}`}</Chip>)}</div>}
    {item && (<>
      <Heading>{item.name}</Heading>
      <Field label="Counted now" inputMode="numeric" value={counted} onChange={(e) => setCounted(e.target.value)} helper={`Reorder at ${item.reorderLevel} ${item.unit}`} />
      <SecondaryButton disabled={!whole(counted) || busy} onClick={() => void run(() => api.stockTake({ name: item.name, unit: item.unit, quantity: Number(counted), reorderLevel: item.reorderLevel }), () => setItem(undefined))}>Save count</SecondaryButton>
      <Field label={`Move to another facility (${item.unit})`} inputMode="numeric" value={moved} onChange={(e) => setMoved(e.target.value)} />
      <div className="row">{facilities.map((f) => <Chip key={f.id} selected={to === f.id} onClick={() => setTo(f.id)}>{f.name}</Chip>)}</div>
      <PrimaryButton disabled={!whole(moved) || Number(moved) < 1 || !to} loading={busy} onClick={() => void run(() => api.moveStock({ id: moveId.current, itemId: item.id, toFacilityId: to!, quantity: Number(moved) }), () => { moveId.current = newId(); setItem(undefined); })}>Move stock</PrimaryButton>
    </>)}
    <Problem text={problem} />
    {lowElsewhere.length > 0 && <><Heading>Short elsewhere</Heading><Rows items={lowElsewhere.map((l) => ({ name: l.item, role: `${l.facility}: ${l.quantity} ${l.unit} left` }))} /></>}
    <Heading>Add an item</Heading>
    <Field label="Name" value={fresh.name} onChange={(e) => setFresh({ ...fresh, name: e.target.value })} />
    <Field label="Unit" value={fresh.unit} onChange={(e) => setFresh({ ...fresh, unit: e.target.value })} helper="e.g. tablets" />
    <div className="row">
      <Field label="Quantity" inputMode="numeric" value={fresh.quantity} onChange={(e) => setFresh({ ...fresh, quantity: e.target.value })} />
      <Field label="Reorder at" inputMode="numeric" value={fresh.reorder} onChange={(e) => setFresh({ ...fresh, reorder: e.target.value })} />
    </div>
    <SecondaryButton disabled={!fresh.name.trim() || !fresh.unit.trim() || !whole(fresh.quantity) || !whole(fresh.reorder) || busy} onClick={() => void run(() => api.stockTake({ name: fresh.name.trim(), unit: fresh.unit.trim(), quantity: Number(fresh.quantity), reorderLevel: Number(fresh.reorder) }), () => setFresh({ name: "", unit: "", quantity: "", reorder: "" }))}>Add item</SecondaryButton>
    <Heading>Moves</Heading>
    {transfers.length === 0 ? <StateView kind="empty" text="No moves yet." /> : <Rows items={transfers.map((t) => ({ name: `${t.quantity} ${t.unit} ${t.item}`, role: `${t.from.name} to ${t.to.name}, by ${t.movedBy}`, hours: fmtDay(t.at) }))} />}
  </>);
}

/** The facility home's real low-stock count. */
export function LowStockCard() {
  const api = useApi();
  const view = useLoad(() => api.stock(), []);
  if (!view.data) return <VitalCard label="Low stock" value="…" unit="" taken={view.error ? "Couldn't check" : "Checking"} />;
  const n = lowItems(view.data.items).length;
  return <VitalCard label="Low stock" value={String(n)} unit="items" taken={n ? "Open Stock to act" : "All above reorder level"} flag={n ? "check" : "normal"} />;
}

export const healerScreens: Record<string, ScreenDef> = {
  "chv.healers": { title: "Traditional healers", caption: "Synthetic directory", render: () => <ReferToHealer /> },
  "clinician.healers": { title: "Traditional healers", caption: "Synthetic directory", render: () => <ReferToHealer /> },
  "healer.home": { title: "Referrals", caption: "Only people who agreed", render: () => <HealerInbox view="new" /> },
  "healer.patients": { title: "Patients", caption: "Only people who agreed", render: () => <HealerInbox view="mine" /> },
  "pharmacist.stock": { title: "Stock", render: () => <Stock /> },
  "facility.stock": { title: "Stock", render: () => <Stock /> },
};
