import { useMemo, useState } from "react";
import { Chip, SecondaryButton } from "../components/buttons";
import { PersonRow, StateView } from "../components/display";
import { Icon } from "../components/icons";
import { useSession } from "../auth/Session";
import { ROLE_LABEL } from "../auth/roles";
import { useLoad } from "../data/DataProvider";
import { AdminError, adminApiFor, type AuditRow } from "../data/admin";
import { cedis } from "../data/payments";
import { Heading, KV } from "./kit";

const Alert = ({ children }: { children: React.ReactNode }) => <p role="alert" className="field-note has-error"><Icon name="warning" size="sm" />{children}</p>;
const Loading = () => <StateView kind="loading" text="Loading…" />;
const when = (iso: string) => new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function useAdmin() {
  const { session } = useSession();
  return useMemo(() => adminApiFor(session!), [session]);
}
const ModeNote = ({ sample }: { sample: string }) => {
  const { session } = useSession();
  return session?.mode === "live" ? null : <p className="caption">Test mode: {sample}.</p>;
};

export function Users() {
  const admin = useAdmin();
  const { user: me } = useSession();
  const [version, setVersion] = useState(0);
  const [problem, setProblem] = useState<string>();
  const list = useLoad(() => admin.users(), [version]);
  async function flip(id: string, active: boolean) {
    setProblem(undefined);
    try { await admin.setActive(id, active); setVersion((v) => v + 1); }
    catch (e) { setProblem(e instanceof AdminError ? e.message : "We couldn't do that. Please try again."); }
  }
  if (list.loading) return <Loading />;
  if (list.error) return <Alert>{list.error}</Alert>;
  return (<>
    {problem && <Alert>{problem}</Alert>}
    <div className="stack">
      {list.data?.map((u) => (
        <div key={u.id} className="stack">
          <PersonRow name={u.name} role={`${u.role ? ROLE_LABEL[u.role] : "No app role"}${u.facility ? ` · ${u.facility}` : ""}${u.locked ? " · Locked" : ""}${u.active ? "" : " · Switched off"}`} {...(u.lastSignIn ? { hours: when(u.lastSignIn) } : {})} />
          {u.id !== me?.id && <SecondaryButton onClick={() => void flip(u.id, !u.active)}>{u.active ? `Switch off ${u.name}` : `Switch on ${u.name}`}</SecondaryButton>}
        </div>
      ))}
    </div>
    <ModeNote sample="these are the made-up demo accounts" />
  </>);
}

const ACTION: Record<string, string> = { read: "Opened", create: "Added", update: "Changed", delete: "Removed" };
const OUTCOME: Record<AuditRow["outcome"], string> = { success: "Allowed", denied: "Refused", not_found: "Not found", error: "Failed" };

export function Audit() {
  const admin = useAdmin();
  const [outcome, setOutcome] = useState<AuditRow["outcome"]>();
  const log = useLoad(() => admin.audit(outcome), [outcome]);
  return (<>
    <div className="row">
      <Chip selected={!outcome} onClick={() => setOutcome(undefined)}>All</Chip>
      <Chip selected={outcome === "denied"} onClick={() => setOutcome("denied")}>Refused</Chip>
      <Chip selected={outcome === "error"} onClick={() => setOutcome("error")}>Failed</Chip>
    </div>
    {log.loading ? <Loading /> : log.error ? <Alert>{log.error}</Alert> : !log.data?.items.length ? <StateView kind="empty" text="Nothing to show." /> : <div className="stack">
      {log.data.items.map((r) => <PersonRow key={r.id} name={r.who} role={`${ACTION[r.action] ?? r.action} ${r.resourceType.toLowerCase()} · ${OUTCOME[r.outcome]}`} hours={when(r.at)} />)}
    </div>}
    {log.data && <>
      <Heading>Sign-ins, last 7 days</Heading>
      {log.data.signInsLast7Days.map((s) => <KV key={s.outcome} k={s.outcome.replace(/_/g, " ")} v={s.n} />)}
    </>}
    <ModeNote sample="these are sample rows" />
  </>);
}

const PURPOSE: Record<string, string> = { consultation_fee: "Consultation fees", insurance_premium: "Insurance premiums" };

export function Revenue() {
  const admin = useAdmin();
  const data = useLoad(() => admin.revenue());
  if (data.loading) return <Loading />;
  if (data.error) return <Alert>{data.error}</Alert>;
  const real = data.data!.lines.filter((l) => !l.simulated), simulated = data.data!.lines.filter((l) => l.simulated);
  const sum = (ls: typeof real) => ls.reduce((n, l) => n + l.total, 0);
  return (<>
    <Heading>Real test-mode payments</Heading>
    {real.length === 0 ? <p className="caption">None yet.</p> : real.map((l) => <KV key={l.purpose} k={`${PURPOSE[l.purpose] ?? l.purpose} (${l.payments})`} v={cedis(l.total)} />)}
    {real.length > 0 && <KV k="Total" v={cedis(sum(real))} />}
    <Heading>Simulated, not real money</Heading>
    {simulated.length === 0 ? <p className="caption">None.</p> : simulated.map((l) => <KV key={l.purpose} k={`${PURPOSE[l.purpose] ?? l.purpose} (${l.payments})`} v={cedis(l.total)} />)}
    {data.data!.pending > 0 && <KV k="Still waiting for approval" v={data.data!.pending} />}
    <KV k="Training" v="No sales yet" />
    <ModeNote sample="only this device's test payments are counted" />
  </>);
}
