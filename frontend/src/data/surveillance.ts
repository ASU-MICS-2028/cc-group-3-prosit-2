import type { Session } from "../auth/types";

/** Disease surveillance for GHS officials (FB-7a). Totals only, never a patient (D-018). Every figure is
 *  SYNTHETIC: shaped by published Ghana 2022 DHS regional percentages, but the counts are made up (D-034).
 *  Live mode calls the API's /surveillance routes (backend/src/routes/surveillance.ts), where the rules
 *  live in the database (db/migrations/005_surveillance.sql). Test mode follows the same rules here. */

export type Condition = "cholera" | "malaria" | "measles" | "meningitis" | "diarrhoea" | "typhoid";
export type Total = { region: string; district: string; condition: Condition; case_count: number; synthetic: boolean };
export type Summary = { week_start: string | null; synthetic: boolean; totals: Total[] };
export type Alert = {
  id: string; region: string; district: string; condition: Condition; week_start: string;
  case_count: number; baseline: number; reason: string;
  status: "suggested" | "confirmed" | "dismissed"; decided_at: string | null; decision_note: string | null; alert_sent_at: string | null;
};
export class SurveillanceError extends Error { constructor(readonly code: string, message: string) { super(message); this.name = "SurveillanceError"; } }

export interface SurveillanceApi {
  summary(region?: string): Promise<Summary>;
  alerts(): Promise<Alert[]>;
  decide(id: string, decision: "confirmed" | "dismissed", note?: string): Promise<Alert>;
}

/* ---------------- Test mode ---------------- */

/** Ghana 2022 DHS, preferred regional values (same as db/seed/surveillance_synthetic.sql):
 *  children under 5 with diarrhoea (%), malaria by rapid test in children 6-59 months (%). */
const DHS: [region: string, district: string, diarrhoea: number, malaria: number][] = [
  ["Western", "Sekondi-Takoradi", 4.9, 22.5], ["Western North", "Sefwi Wiawso", 11.9, 11.4], ["Central", "Cape Coast", 15.3, 16.1],
  ["Greater Accra", "Ga East", 7.0, 3.4], ["Greater Accra", "Ga West", 7.0, 3.4], ["Greater Accra", "Adenta", 7.0, 3.4],
  ["Greater Accra", "Shai-Osudoku", 7.0, 3.4], ["Volta", "Ho Municipal", 9.1, 11.5], ["Oti", "Krachi East", 14.4, 22.6],
  ["Eastern", "New Juaben South", 9.2, 14.8], ["Ashanti", "Kumasi", 16.0, 11.1], ["Ahafo", "Asunafo North", 9.6, 21.4],
  ["Bono", "Sunyani", 8.1, 15.1], ["Bono East", "Techiman", 15.3, 22.1], ["Northern", "Tamale", 18.8, 18.8],
  ["Savannah", "West Gonja", 22.0, 26.6], ["North East", "East Mamprusi", 18.0, 26.9], ["Upper West", "Wa Municipal", 6.4, 30.2],
  ["Upper East", "Bolgatanga", 9.1, 33.6],
];
const WEEKS = ["2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02"];
const PLANTED_CHOLERA = [2, 3, 2, 4, 3, 2, 3, 12]; // the demo outbreak in Ga East, as in the seed

/** A steady +/-20% wobble, the same on every run, so the numbers don't jump around between visits. */
function wobble(text: string): number {
  let h = 0;
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) | 0;
  return ((Math.abs(h) % 41) - 20) / 100;
}

type Row = Omit<Total, "synthetic"> & { week: string };
function syntheticRows(): Row[] {
  const rows: Row[] = [];
  for (const [region, district, diarrhoea, malaria] of DHS) {
    for (const week of WEEKS) {
      for (const [condition, pct, scale] of [["diarrhoea", diarrhoea, 0.6], ["malaria", malaria, 0.8]] as const) {
        rows.push({ region, district, condition, week, case_count: Math.max(0, Math.round(pct * scale * (1 + wobble(district + condition + week)))) });
      }
    }
  }
  WEEKS.forEach((week, i) => rows.push({ region: "Greater Accra", district: "Ga East", condition: "cholera", week, case_count: PLANTED_CHOLERA[i] }));
  return rows;
}

/** The outbreak rule, the same as the database's outbreak_signals view: at least 5 cases AND more than
 *  double the average of the 4 weeks before. The thresholds are illustrative, not signed off. */
