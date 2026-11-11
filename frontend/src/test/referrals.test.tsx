import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import type { Session } from "../auth/types";
import { httpCareApi, mockCareApi, type NewReferral } from "../data/referrals";
import { navigate } from "../router";

const session = (id: string, name: string, role: Session["user"]["role"]): Session => ({ token: "t", mode: "test", user: { id, name, role } });
const chv = mockCareApi(session("c", "Ama", "chv"));
const doctor = mockCareApi(session("d", "Dr. Kofi", "clinician"));
const ghs = mockCareApi(session("g", "GHS", "ghs"));
const input = (extra: Partial<NewReferral> = {}): NewReferral => ({ id: crypto.randomUUID(), patient: { id: "p1", name: "Akosua" }, to: { id: "d", name: "Dr. Kofi" }, reason: "Fever", signs: [], vitals: {}, ...extra });
const raise = () => chv.raise({ id: crypto.randomUUID(), description: "Struggling to breathe" });

describe("test-mode referrals follow the server's rules", () => {
  beforeEach(() => localStorage.clear());

  it("suggests from signs and vitals, and says why", async () => {
    expect(await chv.suggest(["convulsions"], {})).toMatchObject({ priority: "emergency", reason: expect.stringContaining("convulsions"), note: expect.stringContaining("not a diagnosis") });
    expect((await chv.suggest([], { temperature: 39.6 })).priority).toBe("urgent");
    expect((await chv.suggest([], { systolic: 145 })).priority).toBe("soon");
    expect((await chv.suggest([], { systolic: 118 })).priority).toBe("routine");
  });
  it("can change a suggestion but never lower an emergency", async () => {
    await expect(chv.refer(input({ signs: ["convulsions"], priority: "routine" }))).rejects.toMatchObject({ code: "cannot_lower_emergency" });
    expect((await chv.refer(input({ vitals: { systolic: 145 }, priority: "routine" }))).priorityReason).toContain("Changed to routine");
  });
  it("fills the doctor's inbox by priority then waiting time, and only the receiver acts", async () => {
    const routine = await chv.refer(input());
    const urgent = await chv.refer(input({ vitals: { temperature: 40 } }));
    const emergency = await chv.refer(input({ signs: ["unconscious"] }));
    expect((await doctor.referrals()).map((r) => r.id)).toEqual([emergency.id, urgent.id, routine.id]);
    await expect(chv.actOnReferral(routine.id, "accept")).rejects.toMatchObject({ code: "wrong_status" });
    await expect(mockCareApi(session("x", "Other", "clinician")).referral(routine.id)).rejects.toMatchObject({ code: "forbidden" });
    expect((await doctor.actOnReferral(routine.id, "accept")).status).toBe("accepted");
    expect((await doctor.referral(routine.id)).events?.at(-1)?.delivery).toBe("logged_only");
  });
  it("escalates an unanswered emergency by the clock and stops once acknowledged", async () => {
    const e = await raise();
    await expect(ghs.emergency(e.id)).rejects.toMatchObject({ code: "forbidden" });
    await expect(chv.actOnEmergency(e.id, "acknowledge")).rejects.toMatchObject({ code: "forbidden" });
    vi.useFakeTimers({ now: Date.now() + 16 * 60_000 });
    try {
      const seen = await ghs.emergency(e.id);
      expect(seen.level).toBe(3);
      expect(seen.nextEscalationAt).toBeNull();
      expect(seen.events?.map((s) => s.kind)).toEqual(["raised", "escalated", "escalated", "escalated"]);
      expect((await doctor.actOnEmergency(e.id, "acknowledge")).status).toBe("acknowledged");
      vi.setSystemTime(Date.now() + 60 * 60_000);
      expect((await chv.emergency(e.id)).level).toBe(3);
    } finally { vi.useRealTimers(); }
  });
  it("an acknowledged emergency does not escalate", async () => {
    const e = await raise();
    await doctor.actOnEmergency(e.id, "acknowledge");
    vi.useFakeTimers({ now: Date.now() + 30 * 60_000 });
    try { expect((await chv.emergency(e.id)).level).toBe(0); } finally { vi.useRealTimers(); }
  });
});

describe("the live client", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("sends the fields the API expects", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ id: "x" }), { status: 201 }));
    vi.stubGlobal("fetch", f);
    const i = input({ signs: ["not_eating"], vitals: { temperature: 38 }, priority: "urgent" });
    await httpCareApi("tok", "https://api.test").refer(i);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.test/referrals");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body as string)).toEqual({ id: i.id, patient_id: "p1", to_practitioner_id: "d", reason: "Fever", danger_signs: ["not_eating"], vitals: { temperature: 38 }, priority: "urgent" });
  });
  it("says so plainly with no connection", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("failed"); }));
    await expect(httpCareApi("t").emergencies()).rejects.toMatchObject({ code: "offline" });
  });
});

describe("the emergency screen", () => {
  const PHRASE = "correct horse battery";
  beforeEach(() => { localStorage.clear(); navigate("/"); });
  async function signInAma() {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /Ama Serwaa/ }));
    await screen.findByText("Choose a passphrase");
    fireEvent.change(screen.getByLabelText("Passphrase"), { target: { value: PHRASE } });
    fireEvent.change(screen.getByLabelText("Type it again"), { target: { value: PHRASE } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText("Choose a PIN");
    fireEvent.change(screen.getByLabelText("PIN (4 to 6 digits)"), { target: { value: "4821" } });
    fireEvent.change(screen.getByLabelText("Type it again"), { target: { value: "4821" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Hi Ama");
  }
  const offline = async (on: boolean) => { await act(async () => { Object.defineProperty(navigator, "onLine", { configurable: true, value: !on }); window.dispatchEvent(new Event(on ? "offline" : "online")); }); };

  it("offline it shows Call and SMS, with the placeholder number labelled", async () => {
    await signInAma();
    await offline(true);
    try {
      act(() => navigate("/app/chv.emergency"));
      await screen.findByText(/No signal/);
      expect(screen.getByRole("link", { name: "Call" }).getAttribute("href")).toBe("tel:0000000000");
      expect(screen.getByRole("link", { name: "SMS" }).getAttribute("href")).toContain("sms:0000000000");
      expect(screen.getByText(/Placeholder number/)).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Emergency" })).toBeNull();
    } finally { await offline(false); }
  });
  it("the referral form shows a suggestion, why, and that it's not a diagnosis", async () => {
    await signInAma();
    act(() => navigate("/app/chv.referral"));
    fireEvent.click(await screen.findByRole("button", { name: "Fever with rash" }));
    await screen.findByText(/Suggested urgent: fever with rash/);
    expect(screen.getByText(/not a diagnosis/)).toBeTruthy();
  });
  it("raises after a confirmation, and shows the timeline and the logged message", async () => {
    await signInAma();
    act(() => navigate("/app/chv.emergency"));
    fireEvent.click(await screen.findByRole("button", { name: "Convulsions" }));
    fireEvent.click(screen.getByRole("button", { name: "Emergency" }));
    fireEvent.click(await screen.findByRole("button", { name: "Yes, raise it" }));
    await screen.findByText("Next escalation");
    expect(screen.getByText("Raised")).toBeTruthy();
    expect(screen.getByText(/No SMS was sent/)).toBeTruthy();
  });
});
