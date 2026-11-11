import { useMemo, useState } from "react";
import { Chip, SecondaryButton } from "../components/buttons";
import { PersonRow, StateView } from "../components/display";
import { Icon } from "../components/icons";
import { useSession } from "../auth/Session";
import { ROLE_LABEL } from "../auth/roles";
import { useLoad } from "../data/DataProvider";
import { AdminError, adminApiFor, type AuditRow, type ExportFormat } from "../data/admin";
import { cedis } from "../data/payments";
import { Heading, KV, Tiles } from "./kit";
import { LowStockCard } from "./healersStock";
import { t } from "../i18n";

const Alert = ({ children }: { children: React.ReactNode }) => <p role="alert" className="field-note has-error"><Icon name="warning" size="sm" />{typeof children === "string" ? t(children) : children}</p>;
const Loading = () => <StateView kind="loading" text={t("Loading…")} />;
const when = (iso: string) => new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function useAdmin() {
  const { session } = useSession();
  return useMemo(() => adminApiFor(session!), [session]);
}
const ModeNote = ({ sample }: { sample: string }) => {
  const { session } = useSession();
  return session?.mode === "live" ? null : <p className="caption">{t("Test mode: {sample}.", { sample: t(sample) })}</p>;
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
          <PersonRow name={u.name} role={`${t(u.role ? ROLE_LABEL[u.role] : "No app role")}${u.facility ? ` · ${u.facility}` : ""}${u.locked ? ` · ${t("Locked")}` : ""}${u.active ? "" : ` · ${t("Switched off")}`}`} {...(u.lastSignIn ? { hours: when(u.lastSignIn) } : {})} />
          {u.id !== me?.id && <SecondaryButton onClick={() => void flip(u.id, !u.active)}>{u.active ? t("Switch off {name}", { name: u.name }) : t("Switch on {name}", { name: u.name })}</SecondaryButton>}
        </div>
      ))}
    </div>
    <ModeNote sample={t("these are the made-up demo accounts")} />
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
      <Chip selected={!outcome} onClick={() => setOutcome(undefined)}>{t("All")}</Chip>
      <Chip selected={outcome === "denied"} onClick={() => setOutcome("denied")}>{t("Refused")}</Chip>
      <Chip selected={outcome === "error"} onClick={() => setOutcome("error")}>{t("Failed")}</Chip>
    </div>
    {log.loading ? <Loading /> : log.error ? <Alert>{log.error}</Alert> : !log.data?.items.length ? <StateView kind="empty" text={t("Nothing to show.")} /> : <div className="stack">
      {log.data.items.map((r) => <PersonRow key={r.id} name={r.who} role={`${t(ACTION[r.action] ?? r.action)} ${r.resourceType.toLowerCase()} · ${t(OUTCOME[r.outcome])}`} hours={when(r.at)} />)}
    </div>}
    {log.data && <>
      <Heading>{t("Sign-ins, last 7 days")}</Heading>
      {log.data.signInsLast7Days.map((s) => <KV key={s.outcome} k={t(s.outcome.replace(/_/g, " "))} v={s.n} />)}
    </>}
    <ModeNote sample={t("these are sample rows")} />
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
    <Heading>{t("Real test-mode payments")}</Heading>
    {real.length === 0 ? <p className="caption">{t("None yet.")}</p> : real.map((l) => <KV key={l.purpose} k={`${PURPOSE[l.purpose] ?? l.purpose} (${l.payments})`} v={cedis(l.total)} />)}
    {real.length > 0 && <KV k={t("Total")} v={cedis(sum(real))} />}
    <Heading>{t("Simulated, not real money")}</Heading>
    {simulated.length === 0 ? <p className="caption">{t("None.")}</p> : simulated.map((l) => <KV key={l.purpose} k={`${PURPOSE[l.purpose] ?? l.purpose} (${l.payments})`} v={cedis(l.total)} />)}
    {data.data!.pending > 0 && <KV k={t("Still waiting for approval")} v={data.data!.pending} />}
    <KV k={t("Training")} v={t("No sales yet")} />
    <ModeNote sample={t("only this device's test payments are counted")} />
  </>);
}

