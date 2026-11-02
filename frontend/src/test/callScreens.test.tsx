import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "../App";
import { navigate } from "../router";
import { whenSyncIdle } from "../data/sync";
import { sharedServer } from "../data/DataProvider";
import { deleteDb } from "../data/db";
import { initialState, type CallApi, type CallState, type JoinOptions } from "../call/engine";

let net: { effectiveType?: string; downlink?: number } | undefined;
const reach = vi.fn<() => Promise<boolean>>();
vi.mock("../call/network", async (orig) => ({ ...(await orig<typeof import("../call/network")>()), currentNetwork: () => net, canReachServer: () => reach() }));

class FakeEngine implements CallApi {
  state: CallState = initialState();
  listeners = new Set<() => void>();
  join = vi.fn(async (o: JoinOptions) => { this.set({ phase: "waiting", audioOnly: o.audioOnly }); });
  leave = vi.fn(() => this.set({ ...initialState(), phase: "ended", message: "You left the call." }));
  toggleMute = vi.fn(() => this.set({ muted: !this.state.muted }));
  toggleCamera = vi.fn(async () => this.set({ cameraOff: !this.state.cameraOff }));
  setAudioOnly = vi.fn(async (on: boolean) => this.set({ audioOnly: on, quality: on ? "audio" : "good", suggestAudio: false }));
  dismissSuggestion = vi.fn(() => this.set({ suggestAudio: false }));
  getState = () => this.state;
  subscribe = (l: () => void) => { this.listeners.add(l); return () => { this.listeners.delete(l); }; };
  set(p: Partial<CallState>) { this.state = { ...this.state, ...p }; this.listeners.forEach((l) => l()); }
}

const PHRASE = "blue goat river morning";
const AMA = "00000000-0000-4000-8000-000000000001";
const open = (path: string) => act(() => navigate(path));
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const type = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const setOnline = (v: boolean) => Object.defineProperty(navigator, "onLine", { value: v, configurable: true });
let engine: FakeEngine;

async function signIn() {
  render(<App callEngine={engine} />);
  fireEvent.click(await screen.findByText("Ama Serwaa"));
  await screen.findByText("Choose a passphrase");
  type("Passphrase", PHRASE); type("Type it again", PHRASE); click("Continue");
  await screen.findByText("Choose a PIN");
  type("PIN (4 to 6 digits)", "4821"); type("Type it again", "4821"); click("Save");
  await screen.findByText("Hi Ama");
}

beforeEach(async () => {
  await whenSyncIdle();      // a send left over from the previous test must not touch this one
  localStorage.clear(); engine = new FakeEngine(); net = { effectiveType: "4g", downlink: 8 }; reach.mockReset(); reach.mockResolvedValue(true);
  setOnline(true);
  Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
  (globalThis as Record<string, unknown>).RTCPeerConnection = class {};
  (globalThis as Record<string, unknown>).MediaStream = class {};
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia: vi.fn(), enumerateDevices: async () => [{ kind: "audioinput" }] }, configurable: true });
  sharedServer.store.clear(); sharedServer.reachable = true;
  await deleteDb(AMA);
  navigate("/", { replace: true });
});

