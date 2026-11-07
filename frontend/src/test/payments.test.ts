import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpPayApi, mockPayApi, PayError, type NewPayment } from "../data/payments";
import type { Session } from "../auth/types";

const session: Session = { token: "t", mode: "test", user: { id: "p1", name: "Akosua", role: "patient" } };
const input = (extra: Partial<NewPayment> = {}): NewPayment => ({ id: crypto.randomUUID(), purpose: "consultation_fee", subjectId: "v1", network: "mtn", phone: "+233241234567", ...extra });

describe("test-mode payments follow the server's rules", () => {
  beforeEach(() => localStorage.clear());
  const pay = mockPayApi(session);

  it("sets the amount itself, and says it is simulated", async () => {
    expect(await pay.start(input())).toMatchObject({ amount: 25, status: "pending", simulated: true, testMode: true });
    expect((await pay.start(input({ purpose: "insurance_premium", subjectId: "e1" }))).amount).toBe(10);
  });
  it("gives the same payment for the same id, and refuses a second fee for one visit", async () => {
    const i = input();
    const a = await pay.start(i);
    expect((await pay.start(i)).id).toBe(a.id);
    expect(await pay.mine()).toHaveLength(1);
    await expect(pay.start(input())).rejects.toMatchObject({ code: "already_paid" });
  });
  it("fails a number ending in 0000, and lets them try again", async () => {
    expect((await pay.start(input({ phone: "+233240000000" }))).status).toBe("failed");
    expect((await pay.start(input())).status).toBe("pending");
  });
  it("lets premiums repeat: only a visit is once-only", async () => {
    await pay.start(input({ purpose: "insurance_premium", subjectId: "e1" }));
    await expect(pay.start(input({ purpose: "insurance_premium", subjectId: "e1" }))).resolves.toBeTruthy();
  });
  it("finishes after a moment", async () => {
    const a = await pay.start(input());
    vi.useFakeTimers({ now: Date.now() + 4_000 });
    try { expect((await pay.status(a.id)).status).toBe("successful"); } finally { vi.useRealTimers(); }
    await expect(pay.status("nope")).rejects.toMatchObject({ code: "not_found" });
  });
  it("shows only this person's payments", async () => {
    await pay.start(input());
    expect(await mockPayApi({ ...session, user: { ...session.user, id: "p2" } }).mine()).toEqual([]);
  });
});

describe("the live client", () => {
  it("sends the fields the API expects, and no amount", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ id: "x" }), { status: 201 }));
    vi.stubGlobal("fetch", f);
    const i = input();
    await httpPayApi("tok", "https://api.test").start(i);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.test/payments");
    expect(JSON.parse(init.body as string)).toEqual({ id: i.id, purpose: i.purpose, subject_id: "v1", network: "mtn", phone: i.phone });
    vi.unstubAllGlobals();
  });
  it("says nothing was charged when there is no connection, and passes on refusals", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("x"); }));
    const e = await httpPayApi("t").mine().catch((x: unknown) => x);
    expect(e).toBeInstanceOf(PayError);
    expect((e as PayError).message).toMatch(/Nothing was charged/);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "already_paid", message: "Paid" }), { status: 409 })));
    await expect(httpPayApi("t").start(input())).rejects.toMatchObject({ code: "already_paid", message: "Paid" });
    vi.unstubAllGlobals();
  });
});
