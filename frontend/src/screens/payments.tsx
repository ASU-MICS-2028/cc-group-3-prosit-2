import { useEffect, useMemo, useRef, useState } from "react";
import { Chip, PrimaryButton, SecondaryButton } from "../components/buttons";
import { StateView } from "../components/display";
import { Icon } from "../components/icons";
import { PhoneField } from "../components/inputs";
import { useSession } from "../auth/Session";
import { useData, useLoad } from "../data/DataProvider";
import { listAppointments } from "../data/repo";
import { newId } from "../data/model";
import { NETWORKS, PayError, cedis, payApiFor, type Network, type Payment } from "../data/payments";
import { ghanaPhone } from "../data/validate";
import { Heading, KV } from "./kit";

const Alert = ({ children }: { children: React.ReactNode }) => <p role="alert" className="field-note has-error"><Icon name="warning" size="sm" />{children}</p>;
const POLL_MS = 2_000;
const LABEL: Record<Payment["status"], string> = { pending: "Waiting for approval", successful: "Paid", failed: "Failed" };
const WHAT: Record<Payment["purpose"], string> = { consultation_fee: "Consultation fee", insurance_premium: "Insurance premium" };
const when = (iso: string) => new Date(iso).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });

export function usePay() {
  const { session } = useSession();
  return useMemo(() => payApiFor(session!), [session]);
}

/** Network and number, then waits for the outcome. Used for the fee and for insurance premiums. */
export function PayForm({ purpose, subjectId, amount, onDone }: { purpose: Payment["purpose"]; subjectId: string; amount: number; onDone?: (p: Payment) => void }) {
  const pay = usePay();
  const [network, setNetwork] = useState<Network>();
  const [phone, setPhone] = useState("");
  const [problem, setProblem] = useState<string>();
  const [payment, setPayment] = useState<Payment>();
  const [busy, setBusy] = useState(false);
  const idRef = useRef(newId());                                  // kept across a retry, so a lost reply can't charge twice
  const checked = ghanaPhone(phone);
  const e164 = checked.digits && !checked.problem ? `+233${checked.digits}` : null;

  const told = useRef(onDone);                                    // the latest callback, without re-running the effect when it changes
  told.current = onDone;
  useEffect(() => {                                               // ask until it finishes; stop on leaving the page
    if (!payment) return;
    if (payment.status !== "pending") { told.current?.(payment); return; }
    const timer = setInterval(() => { void pay.status(payment.id).then(setPayment).catch(() => { /* no signal: keep asking */ }); }, POLL_MS);
    return () => clearInterval(timer);
  }, [payment?.id, payment?.status, pay]);                        // eslint-disable-line react-hooks/exhaustive-deps -- a poll returning the same status must not restart this

  async function start() {
    if (!network || !e164) return;
    setProblem(undefined); setBusy(true);
    try {
      const p = await pay.start({ id: idRef.current, purpose, subjectId, network, phone: e164 });
      setPayment(p);
      if (p.status === "failed") idRef.current = newId();         // a new try is a new payment
    } catch (e) {
      setProblem(e instanceof PayError ? e.message : "We couldn't start the payment. Please try again.");
      if (e instanceof PayError && e.code !== "offline" && e.code !== "payments_unavailable") idRef.current = newId();
    } finally { setBusy(false); }
  }

  if (payment?.status === "successful") return <p className="body-strong"><Icon name="check-circle" size="sm" /> Paid {cedis(payment.amount)}. Your receipt is below.</p>;
  if (payment?.status === "pending") return (<>
    <p className="body-strong">{cedis(payment.amount)}: waiting for approval</p>
    {payment.checkoutUrl
      ? <a className="btn btn-primary btn-full" href={payment.checkoutUrl}>Approve the payment</a>
      : <p className="caption">In real use, your phone would ask for your mobile money PIN. This test pretends it was approved.</p>}
    <p className="caption">Keep this page open. It updates by itself.</p>
  </>);
  return (<>
    <KV k="To pay" v={cedis(amount)} />
    {payment?.status === "failed" && <Alert>That payment didn't go through. You weren't charged. Check the number and try again.</Alert>}
    <Heading>Mobile money network</Heading>
    <div className="row">{NETWORKS.map((n) => <Chip key={n.id} selected={network === n.id} onClick={() => setNetwork(n.id)}>{n.label}</Chip>)}</div>
    <PhoneField label="Mobile money number" value={phone} onChange={(e) => setPhone(e.target.value)} {...(checked.problem ? { error: checked.problem } : {})} />
    {problem && <Alert>{problem}</Alert>}
    <PrimaryButton disabled={!network || !e164} loading={busy} onClick={() => void start()}>Pay {cedis(amount)}</PrimaryButton>
  </>);
}

export function Receipts({ refreshKey = 0 }: { refreshKey?: number }) {
  const pay = usePay();
  const list = useLoad(() => pay.mine(), [refreshKey]);
  return (<>
    <Heading>Receipts</Heading>
    {list.loading ? <StateView kind="loading" text="Loading…" /> : list.error ? <Alert>{list.error}</Alert> : !list.data?.length ? <p className="caption">No payments yet.</p>
      : list.data.map((p) => <KV key={p.id} k={`${WHAT[p.purpose]}, ${when(p.createdAt)}`} v={`${cedis(p.amount)} · ${LABEL[p.status]}`} />)}
  </>);
}

export const PaymentModeNote = () => <p className="caption">Test mode: no real money moves. Prices are examples.</p>;

/** The consultation fee, for the visit that's next. */
export function PayFee() {
  const { userId } = useData();
  const { user } = useSession();
  const visits = useLoad(() => listAppointments(userId, user!.patientId ?? user!.id));
  const [done, setDone] = useState(0);
  const [picked, setPicked] = useState<string>();
  const list = (visits.data ?? []).filter((v) => v.resource.status === "booked").sort((a, b) => a.resource.start.localeCompare(b.resource.start));
  const visit = list.find((v) => v.resource.id === picked) ?? list[0];

  return (<>
    {visits.loading ? <StateView kind="loading" text="Loading…" /> : !visit
      ? <StateView kind="empty" text="No visits to pay for. When a visit is booked, you can pay for it here." />
      : <>
        <KV k="Visit" v={new Date(visit.resource.start).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} />
        {list.length > 1 && <SecondaryButton onClick={() => setPicked(list[(list.indexOf(visit) + 1) % list.length]!.resource.id)}>Choose another visit</SecondaryButton>}
        <PayForm key={visit.resource.id} purpose="consultation_fee" subjectId={visit.resource.id} amount={25} onDone={() => setDone((n) => n + 1)} />
      </>}
    <Receipts refreshKey={done} />
    <PaymentModeNote />
  </>);
}
