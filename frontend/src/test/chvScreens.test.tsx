import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../App";
import { navigate } from "../router";
import { whenSyncIdle } from "../data/sync";
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
  await whenSyncIdle();      // a send left over from the previous test must not touch this one
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

  it("each wrong field shows its own message under it, and nothing is saved", async () => {
    await signInAma();
    open("/app/chv.register");
    await screen.findByLabelText("Full name");
    click("Save and continue");
    expect(await screen.findByText("Please enter the name.")).toBeTruthy();
    type("Full name", "Yaw2");
    expect(await screen.findByText("Names use letters only, no numbers.")).toBeTruthy();   // shown once the box was touched
    type("Full name", "Yaw Owusu"); type("Year of birth", "84"); fireEvent.blur(screen.getByLabelText("Year of birth"));
    expect(await screen.findByText(/Use a 4-digit year/)).toBeTruthy();
    type("Year of birth", "19a4");
    expect(await screen.findByText(/Numbers only. Use a 4-digit year/)).toBeTruthy();
    type("Year of birth", "1984");
    type(/Phone number/, "abc"); fireEvent.blur(screen.getByLabelText(/Phone number/));
    expect(await screen.findByText("Numbers only. Don't type letters or symbols.")).toBeTruthy();
    type(/Phone number/, "12");
    expect(await screen.findByText(/9 digits after \+233/)).toBeTruthy();
    type("Village or town", "Dodowa!!"); fireEvent.blur(screen.getByLabelText("Village or town"));
    expect(await screen.findByText("Use letters, numbers and spaces only.")).toBeTruthy();
    click("Save and continue");
    expect(screen.queryByText(/May we write down/)).toBeNull();                              // still on the form
    open("/app/chv.patients");
    expect(await screen.findByText("No patients yet. Add the first one.")).toBeTruthy();
  });

  it("a number with spaces or a leading 0 is accepted and saved in the +233 form", async () => {
    await signInAma();
    open("/app/chv.register");
    await screen.findByLabelText("Full name");
    type("Full name", "Yaw Owusu"); type(/Phone number/, "024 400 0001");
    click("Save and continue");
    await screen.findByText(/May we write down/);
    await waitFor(() => expect([...sharedServer.store.values()].some((s) => JSON.stringify(s.resource).includes("+233244000001"))).toBe(true), { timeout: 3000 });
  });

  it("registering a name that is already saved asks first: open that patient, or add a new one anyway", async () => {
    await signInAma(); await addPatient("Akosua Boateng");
    open("/app/chv.register");
    await screen.findByLabelText("Full name");
    type("Full name", "  akosua   BOATENG ");
    click("Save and continue");
    expect((await screen.findByRole("alert")).textContent).toContain("Akosua Boateng is already saved");
    expect(screen.queryByRole("button", { name: "Save and continue" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "No, add a new patient" }));
    await screen.findByText(/May we write down/);
    open("/app/chv.patients");
    await screen.findAllByText("Akosua Boateng");
    expect(screen.getAllByText(/record [0-9a-f]{4}/)).toHaveLength(2);                          // told apart by a short record tag
  });

  it("'Open that patient' goes to the saved record and adds nobody", async () => {
    await signInAma(); await addPatient("Akosua Boateng");
    open("/app/chv.register");
    await screen.findByLabelText("Full name");
    type("Full name", "Akosua Boateng"); click("Save and continue");
    fireEvent.click(await screen.findByRole("button", { name: "Open that patient" }));
    expect(await screen.findByText("Latest readings")).toBeTruthy();
    open("/app/chv.patients");
    await screen.findByText("Akosua Boateng");
    expect(screen.getAllByText("Akosua Boateng")).toHaveLength(1);
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

  it("a typing error (368 for 36.8) is shown under the box as you leave it, and nothing is saved", async () => {
    await signInAma(); await addPatient(); await openPatient();
    fireEvent.click(screen.getByRole("button", { name: "Record vitals" }));
    await screen.findByLabelText("Temperature");
    type("Temperature", "368"); fireEvent.blur(screen.getByLabelText("Temperature"));
    expect(await screen.findByText(/Body temperature of 368 °C looks wrong. It should be between 25 and 45/)).toBeTruthy();
    click("Save");
    await openPatient();
    expect(await screen.findByText("No readings yet.")).toBeTruthy();
  });

  it("letters in a number box are refused with a message, in every reading box", async () => {
    await signInAma(); await addPatient(); await openPatient();
    fireEvent.click(screen.getByRole("button", { name: "Record vitals" }));
    await screen.findByLabelText("Temperature");
    for (const [label, vital] of [[/top number/, "bp"], ["Bottom number", "bp"], ["Temperature", "t"], ["Weight", "w"], ["Height", "h"]] as const) {
      type(label, "abc"); fireEvent.blur(screen.getByLabelText(label));
    }
    await waitFor(() => expect(screen.getAllByText(/Numbers only. Use digits and one decimal point/)).toHaveLength(5));
    click("Save");
    expect(screen.queryByText("Latest readings")).toBeNull();                                  // still on the form
  });

  it("only one blood pressure number, an empty form and a comma decimal are each handled", async () => {
    await signInAma(); await addPatient(); await openPatient();
    fireEvent.click(screen.getByRole("button", { name: "Record vitals" }));
    await screen.findByLabelText("Temperature");
    click("Save");
    expect(await alertText()).toBe("Enter at least one reading.");
    type(/top number/, "120"); fireEvent.blur(screen.getByLabelText("Bottom number"));
    expect(await screen.findByText("Blood pressure needs both numbers.")).toBeTruthy();
    type("Bottom number", "130"); fireEvent.blur(screen.getByLabelText("Bottom number"));
    expect(await screen.findByText("The top number should be bigger than the bottom one.")).toBeTruthy();
    type(/top number/, ""); type("Bottom number", ""); type("Temperature", "37,4");
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
