import type { Session } from "../auth/types";

export type Plan = { id: string; name: string; monthlyPremium: number; covers: string };
export type Enrolment = { id: string; planId: string; since: string };
export type NhisResult = { status: "active" | "expired" | "not_found"; checkedAt: string; mode: "sandbox" };
export class InsuranceError extends Error { constructor(readonly code: string, message: string) { super(message); this.name = "InsuranceError"; } }

export interface InsuranceApi {
  plans(): Promise<Plan[]>;
  mine(): Promise<Enrolment | null>;
  enrol(planId: string): Promise<Enrolment>;
  checkNhis(memberNumber: string): Promise<NhisResult>;
}

/** Example plans. We have no insurer as a partner, and these prices aren't based on anything. */
export const PLANS: Plan[] = [
  { id: "community", name: "Community plan", monthlyPremium: 10, covers: "Video visits with a doctor and basic medicines" },
  { id: "family", name: "Family plan", monthlyPremium: 25, covers: "The same, for up to five people in one home" },
];

const key = (userId: string) => `hc.mock.insurance.v1.${userId}`;
const readEnrolment = (userId: string): Enrolment | null => { try { return JSON.parse(localStorage.getItem(key(userId)) ?? "null") as Enrolment | null; } catch { return null; } };

/** The premium the test-mode payment charges; in live mode the server works it out. */
export function mockPremium(userId: string, enrolmentId: string): number | null {
  const e = readEnrolment(userId);
  return e?.id === enrolmentId ? PLANS.find((p) => p.id === e.planId)?.monthlyPremium ?? null : null;
}

/** A pretend NHIS. We have no access to the real one. An 8-digit number ending in 0 is expired, in 9 unknown, anything else active. */
export function sandboxNhis(memberNumber: string): NhisResult["status"] {
  const digits = memberNumber.replace(/\s/g, "");
  if (!/^\d{8}$/.test(digits)) throw new InsuranceError("invalid", "An NHIS test number has 8 digits.");
  return digits.endsWith("0") ? "expired" : digits.endsWith("9") ? "not_found" : "active";
}

export function mockInsuranceApi(session: Session): InsuranceApi {
  const userId = session.user.id;
  return {
    plans: async () => PLANS,
    mine: async () => readEnrolment(userId),
    async enrol(planId) {
      if (!PLANS.some((p) => p.id === planId)) throw new InsuranceError("not_found", "That plan isn't available.");
      const current = readEnrolment(userId);
      if (current?.planId === planId) return current;
      const e: Enrolment = { id: current?.id ?? crypto.randomUUID(), planId, since: new Date().toISOString() };
      localStorage.setItem(key(userId), JSON.stringify(e));
      return e;
    },
    checkNhis: async (n) => ({ status: sandboxNhis(n), checkedAt: new Date().toISOString(), mode: "sandbox" }),
  };
}

const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? "https://api-hc.agroconnect.space";

export function httpInsuranceApi(token: string, baseUrl = API_URL): InsuranceApi {
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(baseUrl + path, { method, headers: { authorization: `Bearer ${token}`, ...(body !== undefined ? { "content-type": "application/json" } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    } catch { throw new InsuranceError("offline", "No connection. Try again when you have a signal."); }
    const data = await res.json().catch(() => ({})) as { error?: string; message?: string };
    if (!res.ok) throw new InsuranceError(data.error ?? "error", data.message ?? "We couldn't do that. Please try again.");
    return data as T;
  }
  return {
    plans: () => call("GET", "/insurance/plans"),
    mine: () => call("GET", "/insurance/mine"),
    enrol: (planId) => call("POST", "/insurance/enrol", { plan_id: planId }),
    checkNhis: (memberNumber) => call("POST", "/insurance/nhis-check", { member_number: memberNumber }),
  };
}

export const insuranceApiFor = (session: Session): InsuranceApi => (session.mode === "live" ? httpInsuranceApi(session.token) : mockInsuranceApi(session));