describe("before the call", () => {
  it("asks for a code; Continue waits for one; 'Make a code' fills it in", async () => {
    await signIn(); open("/app/chv.call");
    await screen.findByLabelText("Call code");
    expect(screen.getByRole("button", { name: "Continue" }).hasAttribute("disabled")).toBe(true);
    click("Make a code");
    expect((screen.getByLabelText("Call code") as HTMLInputElement).value).toMatch(/^hc-\d{4}$/);
    expect(screen.getByRole("button", { name: "Continue" }).hasAttribute("disabled")).toBe(false);
  });

  it("with a good connection: checks pass, and Join call joins that room with video, under the person's name", async () => {
    await signIn(); open("/app/chv.call");
    type("Call code", " Clinic 1 "); click("Continue");
    await screen.findByText("Before you join");
    await waitFor(() => expect(screen.getByText("Reachable")).toBeTruthy());
    click("Join call");
    await waitFor(() => expect(engine.join).toHaveBeenCalledWith({ room: "clinic-1", name: "Ama Serwaa", audioOnly: false }));
  });

  it("a code in the address skips the code page", async () => {
    await signIn(); open("/app/chv.call/hc-4821");
    await screen.findByText("Before you join");
    expect(screen.getByText("hc-4821")).toBeTruthy();
  });

  it("a weak connection offers audio only first", async () => {
    net = { effectiveType: "2g" };
    await signIn(); open("/app/chv.call/hc-1");
    await screen.findByText("Before you join");
    await waitFor(() => expect(screen.getByText("Reachable")).toBeTruthy());
    expect(screen.getAllByText("The connection is weak. Audio only works best.").length).toBeGreaterThan(0);
    click("Join with audio only");
    await waitFor(() => expect(engine.join).toHaveBeenCalledWith(expect.objectContaining({ audioOnly: true })));
  });

  it("offline: says so, and Join is not possible", async () => {
    setOnline(false);
    await signIn(); open("/app/chv.call/hc-1");
    await screen.findByText("Before you join");
    expect(await screen.findByText(/You're offline/, { selector: ".caption" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Join/ }).every((b) => b.hasAttribute("disabled"))).toBe(true);
  });

  it("not a secure page: explains, and Join is not possible", async () => {
    Object.defineProperty(window, "isSecureContext", { value: false, configurable: true });
    await signIn(); open("/app/chv.call/hc-1");
    expect(await screen.findByText(/Calls need a secure page/)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Join/ }).every((b) => b.hasAttribute("disabled"))).toBe(true);
  });

  it("call server unreachable: says so, and 'Check again' tries again", async () => {
    reach.mockResolvedValueOnce(false);
    await signIn(); open("/app/chv.call/hc-1");
    expect(await screen.findByText(/couldn't reach the call server/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Join call" }).hasAttribute("disabled")).toBe(true);
    click("Check again");
    await waitFor(() => expect(screen.getByRole("button", { name: "Join call" }).hasAttribute("disabled")).toBe(false));
  });

  it("two quick taps on Join make one call", async () => {
    await signIn(); open("/app/chv.call/hc-1");
    await waitFor(() => expect(screen.getByRole("button", { name: "Join call" }).hasAttribute("disabled")).toBe(false));
    const join = screen.getByRole("button", { name: "Join call" });
    fireEvent.click(join); fireEvent.click(join);
    await waitFor(() => expect(engine.join).toHaveBeenCalledTimes(1));
  });
});

describe("during the call", () => {
  async function inCall(patch: Partial<CallState> = {}) {
    await signIn(); open("/app/chv.call/hc-1");
    await waitFor(() => expect(screen.getByRole("button", { name: "Join call" }).hasAttribute("disabled")).toBe(false));
    click("Join call");
    await screen.findByRole("region", { name: "Video visit" });
    act(() => engine.set({ phase: "connected", remoteName: "Dr. Kofi Mensah", ...patch }));
  }

  it("shows who you're waiting for, then the other person's name and a timer once connected", async () => {
    await signIn(); open("/app/chv.call/hc-1");
    await waitFor(() => expect(screen.getByRole("button", { name: "Join call" }).hasAttribute("disabled")).toBe(false));
    click("Join call");
    expect(await screen.findByText(/Waiting for the other person to join/)).toBeTruthy();
    act(() => engine.set({ phase: "connected", remoteName: "Dr. Kofi Mensah", seconds: 75, remoteVideoOn: false }));
    expect(screen.getByText("Dr. Kofi Mensah")).toBeTruthy();
    expect(screen.getByText("01:15")).toBeTruthy();
    expect(screen.getByText("Good")).toBeTruthy();
  });

  it("mute, camera, audio only and end all reach the engine", async () => {
    await inCall();
    click("Mute"); expect(engine.toggleMute).toHaveBeenCalled();
    click("Turn camera off"); expect(engine.toggleCamera).toHaveBeenCalled();
    click("Switch to audio only"); await waitFor(() => expect(engine.setAudioOnly).toHaveBeenCalledWith(true));
    expect(screen.getByRole("button", { name: "Switch back to video" })).toBeTruthy();
    click("End call"); expect(engine.leave).toHaveBeenCalled();
  });

  it("a weak connection suggests audio; accepting switches, declining keeps video and hides the question", async () => {
    await inCall({ quality: "weak", suggestAudio: true });
    expect((await screen.findByRole("alert")).textContent).toContain("The connection is weak");
    click("Keep video");
    expect(engine.dismissSuggestion).toHaveBeenCalled();
    expect(screen.queryByText(/Switch to audio only\?/)).toBeNull();
    act(() => engine.set({ suggestAudio: true }));
    click("Switch to audio");
    await waitFor(() => expect(engine.setAudioOnly).toHaveBeenCalledWith(true));
    expect(screen.getByText("Audio only", { selector: ".badge" })).toBeTruthy();
  });

  it("audio only: no self-view, and the indicator says Audio only", async () => {
    await inCall({ audioOnly: true, quality: "audio", localStream: new MediaStream() });
    expect(screen.queryByLabelText("Your camera")).toBeNull();
    expect(screen.getByText("Audio only", { selector: ".badge" })).toBeTruthy();
  });

  it("the other person's camera off shows their name, not a black box", async () => {
    await inCall({ remoteVideoOn: false });
    expect(screen.getByText("Audio only", { selector: ".caption" })).toBeTruthy();
    expect(screen.getByText("Dr. Kofi Mensah")).toBeTruthy();
  });

  it("a notice from the engine is shown in words", async () => {
    await inCall({ message: "The connection was weak, so the call switched to audio only." });
    expect(screen.getByText("The connection was weak, so the call switched to audio only.")).toBeTruthy();
  });

  it("reconnecting is shown as weak, with a notice", async () => {
    await inCall({ phase: "reconnecting", message: "Connection lost. Trying to reconnect…" });
    expect(screen.getByText("Weak")).toBeTruthy();
    expect(screen.getAllByText(/Reconnecting|Trying to reconnect/).length).toBeGreaterThan(0);
  });

  it("leaving the page during a call ends it (the camera and microphone are released)", async () => {
    await inCall();
    open("/app/chv.today");
    await screen.findByText("Hi Ama");
    expect(engine.leave).toHaveBeenCalled();
  });
});

describe("after the call", () => {
  it("shows why it ended and how long it was, and 'Call again' goes back to the check", async () => {
    await signIn(); open("/app/chv.call/hc-1");
    await waitFor(() => expect(screen.getByRole("button", { name: "Join call" }).hasAttribute("disabled")).toBe(false));
    click("Join call"); await screen.findByRole("region", { name: "Video visit" });
    act(() => engine.set({ ...initialState(), phase: "ended", message: "The other person left.", seconds: 125 }));
    expect(await screen.findByText("The other person left.")).toBeTruthy();
    expect(screen.getByText("Call length: 2 min 5 s")).toBeTruthy();
    click("Call again");
    expect(await screen.findByText("Before you join")).toBeTruthy();
  });

  it("an error is explained in plain words, with no mascot, and offers another try", async () => {
    await signIn(); open("/app/chv.call/hc-1");
    await waitFor(() => expect(screen.getByRole("button", { name: "Join call" }).hasAttribute("disabled")).toBe(false));
    click("Join call"); await screen.findByRole("region", { name: "Video visit" });
    act(() => engine.set({ ...initialState(), phase: "error", message: "The camera or microphone is blocked. Allow it in the browser's settings, then try again." }));
    expect(await screen.findByText(/microphone is blocked/)).toBeTruthy();
    expect(document.querySelector("svg[aria-label^='HealthConnect mascot']")).toBeNull();
    expect(screen.getByRole("button", { name: "Call again" })).toBeTruthy();
  });
});
