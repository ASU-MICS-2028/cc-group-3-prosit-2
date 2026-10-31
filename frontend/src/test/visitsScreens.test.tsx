import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../App";
import { navigate } from "../router";
import { whenSyncIdle } from "../data/sync";
import { sharedServer } from "../data/DataProvider";
import { deleteDb } from "../data/db";
import type { Appointment } from "../data/model";

const PHRASE = "blue goat river morning";
const AMA = "00000000-0000-4000-8000-000000000001";
const DR = "00000000-0000-4000-8000-000000000003";
const open = (path: string) => act(() => navigate(path));
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const type = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

async function setUp(pin = "4821") {
  await screen.findByText("Choose a passphrase", {}, { timeout: 8000 });
  type("Passphrase", PHRASE); type("Type it again", PHRASE); click("Continue");
  await screen.findByText("Choose a PIN");
  type("PIN (4 to 6 digits)", pin); type("Type it again", pin); click("Save");
}
async function signIn(name: string, greeting: string) {
  render(<App />);
  fireEvent.click(await screen.findByText(name));
  await setUp();
  await screen.findByText(greeting);
}
async function switchTo(name: string, greeting: string) {
  click("Switch account");
  fireEvent.click(await screen.findByText(name));
  await setUp();
  await screen.findByText(greeting);
}
async function addPatient(name = "Akosua Boateng", { agree = true, phone = "", reminders = false } = {}) {
  open("/app/chv.register");
  await screen.findByLabelText("Full name");
  type("Full name", name); if (phone) type(/Phone number/, phone);
  click("Save and continue");
  await screen.findByText(/May we write down/);
  if (!agree) { click("Not now"); return; }
  click("I agree");
  if (phone) { await screen.findByText(/reminders by SMS/); click(reminders ? "Yes, send reminders" : "No thanks"); }
  await screen.findByText("Readings may be recorded");
}
const patientId = () => [...sharedServer.store].find(([, s]) => s.resource.resourceType === "Patient")?.[0];
const idOfFirstPatient = async () => { await waitFor(() => expect(patientId()).toBeDefined(), { timeout: 3000 }); return patientId()!; };

/** Chooses the last free time on the last day shown, so the real clock can never make it "in the past" mid-test. */
async function pickFreeSlot(): Promise<string> {
  await screen.findByText(/Dr. Kofi Mensah/);
  for (const day of [...screen.getAllByRole("option")].reverse()) {
    fireEvent.click(day);
    await waitFor(() => expect(document.querySelectorAll("button.slot").length).toBeGreaterThan(0));
    await new Promise((r) => setTimeout(r, 30));
    const free = [...document.querySelectorAll<HTMLButtonElement>("button.slot:not([disabled])")].pop();
    if (free) { fireEvent.click(free); return free.textContent ?? ""; }
  }
  throw new Error("no free slot in the week");
}
const goOffline = async (on: boolean) => {
  open("/app/sync");
  const chip = await screen.findByRole("button", { name: "Pretend I'm offline" });
  if ((chip.getAttribute("aria-pressed") === "true") !== on) fireEvent.click(chip);
};

beforeEach(async () => {
  await whenSyncIdle();      // a send left over from the previous test must not touch this one
  localStorage.clear(); sharedServer.clear(); sharedServer.reachable = true;
  await deleteDb(AMA); await deleteDb(DR);
  navigate("/", { replace: true });
});

