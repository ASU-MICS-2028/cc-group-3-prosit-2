import type { Session } from "../auth/types";

export type RxFlag = { kind: "duplicate" | "repeated" | "prescriber_rate" | "unlicensed"; detail: string; reviewed: boolean };
export type Rx = {
  id: string; patient: { id: string; name: string };
  medication: string; dose: string; frequency: string; durationDays: number; quantity: number; instructions: string | null;
  prescriber: { name: string; licence: string | null };
  status: "active" | "dispensed" | "cancelled" | "expired";
  issuedAt: string; expiresAt: string; dispensedAt: string | null; dispensedAtPlace: string | null;
  flags: RxFlag[]; code?: string; qr?: string;
};
export type NewRx = { id: string; patient: { id: string; name: string }; medication: string; dose: string; frequency: string; durationDays: number; quantity: number; instructions?: string };

/** A refusal in plain words. `code` is the server's error name, e.g. "already_dispensed". */
export class RxError extends Error {
  constructor(readonly code: string, message: string, readonly flags: RxFlag[] = []) { super(message); this.name = "RxError"; }
}

/** The same calls against the real API (SVC-6) or the test-mode stand-in. */
export interface RxApi {
  issue(input: NewRx): Promise<Rx>;
  verify(by: { code: string } | { qr: string }): Promise<Rx>;
  dispense(id: string, code: string, acknowledgeFlags: boolean): Promise<Rx>;
  cancel(id: string): Promise<void>;
  mine(): Promise<Rx[]>;
}

const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? "https://api-hc.agroconnect.space";

export function httpRxApi(token: string, baseUrl = API_URL): RxApi {
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(baseUrl + path, { method, headers: { authorization: `Bearer ${token}`, ...(body !== undefined ? { "content-type": "application/json" } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    } catch {
      throw new RxError("offline", "No connection. Prescriptions need a signal, so they can be checked at once.");
    }
    if (res.status === 204) return undefined as T;
    const data = await res.json().catch(() => ({})) as { error?: string; message?: string; flags?: RxFlag[] };
    if (!res.ok) throw new RxError(data.error ?? "error", data.message ?? "We couldn't do that. Please try again.", data.flags ?? []);
    return data as T;
  }
  return {
    issue: (i) => call("POST", "/prescriptions", { id: i.id, patient_id: i.patient.id, medication: i.medication, dose: i.dose, frequency: i.frequency, duration_days: i.durationDays, quantity: i.quantity, ...(i.instructions ? { instructions: i.instructions } : {}) }),
    verify: (by) => call("POST", "/prescriptions/verify", by),
    dispense: (id, code, acknowledgeFlags) => call("POST", `/prescriptions/${id}/dispense`, { code, acknowledgeFlags }),
    cancel: (id) => call("POST", `/prescriptions/${id}/cancel`, {}),
    mine: () => call("GET", "/prescriptions/mine"),
  };
}

const KEY = "hc.mock.rx.v1";
type Stored = Rx & { code: string; prescriberId: string; dispensedBy?: string };
const load = (): Stored[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? "[]") as Stored[]; } catch { return []; } };
const save = (all: Stored[]) => { try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* storage full or blocked */ } };
const statusNow = (r: Rx): Rx["status"] => (r.status === "active" && Date.parse(r.expiresAt) <= Date.now() ? "expired" : r.status);

