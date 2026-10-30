import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../App";
import { navigate } from "../router";
import { sharedServer } from "../data/DataProvider";
import { deleteDb } from "../data/db";
import { ImageError } from "../media/image";
import { RecorderError } from "../media/recorder";

const compress = vi.fn();
const start = vi.fn();
vi.mock("../media/image", async (orig) => ({ ...(await orig<typeof import("../media/image")>()), compressImage: (...a: unknown[]) => compress(...a) }));
vi.mock("../media/recorder", async (orig) => ({ ...(await orig<typeof import("../media/recorder")>()), startRecording: () => start() }));

const PHRASE = "blue goat river morning";
const AMA = "00000000-0000-4000-8000-000000000001";
const open = (path: string) => act(() => navigate(path));
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const type = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

async function patientPage({ agree = true } = {}) {
  render(<App />);
  fireEvent.click(await screen.findByText("Ama Serwaa"));
  await screen.findByText("Choose a passphrase");
  type("Passphrase", PHRASE); type("Type it again", PHRASE); click("Continue");
  await screen.findByText("Choose a PIN");
  type("PIN (4 to 6 digits)", "4821"); type("Type it again", "4821"); click("Save");
  await screen.findByText("Hi Ama");
  open("/app/chv.register");
  await screen.findByLabelText("Full name");
  type("Full name", "Akosua Boateng"); click("Save and continue");
  await screen.findByText(/May we write down/);
  if (agree) { click("I agree"); await screen.findByText("Readings may be recorded"); }
  else { click("Not now"); open("/app/chv.patients"); fireEvent.click(await screen.findByText("Akosua Boateng")); await screen.findByText("Latest readings"); }
}
const choosePhoto = () => fireEvent.change(screen.getByLabelText("Choose a photo"), { target: { files: [new File([new Uint8Array(10)], "wound.jpg", { type: "image/jpeg" })] } });
const alertText = async () => (await screen.findByRole("alert")).textContent ?? "";

function fakeRecording(bytes = new Uint8Array([1, 2, 3, 4]), contentType = "audio/webm") {
  const rec = { stop: vi.fn(async () => ({ bytes, contentType })), cancel: vi.fn() };
  start.mockResolvedValueOnce(rec);
  return rec;
}

beforeEach(async () => {
  localStorage.clear(); compress.mockReset(); start.mockReset();
  URL.createObjectURL = vi.fn(() => "blob:test"); URL.revokeObjectURL = vi.fn();
  sharedServer.store.clear(); sharedServer.reachable = true;
  await deleteDb(AMA);
  navigate("/", { replace: true });
});

describe("photos", () => {
  it("a photo is shrunk, saved with the record, and shown with its size and sync state", async () => {
    await patientPage();
    compress.mockResolvedValueOnce({ bytes: new Uint8Array(84_000), width: 1000, height: 750, contentType: "image/jpeg" });
    choosePhoto();
    expect(await screen.findByAltText("Photo of the patient")).toBeTruthy();
    expect(screen.getByText(/Photo · 84 KB/)).toBeTruthy();
    expect(compress).toHaveBeenCalledOnce();
  });

  it("without permission the photo is refused, with the reason", async () => {
    await patientPage({ agree: false });
    compress.mockResolvedValueOnce({ bytes: new Uint8Array(1000), width: 10, height: 10, contentType: "image/jpeg" });
    choosePhoto();
    expect(await alertText()).toMatch(/Ask for permission to record/);
    expect(screen.queryByAltText("Photo of the patient")).toBeNull();
  });

  it("a photo that cannot be read or made small enough shows plain advice and saves nothing", async () => {
    await patientPage();
    compress.mockRejectedValueOnce(new ImageError("We couldn't read that photo. Take it again."));
    choosePhoto();
    expect(await alertText()).toBe("We couldn't read that photo. Take it again.");
    compress.mockResolvedValueOnce({ bytes: new Uint8Array(400_000), width: 1, height: 1, contentType: "image/jpeg" });
    choosePhoto();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/too big/));
    expect(screen.queryByAltText("Photo of the patient")).toBeNull();
  });

  it("a photo can be marked as a mistake: it stays on record but is no longer shown", async () => {
    await patientPage();
    compress.mockResolvedValueOnce({ bytes: new Uint8Array(5000), width: 10, height: 10, contentType: "image/jpeg" });
    choosePhoto();
    await screen.findByAltText("Photo of the patient");
    const row = screen.getByText(/Photo · /).closest(".photo-done") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Mark as a mistake" }));
    await waitFor(() => expect(screen.queryByAltText("Photo of the patient")).toBeNull());
    expect(screen.getAllByText("Marked as a mistake").length).toBeGreaterThan(0);
  });

  it("choosing the same photo twice in a row works (the input is reset)", async () => {
    await patientPage();
    compress.mockResolvedValue({ bytes: new Uint8Array(5000), width: 10, height: 10, contentType: "image/jpeg" });
    choosePhoto(); await screen.findByAltText("Photo of the patient");
    choosePhoto();
    await waitFor(() => expect(screen.getAllByAltText("Photo of the patient")).toHaveLength(2));
  });
});

