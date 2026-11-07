import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { httpRxApi, mockRxApi, RxError, type NewRx } from "../data/prescriptions";
import type { Session } from "../auth/types";
import { navigate } from "../router";

const session = (id: string, name: string, role: Session["user"]["role"]): Session => ({ token: "t", mode: "test", user: { id, name, role, facility: "Test pharmacy" } });
const doctor = mockRxApi(session("d", "Dr. Kofi Mensah", "clinician"));
const pharmacist = mockRxApi(session("ph", "Efua Darko", "pharmacist"));
const input = (medication = "Amlodipine 5 mg", patient = "p1"): NewRx => ({ id: crypto.randomUUID(), patient: { id: patient, name: "Akosua" }, medication, dose: "1 tablet", frequency: "each morning", durationDays: 30, quantity: 30 });
const code = (e: unknown) => (e as RxError).code;

describe("test-mode prescriptions follow the server's rules", () => {
  beforeEach(() => localStorage.clear());

  it("issues once per id, with a code and a QR", async () => {
    const i = input();
    const a = await doctor.issue(i);
    expect(a.code).toMatch(/^\d{8}$/);
    expect(a.qr).toContain(a.code);
    expect((await doctor.issue(i)).code).toBe(a.code);
    expect((await doctor.mine())).toHaveLength(1);
  });
  it("only a clinician prescribes, and only a pharmacist verifies and dispenses", async () => {
    await expect(pharmacist.issue(input())).rejects.toMatchObject({ code: "forbidden" });
    const rx = await doctor.issue(input());
    await expect(doctor.verify({ code: rx.code! })).rejects.toMatchObject({ code: "forbidden" });
    await expect(doctor.dispense(rx.id, rx.code!, false)).rejects.toMatchObject({ code: "forbidden" });
  });
  it("verifies by code with spaces, or QR; never shows the code; refuses a wrong one", async () => {
    const rx = await doctor.issue(input());
    const seen = await pharmacist.verify({ code: `${rx.code!.slice(0, 4)} ${rx.code!.slice(4)}` });
    expect(seen.id).toBe(rx.id);
    expect(seen.code).toBeUndefined();
    expect((await pharmacist.verify({ qr: rx.qr! })).id).toBe(rx.id);
    await expect(pharmacist.verify({ code: "00000001" })).rejects.toMatchObject({ code: "not_found" });
  });
  it("dispenses once; a second try is refused", async () => {
    const rx = await doctor.issue(input());
    expect((await pharmacist.dispense(rx.id, rx.code!, false)).status).toBe("dispensed");
    await expect(pharmacist.dispense(rx.id, rx.code!, false)).rejects.toMatchObject({ code: "already_dispensed" });
  });
  it("flags a duplicate and a repeat, and holds them until acknowledged", async () => {
    await doctor.issue(input("Tramadol"));
    const second = await doctor.issue(input("TRAMADOL"));
    expect(second.flags.map((f) => f.kind)).toEqual(["duplicate"]);
    const third = await doctor.issue(input("tramadol"));
    expect(third.flags.map((f) => f.kind)).toEqual(["duplicate", "repeated"]);
    const held = await pharmacist.dispense(second.id, second.code!, false).catch((e: unknown) => e);
    expect(code(held)).toBe("flags_need_review");
    expect((held as RxError).flags).toHaveLength(1);
    expect((await pharmacist.dispense(second.id, second.code!, true)).flags[0].reviewed).toBe(true);
  });
  it("refuses a cancelled or expired prescription", async () => {
    const rx = await doctor.issue(input());
    await doctor.cancel(rx.id);
    await expect(pharmacist.dispense(rx.id, rx.code!, false)).rejects.toMatchObject({ code: "cancelled" });
    await expect(doctor.cancel(rx.id)).rejects.toMatchObject({ code: "already_cancelled" });
    const old = await doctor.issue(input("Old"));
    vi.useFakeTimers({ now: Date.now() + 31 * 86_400_000 });
    try {
      expect((await pharmacist.verify({ code: old.code! })).status).toBe("expired");
      await expect(pharmacist.dispense(old.id, old.code!, false)).rejects.toMatchObject({ code: "expired" });
    } finally { vi.useRealTimers(); }
  });
  it("shows a patient only their own", async () => {
    const mine = await doctor.issue(input("Mine", "p1"));
    await doctor.issue(input("Theirs", "p2"));
    const patient = mockRxApi(session("p1", "Akosua", "patient"));
    expect((await patient.mine()).map((r) => r.id)).toEqual([mine.id]);
    await expect(mockRxApi(session("g", "GHS", "ghs")).mine()).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("the live client", () => {
  const stub = (status: number, body: unknown) => vi.fn(async () => new Response(status === 204 ? null : JSON.stringify(body), { status }));

  it("sends the token and the fields the API expects", async () => {
    const f = stub(201, { id: "x" });
    vi.stubGlobal("fetch", f);
    const i = input();
    await httpRxApi("tok", "https://api.test").issue(i);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.test/prescriptions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body as string)).toEqual({ id: i.id, patient_id: "p1", medication: i.medication, dose: i.dose, frequency: i.frequency, duration_days: 30, quantity: 30 });
    vi.unstubAllGlobals();
  });
  it("turns a refusal into the server's words, with any flags", async () => {
    vi.stubGlobal("fetch", stub(409, { error: "flags_need_review", message: "Read these warnings first", flags: [{ kind: "duplicate", detail: "d", reviewed: false }] }));
    const e = await httpRxApi("tok").dispense("x", "1", false).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(RxError);
    expect(e).toMatchObject({ code: "flags_need_review", message: "Read these warnings first" });
    expect((e as RxError).flags).toHaveLength(1);
    vi.unstubAllGlobals();
  });
  it("says plainly when there is no connection, and copes with a body that isn't JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("failed"); }));
    await expect(httpRxApi("tok").mine()).rejects.toMatchObject({ code: "offline" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 502 })));
    await expect(httpRxApi("tok").mine()).rejects.toMatchObject({ code: "error" });
    vi.stubGlobal("fetch", stub(204, null));
    await expect(httpRxApi("tok").cancel("x")).resolves.toBeUndefined();
    vi.unstubAllGlobals();
  });
});
