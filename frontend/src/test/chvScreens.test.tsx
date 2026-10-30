import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../App";
import { navigate } from "../router";
import { sharedServer } from "../data/DataProvider";
import { deleteDb } from "../data/db";

const PHRASE = "blue goat river morning";
const AMA = "00000000-0000-4000-8000-000000000001";

async function signInAma() {
  render(<App />);
  fireEvent.click(await screen.findByText("Ama Serwaa"));
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
const open = (path: string) => act(() => navigate(path));
const type = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const alertText = async () => (await screen.findByRole("alert")).textContent ?? "";

async function addPatient(name = "Akosua Boateng", { agree = true, phone = "" } = {}) {
  open("/app/chv.register");
  await screen.findByLabelText("Full name");
  type("Full name", name);
  type("Village or town", "Dodowa");
  if (phone) type(/Phone number/, phone);
  click("Save and continue");
  await screen.findByText(/May we write down your health readings/);
  if (agree) {
    click("I agree");
    if (phone) { await screen.findByText(/reminders by SMS/); click("No thanks"); }
    await screen.findByText("Readings may be recorded");
  } else {
    click("Not now");
    await screen.findByText("No patients yet. Add the first one.", {}, { timeout: 100 }).catch(() => undefined);
  }
}
const openPatient = async (name = "Akosua Boateng") => { open("/app/chv.patients"); fireEvent.click(await screen.findByText(name)); await screen.findByText("Latest readings"); };
const goOffline = async (on: boolean) => {
  open("/app/sync");
  const chip = await screen.findByRole("button", { name: "Pretend I'm offline" });
  if ((chip.getAttribute("aria-pressed") === "true") !== on) fireEvent.click(chip);
};

beforeEach(async () => {
  localStorage.clear();
  sharedServer.store.clear(); sharedServer.reachable = true; sharedServer.pushes = 0; sharedServer.loseNextReply = false;
  await deleteDb(AMA);
  navigate("/", { replace: true });
});

describe("CHV records patients on the phone", () => {
  it("registers a patient offline: it is saved on the phone, then sent when the signal returns, once", async () => {
    await signInAma();
    await goOffline(true);
    expect(await screen.findByText(/You're offline/)).toBeTruthy();
    await addPatient();
    expect(sharedServer.store.size).toBe(0);                                  // nothing reached the server
    await openPatient();
    expect(within(await screen.findByLabelText("Signed in as")).getByText("Community health volunteer")).toBeTruthy();
    expect(screen.getAllByText("Saved on phone").length).toBeGreaterThan(0);
    await goOffline(false);
    await waitFor(() => expect(sharedServer.store.size).toBe(2), { timeout: 3000 });   // patient + consent
    await openPatient();
    await waitFor(() => expect(screen.getAllByText("Sent").length).toBeGreaterThan(0));
    expect(sharedServer.pushes).toBe(2);
  });

  it("Today shows how much is waiting to send", async () => {
    await signInAma();
    await goOffline(true);
    await addPatient();
    open("/app/chv.today");
    expect(await screen.findByText("2 waiting to send")).toBeTruthy();
    expect(screen.getByText(/It will send by itself/)).toBeTruthy();
  });

  it("refuses an empty name, a bad year and a bad phone, in plain words, without saving", async () => {
    await signInAma();
    open("/app/chv.register");
    await screen.findByLabelText("Full name");
    click("Save and continue");
    expect(await alertText()).toBe("Please enter the patient's name.");
    type("Full name", "Yaw"); type("Year of birth", "84");
    click("Save and continue");
    expect(await alertText()).toMatch(/4-digit year/);
    type("Year of birth", "1984"); type(/Phone number/, "12");
    click("Save and continue");
    expect(await alertText()).toBe("The phone number is not valid.");
    open("/app/chv.patients");
    expect(await screen.findByText("No patients yet. Add the first one.")).toBeTruthy();
  });

  it("a double tap on Save makes one patient", async () => {
    await signInAma();
    open("/app/chv.register");
    await screen.findByLabelText("Full name");
    type("Full name", "Esi Quaye");
    const save = screen.getByRole("button", { name: "Save and continue" });
    fireEvent.click(save); fireEvent.click(save);
    await screen.findByText(/May we write down your health readings/);
    open("/app/chv.patients");
    await screen.findByText("Esi Quaye");
    expect(screen.getAllByText("Esi Quaye")).toHaveLength(1);
  });

  it("search finds by name and says so when nobody matches", async () => {
    await signInAma();
    await addPatient("Akosua Boateng"); await addPatient("Yaw Owusu");
    open("/app/chv.patients");
    await screen.findByText("Yaw Owusu");
    fireEvent.change(screen.getByPlaceholderText("Search patients"), { target: { value: "yaw" } });
    expect(screen.queryByText("Akosua Boateng")).toBeNull();
    fireEvent.change(screen.getByPlaceholderText("Search patients"), { target: { value: "zzz" } });
    expect(await screen.findByText('No patient called "zzz".')).toBeTruthy();
  });
});

describe("consent and vitals", () => {
  it("no permission, no reading: the screen says why and offers to ask", async () => {
    await signInAma();
    await addPatient("Akosua Boateng", { agree: false });
    await openPatient();
    expect(await screen.findByText(/No permission yet/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Record vitals" }));
    await screen.findByLabelText("Temperature");
    type("Temperature", "37");
    click("Save");
    expect(await alertText()).toMatch(/Ask for permission to record/);
    expect(screen.getByRole("button", { name: "Ask for permission" })).toBeTruthy();
  });

  it("a typing error (368 for 36.8) is caught, and nothing is saved", async () => {
    await signInAma(); await addPatient(); await openPatient();
    fireEvent.click(screen.getByRole("button", { name: "Record vitals" }));
    await screen.findByLabelText("Temperature");
    type("Temperature", "368");
    click("Save");
    expect(await alertText()).toMatch(/looks wrong/);
    await openPatient();
    expect(await screen.findByText("No readings yet.")).toBeTruthy();
  });

  it("only one blood pressure number, an empty form and a comma decimal are each handled", async () => {
    await signInAma(); await addPatient(); await openPatient();
    fireEvent.click(screen.getByRole("button", { name: "Record vitals" }));
    await screen.findByLabelText("Temperature");
    click("Save");
    expect(await alertText()).toBe("Enter at least one reading.");
    type(/top number/, "120");
    click("Save");
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Blood pressure needs both numbers."));
    type(/top number/, ""); type("Temperature", "37,4");
    click("Save");
    expect(await screen.findByText("37.4 °C", {}, { timeout: 3000 })).toBeTruthy();
  });

  it("records blood pressure as one reading with a Check flag and the example-ranges note", async () => {
    await signInAma(); await addPatient(); await openPatient();
    fireEvent.click(screen.getByRole("button", { name: "Record vitals" }));
    await screen.findByLabelText("Temperature");
    type(/top number/, "148"); type("Bottom number", "94");
    click("Save");
    await screen.findByText("Latest readings");
    expect((await screen.findAllByText("148/94 mmHg")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Check").length).toBeGreaterThan(0);
    expect(screen.getByText(/Example ranges for testing/)).toBeTruthy();
  });

  it("a wrong reading is marked as a mistake, not deleted", async () => {
    await signInAma(); await addPatient(); await openPatient();
    fireEvent.click(screen.getByRole("button", { name: "Record vitals" }));
    await screen.findByLabelText("Weight");
    type("Weight", "61");
    click("Save");
    await screen.findAllByText("61 kg");
    click("Mark as a mistake");
    fireEvent.click(await screen.findByRole("button", { name: "Mark as mistake" }));
    expect(await screen.findByText("Marked as a mistake")).toBeTruthy();
    expect(screen.getAllByText(/61 kg/).length).toBeGreaterThan(0);          // still in the history
  });

  it("withdrawing permission blocks new readings, and asking again restores them", async () => {
    await signInAma(); await addPatient(); await openPatient();
    click("Withdraw");
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Withdraw" }));
    expect(await screen.findByText(/Permission was withdrawn/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Record vitals" }));
    await screen.findByLabelText("Temperature");
    type("Temperature", "37"); click("Save");
    expect(await alertText()).toMatch(/withdrew their permission/);
    click("Ask for permission");
    await screen.findByText(/May we write down your health readings/);
    click("I agree");
    await screen.findByText("Readings may be recorded");
    fireEvent.click(screen.getByRole("button", { name: "Record vitals" }));
    await screen.findByLabelText("Temperature");
    type("Temperature", "37"); click("Save");
    expect((await screen.findAllByText("37 °C")).length).toBeGreaterThan(0);
  });
});

describe("sync problems you can see", () => {
  it("a lost reply does not make a duplicate", async () => {
    await signInAma();
    await goOffline(true);
    await addPatient("Akosua Boateng", { agree: false });
    sharedServer.loseNextReply = true;
    await goOffline(false);
    await waitFor(() => expect(sharedServer.store.size).toBe(1));              // the server did get it
    open("/app/sync");
    click("Send now");
    await screen.findByText(/sent|Nothing to send/);
    expect(sharedServer.store.size).toBe(1);
    expect([...sharedServer.store.values()][0].version).toBe(1);
  });

  it("two versions of a permission: it waits, shows the differences, and keeping mine wins", async () => {
    await signInAma(); await addPatient();
    await waitFor(() => expect([...sharedServer.store.values()].some((v) => v.resource.resourceType === "Consent")).toBe(true));
    open("/app/sync");
    fireEvent.click(await screen.findByRole("button", { name: "Pretend another phone edited a permission" }));
    await openPatient();
    click("Withdraw");
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Withdraw" }));
    open("/app/sync");
    click("Send now");
    const row = await screen.findByText("Needs attention", { selector: ".badge" });
    fireEvent.click(row.closest("button") as HTMLElement);
    expect(await screen.findByText(/Two versions of this record are different/)).toBeTruthy();
    expect(screen.getAllByText(/This phone:/).length).toBeGreaterThan(0);
    click("Keep the version on this phone");
    await waitFor(() => expect([...sharedServer.store.values()].find((v) => v.resource.resourceType === "Consent")!.resource).toMatchObject({ status: "inactive" }), { timeout: 3000 });
  });
});
