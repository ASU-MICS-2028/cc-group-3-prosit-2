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

/** The premium the test-mode payment charges: the server's job once the insurance API exists. */
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

/** Live mode needs the insurance API, which waits for Elise's migration (E-M part 2). Until then it says so plainly. */
const notYet = async (): Promise<never> => { throw new InsuranceError("not_available", "Insurance isn't connected to the live service yet."); };
const liveInsuranceApi: InsuranceApi = { plans: notYet, mine: notYet, enrol: notYet, checkNhis: notYet };

export const insuranceApiFor = (session: Session): InsuranceApi => (session.mode === "live" ? liveInsuranceApi : mockInsuranceApi(session));
