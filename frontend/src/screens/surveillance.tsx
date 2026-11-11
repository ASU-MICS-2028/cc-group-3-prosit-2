import { useState } from "react";
import { PrimaryButton, SecondaryButton, TextButton } from "../components/buttons";
import { StateView } from "../components/display";
import { PriorityBadge, VitalCard } from "../components/clinical";
import { useSession } from "../auth/Session";
import { useLoad } from "../data/DataProvider";
import { SurveillanceError, resetTestSurveillance, surveillanceApiFor, type Alert, type Total } from "../data/surveillance";
import { Heading, Rows, Tiles, type ScreenDef } from "./kit";
import { t } from "../i18n";

/* GHS official: surveillance dashboard, map and outbreak alerts (FB-7a).
   Every number is synthetic (D-034), and each screen says so. */

const HOME_REGION = "Greater Accra"; // the demo official's region; a real account would carry it
const SYNTHETIC_NOTE = "Synthetic data: shaped by Ghana 2022 DHS regional figures, but these case counts are made up.";
const Note = () => <p className="caption">{t(SYNTHETIC_NOTE)}</p>;
/** Condition names are codes on the server ("malaria"); only the label shown is translated. */
const cond = (c: string) => t(c[0].toUpperCase() + c.slice(1));
const sum = (ts: Total[]) => ts.reduce((s, t) => s + t.case_count, 0);
const fmtWeek = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString([], { day: "numeric", month: "short" }) : "");

function useApi() {
  const { session } = useSession();
  return session ? surveillanceApiFor(session) : null;
}

function Dashboard() {
  const api = useApi();
  const region = useLoad(async () => api?.summary(HOME_REGION), []);
  const alerts = useLoad(async () => api?.alerts(), []);
  if (region.error || alerts.error) return <StateView kind="error" text={region.error ?? alerts.error ?? ""} />;
  if (!region.data || !alerts.data) return <StateView kind="loading" text={t("Loading this week's figures…")} />;
  const totals = region.data.totals;
  const open = alerts.data.filter((a) => a.status === "suggested" && a.region === HOME_REGION);
  return (<>
    <p className="caption">{t("{HOME_REGION} · week of {fmtWeek}", { HOME_REGION, fmtWeek: fmtWeek(region.data.week_start) })}</p>
    <div className="row">
      <VitalCard label={t("Cases this week")} value={String(sum(totals))} unit="" taken={t("All conditions")} />
      <VitalCard label={t("Malaria")} value={String(sum(totals.filter((t) => t.condition === "malaria")))} unit="" taken={t("This week")} />
    </div>
    <Heading>{t("Needs a decision")}</Heading>
    {open.length === 0
      ? <p className="body">{t("No possible outbreaks waiting.")}</p>
      : <Rows items={open.map((a) => ({ name: t("Possible outbreak: {condition}", { condition: cond(a.condition) }), role: t("{district}, {n} cases", { district: a.district, n: a.case_count }), trailing: <PriorityBadge priority="urgent" />, to: "ghs.alerts" }))} />}
    <Heading>{t("Emergencies")}</Heading>
    <Rows items={[{ name: "Escalated emergencies", role: "Unanswered ones reach you here", to: "ghs.emergencies" }]} />
    <Tiles items={[{ icon: "calendar-check", label: "Forecasts", to: "ghs.forecast" }, { icon: "chat-circle-text", label: "Surveys", to: "ghs.surveys" }]} />
    <Note />
  </>);
}

function DiseaseMap() {
  const api = useApi();
  const all = useLoad(async () => api?.summary(), []);
  const alerts = useLoad(async () => api?.alerts(), []);
  if (all.error) return <StateView kind="error" text={all.error} />;
  if (!all.data) return <StateView kind="loading" text={t("Loading the map…")} />;
  const flagged = new Set((alerts.data ?? []).filter((a) => a.status !== "dismissed").map((a) => a.district));
  const districts = [...new Set(all.data.totals.map((t) => t.district))];
  // Ranked by the AVERAGE per district, not the total: regions report from different numbers of
  // districts (Greater Accra 4, the others 1), and a total would rank the region with more districts first.
  const byRegion = [...new Set(all.data.totals.map((t) => t.region))]
    .map((r) => {
      const ts = all.data!.totals.filter((t) => t.region === r);
      const n = new Set(ts.map((t) => t.district)).size;
      return { region: r, perDistrict: Math.round(sum(ts) / n), districts: n };
    })
    .sort((a, b) => b.perDistrict - a.perDistrict);
  return (<>
    <Heading>{t("{HOME_REGION}, by district", { HOME_REGION })}</Heading>
    <div className="tile-grid">
      {districts.filter((d) => all.data!.totals.some((t) => t.district === d && t.region === HOME_REGION)).map((d) => (
        <div key={d} className="tile">
          <span className="heading">{sum(all.data!.totals.filter((t) => t.district === d))}</span>
          <span className="tile-label">{d}</span>
          {flagged.has(d) && <PriorityBadge priority="urgent" />}
        </div>))}
    </div>
    <Heading>{t("All 16 regions, busiest first")}</Heading>
    <Rows items={byRegion.map((r) => ({ name: r.region, role: r.districts > 1 ? t("{n} cases per district this week (average of {d} districts)", { n: r.perDistrict, d: r.districts }) : t("{n} cases per district this week", { n: r.perDistrict }) }))} />
    <p className="caption">{t("Week of {fmtWeek}. Districts with a possible outbreak are marked.", { fmtWeek: fmtWeek(all.data.week_start) })}</p>
    <Note />
  </>);
}

