import { beforeEach, describe, expect, it } from "vitest";
import { InsuranceError, insuranceApiFor, mockInsuranceApi, mockPremium, sandboxNhis } from "../data/insurance";
import { mockPayApi } from "../data/payments";
import type { Session } from "../auth/types";

const session: Session = { token: "t", mode: "test", user: { id: "p1", name: "A", role: "patient" } };
const api = mockInsuranceApi(session);

describe("insurance in test mode", () => {
  beforeEach(() => localStorage.clear());
  it("starts with no plan, and joining one is remembered; joining again changes nothing", async () => {
    expect(await api.mine()).toBeNull();
    const e = await api.enrol("community");
    expect(await api.mine()).toEqual(e);
    expect((await api.enrol("community")).id).toBe(e.id);
  });
  it("keeps the same enrolment when the plan changes, and refuses an unknown plan", async () => {
    const e = await api.enrol("community");
    const changed = await api.enrol("family");
    expect(changed.id).toBe(e.id);
    expect(changed.planId).toBe("family");
    await expect(api.enrol("gold")).rejects.toBeInstanceOf(InsuranceError);
  });
  it("charges the premium of the person's own plan, and premiums can repeat", async () => {
    const e = await api.enrol("family");
    expect(mockPremium("p1", e.id)).toBe(25);
    expect(mockPremium("p1", "another")).toBeNull();
    const pay = mockPayApi(session);
    const input = () => ({ id: crypto.randomUUID(), purpose: "insurance_premium" as const, subjectId: e.id, network: "mtn" as const, phone: "+233241234567" });
    expect((await pay.start(input())).amount).toBe(25);
    expect((await pay.start(input())).amount).toBe(25);
  });
  it("keeps each person's plan apart", async () => {
    await api.enrol("family");
    expect(await mockInsuranceApi({ ...session, user: { ...session.user, id: "p2" } }).mine()).toBeNull();
  });
  it.each([["1234 5678", "active"], ["12345670", "expired"], ["12345679", "not_found"]])("the pretend NHIS says %s is %s", (n, want) => expect(sandboxNhis(n)).toBe(want));
  it.each(["", "123", "abcdefgh", "123456789"])("refuses %j as a test number", (n) => expect(() => sandboxNhis(n)).toThrow(InsuranceError));
});

describe("insurance in live mode", () => {
  it("says plainly that it isn't connected, rather than pretending", async () => {
    await expect(insuranceApiFor({ ...session, mode: "live" }).plans()).rejects.toMatchObject({ code: "not_available" });
  });
});
