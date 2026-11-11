import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import type { Session } from "../auth/types";
import { mockHealerStockApi, type Healer } from "../data/healersStock";
import { navigate } from "../router";

const consent = vi.hoisted(() => ({ list: [] as { resource: unknown }[] }));
vi.mock("../data/repo", async (load) => ({ ...await load<object>(), listConsents: vi.fn(async () => consent.list) }));

const as = (role: Session["user"]["role"], id = role as string): Session => ({ token: "t", mode: "test", user: { id, name: id, role } });
const healer: Healer = { id: "00000000-0000-4000-8000-000000000005", name: "Nana Yaw Asare", community: "Kintampo", practice: null };
const purposeOf = (code: string, withdrawn = false) => ({ resource: { category: [{ coding: [{ code }] }], ...(withdrawn ? { extension: [{ url: "https://healthconnect.example/consent-withdrawn-at", valueDateTime: "2026-11-05" }] } : {}) } });
const input = { id: "r1", patient: { id: "p", name: "Abena" }, healer, reason: "Back pain" };

beforeEach(() => localStorage.clear());

describe("test mode follows the server's rules (FB-9b)", () => {
  const chv = mockHealerStockApi(as("chv", "c1"));
  const nana = mockHealerStockApi({ ...as("healer", healer.id) });

  it("refuses a healer referral without its own consent, or once withdrawn", async () => {
    consent.list = [purposeOf("clinical_care")];
    await expect(chv.refer(input)).rejects.toMatchObject({ code: "consent_missing" });
    consent.list = [purposeOf("healer_referral", true)];
    await expect(chv.refer(input)).rejects.toMatchObject({ code: "consent_withdrawn" });
    consent.list = [purposeOf("healer_referral")];
    expect((await chv.refer(input)).status).toBe("pending");
  });

  it("a healer accepts, then may refer back; only the healer can answer", async () => {
    consent.list = [purposeOf("healer_referral")];
    await chv.refer(input);
    await expect(chv.answer("r1", "accepted")).rejects.toMatchObject({ code: "forbidden" });
    await expect(nana.referBack("r1", "r2", "x")).rejects.toMatchObject({ code: "bad_status" });
    await nana.answer("r1", "accepted");
    const back = await nana.referBack("r1", "r2", "Needs a doctor");
    expect(back).toMatchObject({ direction: "from_healer", to: { id: "c1" } });
    expect((await chv.referrals()).map((r) => r.id).sort()).toEqual(["r1", "r2"]);
  });

  it("moves stock without going negative, and a retry moves it once", async () => {
    const admin = mockHealerStockApi(as("facility_admin"));
    const pharmacist = mockHealerStockApi(as("pharmacist"));
    const para = (await pharmacist.stock()).items.find((i) => i.name === "Paracetamol 500 mg")!;
    expect(para.low).toBe(true);
    await expect(pharmacist.moveStock({ id: "t1", itemId: para.id, toFacilityId: "clinic", quantity: 15 })).rejects.toMatchObject({ code: "insufficient_stock" });
    await pharmacist.moveStock({ id: "t2", itemId: para.id, toFacilityId: "clinic", quantity: 5 });
    await pharmacist.moveStock({ id: "t2", itemId: para.id, toFacilityId: "clinic", quantity: 5 });
    expect((await pharmacist.stock()).items.find((i) => i.id === para.id)!.quantity).toBe(9);
    expect((await admin.stock()).items.find((i) => i.name === "Paracetamol 500 mg")!.quantity).toBe(305);
    await expect(mockHealerStockApi(as("chv")).stock()).rejects.toMatchObject({ code: "forbidden" });
  });
});

async function signIn(name: string) {
  render(<App />);
  fireEvent.click(await screen.findByText(name));
  await screen.findByText("Choose a passphrase");
  fireEvent.change(screen.getByLabelText("Passphrase"), { target: { value: "blue goat river morning" } });
  fireEvent.change(screen.getByLabelText("Type it again"), { target: { value: "blue goat river morning" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText("Choose a PIN");
  fireEvent.change(screen.getByLabelText("PIN (4 to 6 digits)"), { target: { value: "4821" } });
  fireEvent.change(screen.getByLabelText("Type it again"), { target: { value: "4821" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
}

describe("screens", () => {
  it("the directory is labelled synthetic and says it is not medical advice or an endorsement", async () => {
    await signIn("Ama Serwaa");
    await screen.findByText("Hi Ama");
    act(() => navigate("/app/chv.healers"));
    expect(await screen.findByText(/made-up examples/)).toBeTruthy();
    expect(screen.getByText(/not medical advice and not an endorsement/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send to healer" })).toHaveProperty("disabled", true);
  });
  it("a pharmacist sees a low-stock alert", async () => {
    await signIn("Efua Darko");
    await screen.findAllByText("Verify");
    act(() => navigate("/app/pharmacist.stock"));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Low stock: Paracetamol/);
  });
});