function OutbreakAlerts() {
  const api = useApi();
  const { session } = useSession();
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState<string>();
  const [problem, setProblem] = useState<string>();
  const alerts = useLoad(async () => api?.alerts(), [version]);
  if (alerts.error) return <StateView kind="error" text={alerts.error} />;
  if (!alerts.data) return <StateView kind="loading" text={t("Checking for outbreaks…")} />;
  // Test mode only: clear the test decisions so the demo outbreak needs a decision again.
  const reset = session?.mode === "test"
    ? <TextButton onClick={() => { resetTestSurveillance(session); setVersion((v) => v + 1); }}>{t("Start the demo again (test mode)")}</TextButton>
    : null;
  if (alerts.data.length === 0) return <><StateView kind="empty" text={t("No possible outbreaks this week.")} />{reset}</>;

  async function decide(a: Alert, decision: "confirmed" | "dismissed") {
    if (!api || busy) return;
    setBusy(a.id); setProblem(undefined);
    try { await api.decide(a.id, decision); setVersion((v) => v + 1); }
    catch (e) { setProblem(e instanceof SurveillanceError ? e.message : "That didn't save. Try again."); }
    finally { setBusy(undefined); }
  }

  return (<>
    {problem && <p role="alert" className="field-note has-error">{t(problem)}</p>}
    {alerts.data.map((a) => (
      <section key={a.id} className="stack">
        <Rows items={[{ name: `${cond(a.condition)} · ${a.district}`, role: t("{n} cases, usually {usual}", { n: a.case_count, usual: a.baseline }),
          trailing: a.status === "suggested" ? <PriorityBadge priority="urgent" /> : <span className="caption">{a.status === "confirmed" ? t("Confirmed") : t("Not an outbreak")}</span> }]} />
        <p className="body">{a.reason}</p>
        {a.status === "suggested" ? (<>
          <PrimaryButton loading={busy === a.id} onClick={() => decide(a, "confirmed")}>{t("Confirm and alert the area")}</PrimaryButton>
          <SecondaryButton disabled={busy === a.id} onClick={() => decide(a, "dismissed")}>{t("Not an outbreak")}</SecondaryButton>
        </>) : a.alert_sent_at
          ? <p className="caption">{t("Test mode: the community alert was logged at {time}, not texted.", { time: new Date(a.alert_sent_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) })}</p>
          : null}
      </section>))}
    <Note />
    {reset}
  </>);
}

function ForecastScreen() {
  const api = useApi();
  const f = useLoad(async () => api?.forecast(HOME_REGION), []);
  if (f.error) return <StateView kind="error" text={f.error} />;
  if (!f.data) return <StateView kind="loading" text={t("Working out estimates…")} />;
  const items = f.data.forecasts;
  return (<>
    <p className="body-strong">{t("Estimates, not predictions.")}</p>
    <p className="caption">{t("{HOME_REGION}, week of {fmtWeek}. Method: {method} A recent spike lifts the estimate, and it knows nothing about the weather, stock or events.", { HOME_REGION, fmtWeek: fmtWeek(f.data.week_start), method: f.data.method })}</p>
    {items.length === 0
      ? <StateView kind="empty" text={t("Not enough weeks of data for an estimate.")} />
      : <Rows items={items.map((x) => ({ name: `${cond(x.condition)} · ${x.district}`, role: t("Estimate: about {n} cases ({low} to {high})", { n: x.estimate, low: x.low, high: x.high }) }))} />}
    <Note />
  </>);
}

export const surveillanceScreens: Record<string, ScreenDef> = {
  "ghs.dashboard": { title: "Hi Adwoa", caption: "Public health this week", render: () => <Dashboard /> },
  "ghs.map": { title: "Disease map", render: () => <DiseaseMap /> },
  "ghs.alerts": { title: "Outbreak alerts", render: () => <OutbreakAlerts /> },
  "ghs.forecast": { title: "Forecasts", caption: "Estimates, not predictions", render: () => <ForecastScreen /> },
};