/** Test mode: the same rules as the server (backend/src/routes/prescriptions.ts), kept on this device. */
export function mockRxApi(session: Session): RxApi {
  const { user } = session;
  const publicView = ({ code: _code, qr: _qr, prescriberId: _p, dispensedBy: _d, ...r }: Stored): Rx => ({ ...r, status: statusNow(r) });
  const withCode = ({ prescriberId: _p, dispensedBy: _d, ...r }: Stored): Rx => ({ ...r, status: statusNow(r) });
  const need = (role: string, doing: string) => { if (user.role !== role) throw new RxError("forbidden", `A ${user.role} account cannot ${doing}.`); };
  return {
    async issue(i) {
      need("clinician", "prescribe");
      const all = load();
      const again = all.find((r) => r.id === i.id);
      if (again) return withCode(again);
      const same = all.filter((r) => r.patient.id === i.patient.id && r.medication.toLowerCase() === i.medication.toLowerCase());
      const flags: RxFlag[] = [];
      if (same.some((r) => statusNow(r) === "active")) flags.push({ kind: "duplicate", detail: `This patient already has an unused prescription for ${i.medication}`, reviewed: false });
      if (same.length + 1 >= 3) flags.push({ kind: "repeated", detail: `${same.length + 1} prescriptions for ${i.medication} in 30 days`, reviewed: false });
      const code = String(10_000_000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 90_000_000));
      const now = new Date();
      const rx: Stored = {
        id: i.id, patient: i.patient, medication: i.medication, dose: i.dose, frequency: i.frequency, durationDays: i.durationDays, quantity: i.quantity, instructions: i.instructions ?? null,
        prescriber: { name: user.name, licence: "MDC-TEST-0001" }, status: "active", issuedAt: now.toISOString(), expiresAt: new Date(now.getTime() + 30 * 86_400_000).toISOString(),
        dispensedAt: null, dispensedAtPlace: null, flags, code, qr: `hc-rx:test:${i.id}:${code}`, prescriberId: user.id,
      };
      save([...all, rx]);
      return withCode(rx);
    },
    async verify(by) {
      need("pharmacist", "verify prescriptions");
      const code = "code" in by ? by.code.replace(/\s/g, "") : by.qr.split(":")[3] ?? "";
      const found = load().find((r) => r.code === code);
      if (!found) throw new RxError("not_found", "That code isn't valid. Ask the patient to check it.");
      return publicView(found);
    },
    async dispense(id, code, ack) {
      need("pharmacist", "dispense");
      const all = load();
      const rx = all.find((r) => r.id === id);
      if (!rx || rx.code !== code.replace(/\s/g, "")) throw new RxError("not_found", "That code isn't valid for this prescription.");
      const open = rx.flags.filter((f) => !f.reviewed);
      if (open.length && !ack) throw new RxError("flags_need_review", "Read these warnings first.", open);
      const now = statusNow(rx);
      if (now === "dispensed") throw new RxError("already_dispensed", "This prescription has already been dispensed. Do not give the medicine.");
      if (now === "cancelled") throw new RxError("cancelled", "This prescription was cancelled. Do not give the medicine.");
      if (now === "expired") throw new RxError("expired", "This prescription has expired. Ask for a new one.");
      rx.status = "dispensed"; rx.dispensedAt = new Date().toISOString(); rx.dispensedAtPlace = user.facility ?? null; rx.dispensedBy = user.id;
      rx.flags = rx.flags.map((f) => ({ ...f, reviewed: true }));
      save(all);
      return publicView(rx);
    },
    async cancel(id) {
      const all = load();
      const rx = all.find((r) => r.id === id);
      if (!rx) throw new RxError("not_found", "Unknown prescription.");
      if (rx.prescriberId !== user.id) throw new RxError("forbidden", "Only the prescriber can cancel this.");
      if (rx.status !== "active") throw new RxError(`already_${rx.status}`, `This prescription is already ${rx.status}.`);
      rx.status = "cancelled";
      save(all);
    },
    async mine() {
      const all = load().sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
      if (user.role === "clinician") return all.filter((r) => r.prescriberId === user.id).map(withCode);
      if (user.role === "patient") return all.filter((r) => r.patient.id === (user.patientId ?? user.id)).map(withCode);
      if (user.role === "pharmacist") return all.filter((r) => r.dispensedBy === user.id).map(publicView);
      throw new RxError("forbidden", `A ${user.role} account cannot list prescriptions.`);
    },
  };
}

export const rxApiFor = (session: Session): RxApi => (session.mode === "live" ? httpRxApi(session.token) : mockRxApi(session));
