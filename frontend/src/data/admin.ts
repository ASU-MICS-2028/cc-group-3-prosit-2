import { mockAuthApi } from "../auth/mockApi";
import type { Session } from "../auth/types";
import { ROLE_LABEL } from "../auth/roles";

export type AdminUser = { id: string; name: string; role: keyof typeof ROLE_LABEL | null; active: boolean; facility: string | null; locked: boolean; lastSignIn: string | null };
export type AuditRow = { id: string; at: string; who: string; role: string | null; resourceType: string; action: string; outcome: "success" | "denied" | "not_found" | "error"; patientId: string | null };
export type Audit = { items: AuditRow[]; signInsLast7Days: { outcome: string; n: number }[] };
export type Revenue = { currency: "GHS"; lines: { purpose: string; simulated: boolean; payments: number; total: number }[]; pending: number };
export type Sdg3 = { sandbox: true; synthetic: true; scope: string; period: { code: string; start: string; end: string }; figures: { code: string; label: string; counts: string; target: string; unit?: string; value: number }[]; omitted: { label: string; why: string }[] };
export type ExportFormat = "fhir" | "dhis2" | "who";
export type ExportFile = { notice: { sandbox: true; synthetic: true; label: string; conformance: string }; format: ExportFormat; scope: string; period: Sdg3["period"]; payload: unknown };
export type FacilityPeople = { facility: string; people: { id: string; name: string; role: keyof typeof ROLE_LABEL | null; active: boolean }[] };
export class AdminError extends Error { constructor(readonly code: string, message: string) { super(message); this.name = "AdminError"; } }

export interface AdminApi {
  users(): Promise<AdminUser[]>;
  setActive(id: string, active: boolean): Promise<void>;
  audit(outcome?: AuditRow["outcome"]): Promise<Audit>;
  revenue(): Promise<Revenue>;
  sdg3(): Promise<Sdg3>;
  exportFile(format: ExportFormat): Promise<ExportFile>;
  facilityPeople(): Promise<FacilityPeople>;
}

const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? "https://api-hc.agroconnect.space";

export function httpAdminApi(token: string, baseUrl = API_URL): AdminApi {
  async function call<T>(method: string, path: string): Promise<T> {
    let res: Response;
    try { res = await fetch(baseUrl + path, { method, headers: { authorization: `Bearer ${token}` } }); } catch { throw new AdminError("offline", "No connection. Try again when you have a signal."); }
    if (res.status === 204) return undefined as T;
    const data = await res.json().catch(() => ({})) as { error?: string; message?: string };
    if (!res.ok) throw new AdminError(data.error ?? "error", data.message ?? "We couldn't do that. Please try again.");
    return data as T;
  }
  return {
    users: () => call("GET", "/admin/users"),
    setActive: (id, active) => call("POST", `/admin/users/${id}/${active ? "activate" : "deactivate"}`),
    audit: (outcome) => call("GET", `/admin/audit${outcome ? `?outcome=${outcome}` : ""}`),
    revenue: () => call("GET", "/admin/revenue"),
    sdg3: () => call("GET", "/reporting/sdg3"),
    exportFile: (format) => call("GET", `/reporting/export/${format}`),
    facilityPeople: () => call("GET", "/facility/people"),
  };
}

const OFF = "hc.mock.admin.off.v1";
const offList = (): string[] => { try { return JSON.parse(localStorage.getItem(OFF) ?? "[]") as string[]; } catch { return []; } };

const SAMPLE: Sdg3["figures"] = [
  { code: "readings_recorded", target: "3.8", label: "Readings recorded", counts: "Sample number for test mode. Live, it counts readings this quarter.", value: 42 },
  { code: "referrals_received", target: "3.8", label: "Referrals", counts: "Sample number for test mode. Live, it counts referrals created this quarter.", value: 6 },
];
const SAMPLE_NATIONAL: Sdg3["figures"] = [
  { code: "patients_registered", target: "3.8", label: "Patients on the system", counts: "Sample number for test mode. Live, it counts every patient record held.", value: 120 },
];
const SAMPLE_OMITTED = [{ label: "Maternal mortality ratio (3.1.1)", why: "No deaths or live births are stored." }, { label: "Disease incidence per 1,000 people (3.3)", why: "Case counts are stored, but no population for any district." }];
const SAMPLE_CONFORMANCE: Record<ExportFormat, string> = {
  fhir: "FHIR-shaped, not FHIR-compatible. Not checked with a FHIR validator.",
  dhis2: "Follows the layout of a DHIS2 dataValueSet, with placeholder codes. Not imported into or validated by DHIS2.",
  who: "A layout of our own. Not a WHO schema, and not validated by or submitted to WHO.",
};