describe("voice notes", () => {
  it("records, stops, and saves a note you can play, marked as waiting for a signal", async () => {
    await patientPage();
    const rec = fakeRecording();
    click("Record a voice note");
    expect(await screen.findByText("Recording. Tap to finish.")).toBeTruthy();
    click("Stop recording");
    const player = await screen.findByLabelText("Play voice note");
    expect(player.tagName).toBe("AUDIO");
    expect(screen.getByText(/Voice note · 1 KB/)).toBeTruthy();
    expect(screen.getByText(/Written text will be added when there is a signal/)).toBeTruthy();
    expect(rec.stop).toHaveBeenCalledOnce();
  });

  it.each([
    ["insecure", "Recording needs a secure page (https). Use the secure address."],
    ["denied", "The microphone is blocked. Allow it in the browser's settings, then try again."],
    ["unsupported", "This phone's browser can't record voice notes."],
  ] as const)("when recording can't start (%s) it says why in plain words", async (code, message) => {
    await patientPage();
    start.mockRejectedValueOnce(new RecorderError(code, message));
    click("Record a voice note");
    expect(await alertText()).toBe(message);
    expect(screen.getByRole("button", { name: "Record a voice note" })).toBeTruthy();   // can try again
  });

  it("cancel throws the recording away", async () => {
    await patientPage();
    const rec = fakeRecording();
    click("Record a voice note");
    await screen.findByText("Recording. Tap to finish.");
    click("Cancel");
    expect(rec.cancel).toHaveBeenCalledOnce();
    expect(rec.stop).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Play voice note")).toBeNull();
  });

  it("leaving the page turns the microphone off", async () => {
    await patientPage();
    const rec = fakeRecording();
    click("Record a voice note");
    await screen.findByText("Recording. Tap to finish.");
    open("/app/chv.today");
    await screen.findByText("Hi Ama");
    expect(rec.cancel).toHaveBeenCalled();
  });

  it("an empty recording and a missing permission are reported", async () => {
    await patientPage({ agree: false });
    fakeRecording();
    click("Record a voice note");
    await screen.findByText("Recording. Tap to finish.");
    click("Stop recording");
    expect(await alertText()).toMatch(/Ask for permission to record/);
    start.mockResolvedValueOnce({ stop: vi.fn(async () => { throw new RecorderError("failed", "Nothing was recorded."); }), cancel: vi.fn() });
    click("Record a voice note");
    await screen.findByText("Recording. Tap to finish.");
    click("Stop recording");
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Nothing was recorded."));
  });

  it("two taps on the microphone start one recording", async () => {
    await patientPage();
    fakeRecording();
    const mic = screen.getByRole("button", { name: "Record a voice note" });
    fireEvent.click(mic); fireEvent.click(mic);
    await screen.findByText("Recording. Tap to finish.");
    expect(start).toHaveBeenCalledOnce();
  });
});