export function outbreakSignals(rows: Row[]): Omit<Alert, "id" | "status" | "decided_at" | "decision_note" | "alert_sent_at">[] {
  const out: ReturnType<typeof outbreakSignals> = [];
  const groups = new Map<string, Row[]>();
  for (const r of rows) groups.set(`${r.district}|${r.condition}`, [...(groups.get(`${r.district}|${r.condition}`) ?? []), r]);
  for (const g of groups.values()) {
    g.sort((a, b) => a.week.localeCompare(b.week));
    g.forEach((r, i) => {
      if (i < 4) return;
      const baseline = g.slice(i - 4, i).reduce((s, x) => s + x.case_count, 0) / 4;
      if (r.case_count >= 5 && r.case_count > 2 * Math.max(baseline, 1)) {
        const b = Math.round(baseline * 10) / 10;
        out.push({ region: r.region, district: r.district, condition: r.condition, week_start: r.week, case_count: r.case_count, baseline: b,
          reason: `${r.case_count} cases of ${r.condition} in ${r.district} in the week of ${r.week}, against a usual ${b.toFixed(1)} a week (${(r.case_count / Math.max(baseline, 1)).toFixed(1)} times higher). Rule: at least 5 cases and more than double the average of the 4 weeks before.` });
      }
    });
  }
  return out;
}

const VIEWERS = new Set(["ghs", "platform_admin"]);
const storeKey = (userId: string) => `hc.mock.surveillance.v1.${userId}`;

/** Test mode only: forget this account's test decisions, so a demo can start again. Live data can't be reset. */
export function resetTestSurveillance(session: Session): void {
  try { localStorage.removeItem(storeKey(session.user.id)); } catch { /* storage blocked */ }
}

export function mockSurveillanceApi(session: Session): SurveillanceApi {
  const rows = syntheticRows();
  const allowed = () => { if (!VIEWERS.has(session.user.role)) throw new SurveillanceError("forbidden", "Only public health staff can see surveillance data."); };
  const read = (): Alert[] => { try { return JSON.parse(localStorage.getItem(storeKey(session.user.id)) ?? "[]") as Alert[]; } catch { return []; } };
  const write = (a: Alert[]) => { try { localStorage.setItem(storeKey(session.user.id), JSON.stringify(a)); } catch { /* storage blocked */ } };
  return {
    async summary(region) {
      allowed();
      const week = WEEKS[WEEKS.length - 1];
      const totals = rows.filter((r) => r.week === week && (!region || r.region === region)).map(({ week: _w, ...r }) => ({ ...r, synthetic: true }));
      return { week_start: week, synthetic: true, totals };
    },
    async alerts() {
      allowed();
      const saved = read();
      for (const s of outbreakSignals(rows)) {
        // One alert per district, condition and week, like the database's UNIQUE rule.
        if (!saved.some((a) => a.district === s.district && a.condition === s.condition && a.week_start === s.week_start)) {
          saved.push({ ...s, id: crypto.randomUUID(), status: "suggested", decided_at: null, decision_note: null, alert_sent_at: null });
        }
      }
      write(saved);
      return [...saved].sort((a, b) => b.week_start.localeCompare(a.week_start) || b.case_count - a.case_count);
    },
    async decide(id, decision, note) {
      allowed();
      const saved = read();
      const a = saved.find((x) => x.id === id);
      if (!a) throw new SurveillanceError("not_found", "That alert doesn't exist.");
      if (a.status !== "suggested") throw new SurveillanceError("already_decided", `This alert was already ${a.status} and that decision stands.`);
      const now = new Date().toISOString();
      Object.assign(a, { status: decision, decided_at: now, decision_note: note ?? null, alert_sent_at: decision === "confirmed" ? now : null });
      write(saved);
      return a;
    },
  };
}

/* ---------------- Live mode ---------------- */

const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? "https://api-hc.agroconnect.space";

export function liveSurveillanceApi(session: Session, base = API_URL): SurveillanceApi {
  async function call<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${base}${path}`, { ...init, headers: { authorization: `Bearer ${session.token}`, "content-type": "application/json", ...init?.headers } });
    const body = await res.json().catch(() => ({})) as { error?: string; message?: string };
    if (!res.ok) throw new SurveillanceError(body.error ?? `http_${res.status}`, body.message ?? "We couldn't reach the surveillance service. Try again.");
    return body as T;
  }
  return {
    summary: (region) => call<Summary>(`/surveillance/summary${region ? `?region=${encodeURIComponent(region)}` : ""}`),
    alerts: async () => (await call<{ alerts: Alert[] }>("/surveillance/alerts")).alerts,
    decide: (id, decision, note) => call<Alert>(`/surveillance/alerts/${id}/decision`, { method: "POST", body: JSON.stringify({ decision, note }) }),
  };
}

export const surveillanceApiFor = (session: Session): SurveillanceApi => (session.mode === "live" ? liveSurveillanceApi(session) : mockSurveillanceApi(session));
