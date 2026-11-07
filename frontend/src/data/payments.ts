import type { Session } from "../auth/types";
import { mockPremium } from "./insurance";

export type Payment = {
  id: string; purpose: "consultation_fee" | "insurance_premium"; subjectId: string; patientId: string;
  amount: number; currency: "GHS"; network: Network; status: "pending" | "successful" | "failed";
  testMode: boolean; simulated: boolean; checkoutUrl: string | null; createdAt: string;
};
export type Network = "mtn" | "telecel" | "airteltigo";
export const NETWORKS: { id: Network; label: string }[] = [{ id: "mtn", label: "MTN" }, { id: "telecel", label: "Telecel" }, { id: "airteltigo", label: "AirtelTigo" }];
export type NewPayment = { id: string; purpose: Payment["purpose"]; subjectId: string; network: Network; phone: string };

export class PayError extends Error { constructor(readonly code: string, message: string) { super(message); this.name = "PayError"; } }

/** The same calls against the real API (SVC-4) or the test-mode stand-in. */
export interface PayApi {
  start(input: NewPayment): Promise<Payment>;
  status(id: string): Promise<Payment>;
  mine(): Promise<Payment[]>;
}

const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? "https://api-hc.agroconnect.space";

export function httpPayApi(token: string, baseUrl = API_URL): PayApi {
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(baseUrl + path, { method, headers: { authorization: `Bearer ${token}`, ...(body !== undefined ? { "content-type": "application/json" } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    } catch { throw new PayError("offline", "No connection. Nothing was charged. Try again when you have a signal."); }
    const data = await res.json().catch(() => ({})) as { error?: string; message?: string };
    if (!res.ok) throw new PayError(data.error ?? "error", data.message ?? "We couldn't do that. Please try again.");
    return data as T;
  }
  return {
    start: (i) => call("POST", "/payments", { id: i.id, purpose: i.purpose, subject_id: i.subjectId, network: i.network, phone: i.phone }),
    status: (id) => call("GET", `/payments/${id}`),
    mine: () => call("GET", "/payments/mine"),
  };
}

const KEY = "hc.mock.payments.v1";
const SIMULATED_DELAY_MS = 3_000;
const load = (): Payment[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? "[]") as Payment[]; } catch { return []; } };
const save = (all: Payment[]) => { try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* storage full or blocked */ } };
const settled = (p: Payment): Payment => (p.status === "pending" && Date.now() - Date.parse(p.createdAt) >= SIMULATED_DELAY_MS ? { ...p, status: "successful" } : p);

/** Test mode: the server's rules (backend/src/routes/payments.ts), kept on this device. No money moves. */
export function mockPayApi(session: Session, amounts: Record<Payment["purpose"], number> = { consultation_fee: 25, insurance_premium: 10 }): PayApi {
  const patientId = session.user.patientId ?? session.user.id;
  return {
    async start(i) {
      const all = load().map(settled);
      const again = all.find((p) => p.id === i.id);
      if (again) return again;
      if (i.purpose === "consultation_fee" && all.some((p) => p.subjectId === i.subjectId && p.status !== "failed")) throw new PayError("already_paid", "This visit has already been paid for, or a payment is in progress.");
      const p: Payment = {
        id: i.id, purpose: i.purpose, subjectId: i.subjectId, patientId, amount: (i.purpose === "insurance_premium" ? mockPremium(session.user.id, i.subjectId) : null) ?? amounts[i.purpose], currency: "GHS", network: i.network,
        status: i.phone.endsWith("0000") ? "failed" : "pending", testMode: true, simulated: true, checkoutUrl: null, createdAt: new Date().toISOString(),
      };
      save([...all, p]);
      return p;
    },
    async status(id) {
      const p = load().map(settled).find((x) => x.id === id);
      if (!p) throw new PayError("not_found", "Unknown payment.");
      return p;
    },
    async mine() { return load().map(settled).filter((p) => p.patientId === patientId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); },
  };
}

export const payApiFor = (session: Session): PayApi => (session.mode === "live" ? httpPayApi(session.token) : mockPayApi(session));

export const cedis = (n: number) => `₵ ${n.toFixed(2)}`;