describe("a CHV books a visit", () => {
  it("picks a patient, a free time, books it, and sees it in Visits with its sync state and reminder note", async () => {
    await signIn("Ama Serwaa", "Hi Ama"); await addPatient();
    open("/app/chv.book");
    fireEvent.click(await screen.findByText("Akosua Boateng"));
    const time = await pickFreeSlot();
    expect(screen.getByText(/Times are shown in this phone's time zone/)).toBeTruthy();
    click("Book visit");
    await screen.findByText("Coming up", {}, { timeout: 8000 });
    expect(screen.getByText("Akosua Boateng")).toBeTruthy();
    expect(screen.getByText(/Video visit with Dr. Kofi Mensah/)).toBeTruthy();
    expect(screen.getByText(new RegExp(time.replace(/\s/g, "\\s")))).toBeTruthy();
    expect(await screen.findByText("No reminder: no permission for SMS")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Join call" })).toBeTruthy();
  });

  it("says an SMS reminder will go out only when there is permission and a phone number", async () => {
    await signIn("Ama Serwaa", "Hi Ama"); await addPatient("Akosua Boateng", { phone: "244000001", reminders: true });
    const id = await idOfFirstPatient();
    open(`/app/chv.book/${id}`); await pickFreeSlot(); click("Book visit");
    expect(await screen.findByText("SMS reminder will be sent (test mode)")).toBeTruthy();
  });

  it("without permission for care it says why and offers to ask", async () => {
    await signIn("Ama Serwaa", "Hi Ama"); await addPatient("Akosua Boateng", { agree: false });
    const id = await idOfFirstPatient();
    open(`/app/chv.book/${id}`); await pickFreeSlot(); click("Book visit");
    expect((await screen.findByRole("alert")).textContent).toMatch(/Ask for permission to record/);
    expect(screen.getByRole("button", { name: "Ask for permission" })).toBeTruthy();
  });

  it("Book visit stays off until a time is chosen; with no patients it sends you to add one", async () => {
    await signIn("Ama Serwaa", "Hi Ama");
    open("/app/chv.book");
    expect(await screen.findByText("Add a patient first.")).toBeTruthy();
    await addPatient();
    const id = await idOfFirstPatient();
    open(`/app/chv.book/${id}`);
    await screen.findByText(/Dr. Kofi Mensah/);
    expect(screen.getByRole("button", { name: "Book visit" }).hasAttribute("disabled")).toBe(true);
  });

  it("cancelling frees the visit: it moves to 'Earlier and cancelled' and cannot be joined", async () => {
    await signIn("Ama Serwaa", "Hi Ama"); await addPatient();
    const id = await idOfFirstPatient();
    open(`/app/chv.book/${id}`); await pickFreeSlot(); click("Book visit");
    await screen.findByText("Coming up", {}, { timeout: 8000 });
    click("Cancel visit");
    const sheet = await screen.findByRole("alertdialog");
    expect(within(sheet).getByText("Akosua Boateng")).toBeTruthy();                                // says which visit
    expect(within(sheet).getByText(/with Dr. Kofi Mensah/)).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("button", { name: "Yes, cancel the visit" }));
    expect(await screen.findByText("Earlier and cancelled")).toBeTruthy();
    expect(screen.getByText("Cancelled")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Join call" })).toBeNull();
  });
});

describe("the cancel sheet", () => {
  async function withVisit() {
    await signIn("Ama Serwaa", "Hi Ama"); await addPatient();
    const id = await idOfFirstPatient();
    open(`/app/chv.book/${id}`); await pickFreeSlot(); click("Book visit");
    await screen.findByText("Coming up", {}, { timeout: 8000 });
    click("Cancel visit");
    return screen.findByRole("alertdialog");
  }

  it("is a sheet with the visit's details and two full-width buttons, the main one first", async () => {
    const sheet = await withVisit();
    const buttons = within(sheet).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["Yes, cancel the visit", "Keep the visit"]);
    expect(sheet.classList.contains("sheet")).toBe(true);
  });

  it("'Keep the visit' closes it and the visit stays booked", async () => {
    const sheet = await withVisit();
    fireEvent.click(within(sheet).getByRole("button", { name: "Keep the visit" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(screen.getByText("Coming up")).toBeTruthy();
    expect(screen.queryByText("Earlier and cancelled")).toBeNull();
  });

  it("Escape closes it without cancelling", async () => {
    await withVisit();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(screen.queryByText("Earlier and cancelled")).toBeNull();
  });

  it("tapping outside the sheet closes it without cancelling", async () => {
    await withVisit();
    fireEvent.click(document.querySelector(".scrim") as HTMLElement);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(screen.queryByText("Earlier and cancelled")).toBeNull();
  });
});

describe("the offline booking notice", () => {
  it("offline, a visible notice sits above the times and says what will happen", async () => {
    await signIn("Ama Serwaa", "Hi Ama"); await addPatient();
    const id = await idOfFirstPatient();
    await goOffline(true);
    open(`/app/chv.book/${id}`);
    const notice = await screen.findByText("You're offline.", { selector: ".notice span" });
    const box = notice.closest(".notice") as HTMLElement;
    expect(box.textContent).toContain("We'll check the times are still free when you have a signal");
    expect(box.textContent).toContain("Needs attention");
    expect(box.compareDocumentPosition(document.querySelector("button.slot") as HTMLElement) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();   // above the times
  });

  it("online, there is no notice", async () => {
    await signIn("Ama Serwaa", "Hi Ama"); await addPatient();
    const id = await idOfFirstPatient();
    open(`/app/chv.book/${id}`);
    await screen.findByText(/Dr. Kofi Mensah/);
    await waitFor(() => expect(document.querySelector(".notice")).toBeNull());
  });
});

describe("the doctor sees what was booked with them", () => {
  it("after the CHV books and it is sent, the doctor's Today lists the visit and the patient is read only", async () => {
    await signIn("Ama Serwaa", "Hi Ama"); await addPatient();
    const id = await idOfFirstPatient();
    open(`/app/chv.book/${id}`); await pickFreeSlot(); click("Book visit");
    await screen.findByText("Coming up", {}, { timeout: 8000 });
    await waitFor(() => expect([...sharedServer.store.values()].some((s) => s.resource.resourceType === "Appointment")).toBe(true), { timeout: 3000 });

    await switchTo("Dr. Kofi Mensah", "Hi Dr. Mensah");
    expect(await screen.findByText("Visits booked with you", { selector: "h2" }, { timeout: 4000 })).toBeTruthy();
    const row = await screen.findByText("Akosua Boateng", {}, { timeout: 8000 });
    expect(row).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Join call" }).length).toBeGreaterThan(0);

    fireEvent.click(row);
    expect(await screen.findByText("Readings may be recorded", {}, { timeout: 8000 })).toBeTruthy();
    for (const hidden of ["Withdraw", "Record vitals", "Book a visit", "Emergency", "Take photo", "Mark as a mistake"]) expect(screen.queryByRole("button", { name: hidden }), hidden).toBeNull();
  });

  it("a doctor with no visits sees an empty page, and 'Check for new visits' finds nothing", async () => {
    await signIn("Dr. Kofi Mensah", "Hi Dr. Mensah");
    expect(await screen.findByText(/No visits yet/)).toBeTruthy();
    click("Check for new visits");
    await waitFor(() => expect(screen.getByRole("button", { name: "Check for new visits" }).hasAttribute("disabled")).toBe(false));
    expect(screen.getByText(/No visits yet/)).toBeTruthy();
    open("/app/clinician.patients");
    expect(await screen.findByText(/Patients appear here once a visit is booked with you/)).toBeTruthy();
  });

  it("the doctor can't open a patient they have no visit with", async () => {
    await signIn("Ama Serwaa", "Hi Ama"); await addPatient();
    const id = await idOfFirstPatient();
    await waitFor(() => expect(sharedServer.store.size).toBeGreaterThan(1), { timeout: 3000 });
    await switchTo("Dr. Kofi Mensah", "Hi Dr. Mensah");
    open(`/app/clinician.patient/${id}`);
    expect(await screen.findByText("We couldn't find that patient.")).toBeTruthy();
  });
});

describe("two phones, one time", () => {
  /** Someone else already holds this specialist's time on the server. */
  function takeOnServer(startIso: string) {
    const a: Appointment = {
      resourceType: "Appointment", id: crypto.randomUUID(), status: "booked", start: startIso, end: new Date(new Date(startIso).getTime() + 30 * 60_000).toISOString(),
      participant: [{ actor: { reference: "Patient/other" }, status: "accepted" }, { actor: { reference: `Practitioner/${DR}` }, status: "accepted" }],
    };
    sharedServer.store.set(a.id, { version: 1, resource: a, owner: "someone-else", patientId: null });
  }
  /** The last slot of the last bookable day: the same one pickFreeSlot chooses. */
  const latestSlotIso = () => {
    const now = new Date();
    for (let d = 6; d >= 0; d--) {
      const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + d));
      if (day.getUTCDay() !== 0) return new Date(day.getTime() + (16 * 60 - 30) * 60_000).toISOString();
    }
    throw new Error("none");
  };

  it("a time the server says is taken cannot be chosen", async () => {
    await signIn("Ama Serwaa", "Hi Ama"); await addPatient();
    const id = await idOfFirstPatient();
    takeOnServer(latestSlotIso());
    open(`/app/chv.book/${id}`);
    await screen.findByText(/Dr. Kofi Mensah/);
    for (const day of [...screen.getAllByRole("option")].reverse()) { fireEvent.click(day); break; }          // the last day shown
    const taken = new Date(latestSlotIso()).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    await waitFor(() => {
      const btn = [...document.querySelectorAll<HTMLButtonElement>("button.slot")].find((b) => b.textContent === taken);
      expect(btn?.hasAttribute("disabled")).toBe(true);
    });
  });

  it("booked offline for a time someone else took: refused when the signal returns, explained, and a new time can be chosen", async () => {
    await signIn("Ama Serwaa", "Hi Ama"); await addPatient();
    const id = await idOfFirstPatient();
    await waitFor(() => expect(sharedServer.store.size).toBeGreaterThan(1), { timeout: 3000 });
    await goOffline(true);
    open(`/app/chv.book/${id}`);
    await screen.findByText(/Dr. Kofi Mensah/);
    expect(await screen.findByText(/We'll check the times are still free when you have a signal/)).toBeTruthy();
    takeOnServer(latestSlotIso());                                           // the phone can't know
    await pickFreeSlot(); click("Book visit");
    await screen.findByText("Coming up", {}, { timeout: 8000 });
    await goOffline(false);
    open("/app/chv.visits");
    const see = await screen.findByRole("button", { name: "See what happened" }, { timeout: 5000 });
    fireEvent.click(see);
    expect(await screen.findByText(/Someone else booked that time first/)).toBeTruthy();
    click("Choose another time");
    expect(await screen.findByText(/Dr. Kofi Mensah/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Book visit" })).toBeTruthy();
  });
});
