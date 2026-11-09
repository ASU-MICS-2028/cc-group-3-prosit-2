import { mockAuthApi } from "../auth/mockApi";
import type { Session } from "../auth/types";
import { ROLE_LABEL } from "../auth/roles";

export type AdminUser = { id: string; name: string; role: keyof typeof ROLE_LABEL | null; active: boolean; facility: string | null; locked: boolean; lastSignIn: string | null };
export type AuditRow = { id: string; at: string; who: string; role: string | null; resourceType: string; action: string; outcome: "success" | "denied" | "not_found" | "error"; patientId: string | null };
export type Audit = { items: AuditRow[]; signInsLast7Days: { outcome: string; n: number }[] };
export type Revenue = { currency: "GHS"; lines: { purpose: string; simulated: boolean; payments: number; total: number }[]; pending: number };
export class AdminError extends Error { constructor(readonly code: string, message: string) { super(message); this.name = "AdminError"; } }

export interface AdminApi {
  users(): Promise<AdminUser[]>;
  setActive(id: string, active: boolean): Promise<void>;
  audit(outcome?: AuditRow["outcome"]): Promise<Audit>;
  revenue(): Promise<Revenue>;
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
  };
}

const OFF = "hc.mock.admin.off.v1";
const offList = (): string[] => { try { return JSON.parse(localStorage.getItem(OFF) ?? "[]") as string[]; } catch { return []; } };

/** Test mode: the demo accounts, sample audit rows, and this device's test payments. */
export function mockAdminApi(session: Session): AdminApi {
  const need = () => { if (session.user.role !== "platform_admin") throw new AdminError("forbidden", "Only a platform admin can open this."); };
  return {
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
