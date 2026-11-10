import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "../App";
import type { Session } from "../auth/types";
import { dueReminders, mockCommunityApi, type MaternalRecords } from "../data/community";
import { mockSurveillanceApi } from "../data/surveillance";
import { navigate } from "../router";

const as = (role: Session["user"]["role"], id = "u1"): Session => ({ token: "t", mode: "test", user: { id, name: "Test", role } });
const chv = mockCommunityApi(as("chv"));
const ghs = mockCommunityApi(as("ghs"));
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

describe("dueReminders", () => {
  const records: MaternalRecords = {
    pregnancies: [{ id: "p", patient: { id: "m", name: "Abena" }, dueDate: "2026-12-01", status: "active", visits: [
      { id: "late", label: "A", dueOn: "2026-11-01", done: false },
      { id: "soon", label: "B", dueOn: "2026-11-15", done: false },
      { id: "far", label: "C", dueOn: "2026-12-20", done: false },
      { id: "done", label: "D", dueOn: "2026-11-02", done: true },
    ] }],
    children: [],
  };
  it("lists overdue and next-7-day visits only, soonest first, and marks overdue", () => {
    const r = dueReminders(records, "2026-11-10");
    expect(r.map((x) => x.visitId)).toEqual(["late", "soon"]);
    expect(r[0].overdue).toBe(true);
    expect(r[1].overdue).toBe(false);
  });
});

describe("test mode follows the server's rules (FB-7b)", () => {
  beforeEach(() => localStorage.clear());

  it("a survey is built by GHS only, answered once per id, and counted", async () => {
    await expect(chv.buildSurvey({ id: "s", title: "T", questions: [] })).rejects.toMatchObject({ code: "forbidden" });
    const s = await ghs.buildSurvey({ id: "s", title: "Fever", questions: [{ text: "Any?", options: ["Yes", "No"] }] });
    await chv.answer(s.id, "a1", { q1: "Yes" });
    await chv.answer(s.id, "a1", { q1: "Yes" });
    await expect(chv.answer(s.id, "a2", { q1: "Blue" })).rejects.toMatchObject({ code: "refused" });
    expect((await ghs.results(s.id)).questions[0].counts).toEqual([{ option: "Yes", count: 1 }, { option: "No", count: 0 }]);
    await expect(chv.results(s.id)).rejects.toMatchObject({ code: "forbidden" });
    await ghs.closeSurvey(s.id);
    expect(await chv.surveys()).toEqual([]);
  });
  it("a pregnancy gets only the visits still ahead, and a closed record stops showing", async () => {
    await chv.addPregnancy({ id: "p", patient: { id: "m", name: "Abena" }, dueDate: day(70) });
    const { pregnancies } = await chv.maternal();
    expect(pregnancies[0].visits.map((v) => v.label)).toEqual(["30-week antenatal visit", "34-week antenatal visit", "36-week antenatal visit", "38-week antenatal visit", "40-week antenatal visit"]);
    await chv.closeRecord("pregnancies", "p", "delivered");
    expect((await chv.maternal()).pregnancies).toEqual([]);
  });
  it("a pharmacist cannot use decision support; a CHV is told it is not a diagnosis", async () => {
    await expect(mockCommunityApi(as("pharmacist")).checkSymptoms(["fever"])).rejects.toMatchObject({ code: "forbidden" });
    expect((await chv.checkSymptoms(["fever"])).disclaimer).toMatch(/not a diagnosis/i);
  });
  it("the forecast is the 4-week average, labelled, for public health staff only", async () => {
    const f = await mockSurveillanceApi(as("ghs")).forecast("Greater Accra");
    expect(f).toMatchObject({ estimate: true, synthetic: true });
    expect(f.method).toMatch(/last 4/);
    const cholera = f.forecasts.find((x) => x.condition === "cholera" && x.district === "Ga East")!;
    expect(cholera).toMatchObject({ estimate: 5, low: 2, high: 12 }); // weeks 3, 2, 3, 12
    await expect(mockSurveillanceApi(as("chv")).forecast()).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("the symptom check screen", () => {
  it("says not a diagnosis and not reviewed, shows the rule that fired, and the emergency button when one fires", async () => {
    render(<App />);
    fireEvent.click(await screen.findByText("Ama Serwaa"));
    await screen.findByText("Choose a passphrase");
    fireEvent.change(screen.getByLabelText("Passphrase"), { target: { value: "blue goat river morning" } });
    fireEvent.change(screen.getByLabelText("Type it again"), { target: { value: "blue goat river morning" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText("Choose a PIN");
    fireEvent.change(screen.getByLabelText("PIN (4 to 6 digits)"), { target: { value: "4821" } });
    fireEvent.change(screen.getByLabelText("Type it again"), { target: { value: "4821" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Hi Ama");
    act(() => navigate("/app/chv.symptoms"));
    expect(await screen.findAllByText(/not a diagnosis/i)).not.toHaveLength(0);
    expect(screen.getByText(/not been reviewed by a clinician/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Fever" }));
    fireEvent.click(screen.getByRole("button", { name: "Stiff neck" }));
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    await waitFor(() => screen.getByText("Possible meningitis"));
    expect(screen.getByText(/Rule: Fever \+ Stiff neck/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /emergency/i })).toBeTruthy();
    act(() => navigate("/app/chv.maternal"));
    expect(await screen.findByText("Due soon")).toBeTruthy();
    expect(screen.getByText(/SMS reminders aren't connected/)).toBeTruthy();
    expect(screen.queryByText("Abena Tetteh")).toBeNull();
    act(() => navigate("/app/chv.survey"));
    await screen.findByText(/No surveys open/);
  });
});
