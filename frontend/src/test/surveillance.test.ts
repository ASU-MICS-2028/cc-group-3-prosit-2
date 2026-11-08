import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "../auth/types";
import { SurveillanceError, liveSurveillanceApi, mockSurveillanceApi, outbreakSignals, resetTestSurveillance } from "../data/surveillance";

const as = (role: Session["user"]["role"], id = "u1"): Session => ({ token: "t", mode: "test", user: { id, name: "Test", role } });

describe("surveillance, test mode (FB-7a)", () => {
  beforeEach(() => localStorage.clear());

  it("gives this week's totals for all 16 regions, all synthetic, with no patient fields", async () => {
    const s = await mockSurveillanceApi(as("ghs")).summary();
    expect(s.week_start).toBe("2026-11-02");
    expect(s.synthetic).toBe(true);
    expect(new Set(s.totals.map((t) => t.region)).size).toBe(16);
    expect(s.totals.every((t) => t.synthetic)).toBe(true);
    expect(JSON.stringify(s)).not.toMatch(/patient/i);
  });

  it("follows the DHS shape: more malaria in Upper East than in Greater Accra", async () => {
    const t = (await mockSurveillanceApi(as("ghs")).summary()).totals.filter((x) => x.condition === "malaria");
    const of = (r: string) => t.find((x) => x.region === r)!.case_count;
    expect(of("Upper East")).toBeGreaterThan(of("Greater Accra") * 4);
  });

  it("flags only the planted Ga East cholera, with the reason in plain words", async () => {
    const alerts = await mockSurveillanceApi(as("ghs")).alerts();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ district: "Ga East", condition: "cholera", case_count: 12, baseline: 3, status: "suggested" });
    expect(alerts[0].reason).toMatch(/12 cases of cholera in Ga East/);
  });

  it("applies the rule's edges: needs at least 5 cases and more than double the usual", () => {
    const rows = (counts: number[]) => counts.map((case_count, i) => ({ region: "R", district: "D", condition: "malaria" as const, week: `2026-10-0${i + 1}`, case_count }));
    expect(outbreakSignals(rows([1, 1, 1, 1, 4]))).toHaveLength(0);   // under 5
    expect(outbreakSignals(rows([5, 5, 5, 5, 10]))).toHaveLength(0);  // exactly double is not more than double
    expect(outbreakSignals(rows([5, 5, 5, 5, 11]))).toHaveLength(1);
    expect(outbreakSignals(rows([5, 5, 5, 11]))).toHaveLength(0);     // under 4 weeks of history
  });

  it("opening the list again doesn't create a second alert", async () => {
    const api = mockSurveillanceApi(as("ghs"));
    const first = await api.alerts();
    const second = await api.alerts();
    expect(second).toHaveLength(1);
    expect(second[0].id).toBe(first[0].id);
  });

  it("confirming sends the alert in test mode, and the decision then stands", async () => {
    const api = mockSurveillanceApi(as("ghs"));
    const [a] = await api.alerts();
    const done = await api.decide(a.id, "confirmed");
    expect(done.status).toBe("confirmed");
    expect(done.alert_sent_at).not.toBeNull();
    await expect(api.decide(a.id, "dismissed")).rejects.toMatchObject({ code: "already_decided" });
  });

  it("'start the demo again' brings the outbreak back as needing a decision", async () => {
    const session = as("ghs");
    const api = mockSurveillanceApi(session);
    const [a] = await api.alerts();
    await api.decide(a.id, "confirmed");
    resetTestSurveillance(session);
    const [again] = await api.alerts();
    expect(again).toMatchObject({ district: "Ga East", status: "suggested", alert_sent_at: null });
  });

  it("dismissing sends nothing", async () => {
    const api = mockSurveillanceApi(as("ghs"));
    const [a] = await api.alerts();
    expect((await api.decide(a.id, "dismissed")).alert_sent_at).toBeNull();
  });

  it("refuses other roles, and an unknown alert", async () => {
    for (const role of ["chv", "clinician", "pharmacist", "patient"] as const) {
      await expect(mockSurveillanceApi(as(role)).summary()).rejects.toBeInstanceOf(SurveillanceError);
    }
    await expect(mockSurveillanceApi(as("ghs")).decide("nope", "confirmed")).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("surveillance, live mode", () => {
  const fetchMock = vi.fn();
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
  afterEach(() => vi.unstubAllGlobals());
  const reply = (status: number, body: unknown) => fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));

  it("calls the API with the sign-in token, and posts the decision", async () => {
    const api = liveSurveillanceApi({ ...as("ghs"), mode: "live", token: "abc" }, "https://api.test");
    reply(200, { week_start: "2026-11-02", synthetic: true, totals: [] });
    await api.summary("Greater Accra");
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.test/surveillance/summary?region=Greater%20Accra");
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe("Bearer abc");

    reply(200, { id: "a1", status: "confirmed" });
    await api.decide("a1", "confirmed");
    expect(fetchMock.mock.calls[1][0]).toBe("https://api.test/surveillance/alerts/a1/decision");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ decision: "confirmed" });
  });

  it("turns the API's refusals into clear errors", async () => {
    const api = liveSurveillanceApi({ ...as("ghs"), mode: "live" }, "https://api.test");
    reply(409, { error: "already_decided", message: "This alert was already confirmed and that decision stands." });
    await expect(api.decide("a1", "dismissed")).rejects.toMatchObject({ code: "already_decided" });
    reply(403, { error: "forbidden", message: "A doctor account cannot see surveillance data" });
    await expect(api.alerts()).rejects.toMatchObject({ code: "forbidden" });
  });
});