const FORMATS: { format: ExportFormat; label: string }[] = [{ format: "fhir", label: "FHIR-shaped file" }, { format: "dhis2", label: "DHIS2-shaped file" }, { format: "who", label: "WHO-style table" }];

function saveFile(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

/** The SDG 3 page for GHS and the platform admin (every facility), and for a health centre admin (the server limits it to theirs). */
export function Sdg3() {
  const admin = useAdmin();
  const report = useLoad(() => admin.sdg3());
  const [problem, setProblem] = useState<string>();
  const [saved, setSaved] = useState<string>();
  async function download(format: ExportFormat) {
    setProblem(undefined); setSaved(undefined);
    try {
      const file = await admin.exportFile(format);
      saveFile(`healthconnect-SANDBOX-${format}-${file.period.code}.json`, file);
      setSaved(`${file.notice.label} ${file.notice.conformance}`);
    } catch (e) { setProblem(e instanceof AdminError ? e.message : "We couldn't do that. Please try again."); }
  }
  if (report.loading) return <Loading />;
  if (report.error) return <Alert>{report.error}</Alert>;
  const r = report.data!;
  return (<>
    <p className="caption">{t("{scope}, {code}. Sandbox: counted from what this system holds, and its records are synthetic. These are activity counts related to SDG 3 targets, not the official indicators.", { scope: r.scope, code: r.period.code })}</p>
    <div className="stack">
      {r.figures.map((f) => <div key={f.code}><KV k={t("{label} (target {target})", { label: t(f.label), target: f.target })} v={`${f.value}${f.unit ? ` ${t(f.unit)}` : ""}`} /><p className="caption">{t(f.counts)}</p></div>)}
    </div>
    <Heading>{t("Left out, and why")}</Heading>
    <div className="stack">
      {r.omitted.map((o) => <div key={o.label}><p className="body-strong">{t(o.label)}</p><p className="caption">{t(o.why)}</p></div>)}
    </div>
    <Heading>{t("Sandbox exports")}</Heading>
    <p className="caption">{t("Totals only. Saved to this device and sent to no external system. FHIR files are FHIR-shaped, not FHIR-compatible, and none of these has been validated by DHIS2 or WHO.")}</p>
    {problem && <Alert>{problem}</Alert>}
    <div className="stack">{FORMATS.map((f) => <SecondaryButton key={f.format} onClick={() => void download(f.format)}>{t("Download {label}", { label: t(f.label) })}</SecondaryButton>)}</div>
    {saved && <p role="status" className="caption">{t(saved)}</p>}
    <ModeNote sample={t("these are sample numbers")} />
  </>);
}

export function FacilityHome() {
  const admin = useAdmin();
  const data = useLoad(() => admin.facilityPeople());
  if (data.loading) return <Loading />;
  if (data.error) return <Alert>{data.error}</Alert>;
  return (<>
    <p className="body-strong">{data.data!.facility}</p>
    <KV k={t("People at this facility")} v={data.data!.people.length} />
    <LowStockCard />
    <Tiles items={[{ icon: "users", label: "Reports", to: "facility.reports" }, { icon: "users", label: "Emergencies", to: "facility.emergencies" }, { icon: "calendar-check", label: "Quality review", to: "facility.qa" }]} />
    <ModeNote sample={t("this is the made-up demo facility")} />
  </>);
}

export function FacilityPeople() {
  const admin = useAdmin();
  const data = useLoad(() => admin.facilityPeople());
  if (data.loading) return <Loading />;
  if (data.error) return <Alert>{data.error}</Alert>;
  return (<>
    <div className="stack">{data.data!.people.map((p) => <PersonRow key={p.id} name={p.name} role={`${t(p.role ? ROLE_LABEL[p.role] : "No app role")}${p.active ? "" : ` · ${t("Switched off")}`}`} />)}</div>
    <p className="caption">{t("To add someone, ask the platform admin.")}</p>
    <ModeNote sample={t("these are the made-up demo accounts")} />
  </>);
}