/** Test mode: the demo accounts, sample audit rows, and this device's test payments. */
export function mockAdminApi(session: Session): AdminApi {
  const need = () => { if (session.user.role !== "platform_admin") throw new AdminError("forbidden", "Only a platform admin can open this."); };
  const facility = session.user.role === "facility_admin";
  const reporting = async (): Promise<Sdg3> => {
    if (!facility && !["ghs", "platform_admin"].includes(session.user.role)) throw new AdminError("forbidden", "This account cannot open reports.");
    return { sandbox: true, synthetic: true, scope: facility ? session.user.facility ?? "Your facility" : "All facilities", period: { code: "2026Q4", start: "2026-10-01T00:00:00.000Z", end: new Date().toISOString() }, figures: facility ? SAMPLE : [...SAMPLE_NATIONAL, ...SAMPLE], omitted: SAMPLE_OMITTED };
  };
  return {
    sdg3: reporting,
    async exportFile(format) {
      const { scope, period, figures } = await reporting();
      const payload = format === "fhir"
        ? { resourceType: "Bundle", type: "collection", meta: { tag: [{ system: "http://terminology.hl7.org/CodeSystem/v3-ActReason", code: "HTEST" }] }, entry: [{ resource: { resourceType: "MeasureReport", status: "complete", type: "summary", measure: "urn:healthconnect:sandbox:sdg3", group: figures.map((f) => ({ code: { text: f.label }, population: [{ count: f.value }] })) } }] }
        : format === "dhis2"
          ? { dataSet: "SANDBOX_HC_SDG3", idScheme: "code", period: period.code, orgUnit: "SANDBOX_TEST", dataValues: figures.map((f) => ({ dataElement: `SANDBOX_${f.code.toUpperCase()}`, period: period.code, orgUnit: "SANDBOX_TEST", value: String(f.value) })) }
          : { country: "GH", reporter: scope, period: period.code, indicators: figures.map(({ code, label, value }) => ({ code, label, value })), weeklyDiseaseCases: [] };
      return { notice: { sandbox: true, synthetic: true, label: "SANDBOX: test-mode sample numbers. Generated as a download and sent to no external system.", conformance: SAMPLE_CONFORMANCE[format] }, format, scope, period, payload };
    },
    async facilityPeople() {
      if (!facility) throw new AdminError("forbidden", "Only a health centre admin can open this.");
      return { facility: session.user.facility ?? "Your facility", people: mockAuthApi.demoAccounts().filter((u) => u.facility === session.user.facility).map((u) => ({ id: u.id, name: u.name, role: u.role, active: true })) };
    },
    async users() {
      need();
      const off = offList();
      return mockAuthApi.demoAccounts().map((u) => ({ id: u.id, name: u.name, role: u.role, active: !off.includes(u.id), facility: u.facility ?? null, locked: false, lastSignIn: null }));
    },
    async setActive(id, active) {
      need();
      if (id === session.user.id) throw new AdminError("not_yourself", "You cannot switch off your own account.");
      const off = offList().filter((x) => x !== id);
      localStorage.setItem(OFF, JSON.stringify(active ? off : [...off, id]));
    },
    async audit(outcome) {
      need();
      const now = Date.now();
      const items: AuditRow[] = [
        { id: "1", at: new Date(now - 120_000).toISOString(), who: "Efua Darko", role: "pharmacist", resourceType: "Patient", action: "read", outcome: "denied", patientId: "00000000-0000-4000-8000-000000000002" },
        { id: "2", at: new Date(now - 600_000).toISOString(), who: "Dr. Kofi Mensah", role: "clinician", resourceType: "Prescription", action: "create", outcome: "success", patientId: "00000000-0000-4000-8000-000000000002" },
        { id: "3", at: new Date(now - 1_800_000).toISOString(), who: "Ama Serwaa", role: "chv", resourceType: "Observation", action: "create", outcome: "success", patientId: "00000000-0000-4000-8000-000000000002" },
      ];
      return { items: outcome ? items.filter((i) => i.outcome === outcome) : items, signInsLast7Days: [{ outcome: "success", n: 12 }, { outcome: "wrong_password", n: 2 }] };
    },
    async revenue() {
      need();
      let list: { purpose: string; status: string; amount: number }[] = [];
      try { list = JSON.parse(localStorage.getItem("hc.mock.payments.v1") ?? "[]") as typeof list; } catch { /* unreadable: nothing to count */ }
      const lines = new Map<string, { purpose: string; simulated: boolean; payments: number; total: number }>();
      for (const p of list.filter((x) => x.status === "successful" || x.status === "pending")) {       // a test payment settles after 3 seconds
        const l = lines.get(p.purpose) ?? { purpose: p.purpose, simulated: true, payments: 0, total: 0 };
        l.payments++; l.total += p.amount; lines.set(p.purpose, l);
      }
      return { currency: "GHS", lines: [...lines.values()], pending: 0 };
    },
  };
}

export const adminApiFor = (session: Session): AdminApi => (session.mode === "live" ? httpAdminApi(session.token) : mockAdminApi(session));
