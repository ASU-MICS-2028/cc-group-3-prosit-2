import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CallEngine, initialState, type CallApi, type CallState, type RecordingResult } from "../call/engine";
import { RecordingBar, settleRecording } from "../screens/recordings";
import { RecordingError, keepRecording, mockRecordingApi, openRecording, type RecordingApi } from "../data/recordings";
import { createVault, lockVault, setKdfIterations } from "../data/vault";
import { deleteDb, get, transact } from "../data/db";
import { pendingCount } from "../data/repo";
import type { Session } from "../auth/types";

const capture = { stop: vi.fn(async () => ({ bytes: new Uint8Array([1, 2, 3]), contentType: "audio/webm" })), cancel: vi.fn() };
const recordStreams = vi.fn(() => capture);
vi.mock("../media/recorder", () => ({ recordStreams: () => recordStreams() }));

/** An engine in a connected call, with a stand-in for the channel to the other phone. */
const stream = { getTracks: () => [] } as unknown as MediaStream;
function connected() {
  const engine = new CallEngine("ws://test") as unknown as CallApi & { state: CallState; ctl: unknown; onPeerRec(op: string, id: string): void };
  const sent: { rec?: string; id?: string }[] = [];
  const ctl = { readyState: "open", send: (s: string) => sent.push(JSON.parse(s) as { rec?: string; id?: string }) };
  engine.ctl = ctl;
  engine.state = { ...initialState(), phase: "connected", localStream: stream, remoteStream: stream };
  return { engine, sent, ctl };
}
const started = () => recordStreams.mock.calls.length;
beforeEach(() => { recordStreams.mockClear(); capture.stop.mockClear(); capture.cancel.mockClear(); });

describe("recording consent in a call", () => {
  it("doesn't record on the ask; records only after the other person's yes, and the indicator shows first", () => {
    const { engine, sent } = connected();
    const seen: string[] = [];
    engine.subscribe(() => seen.push(engine.getState().rec.status));
    recordStreams.mockImplementationOnce(() => { seen.push(`start:${engine.getState().rec.status}`); return capture; });
    expect(engine.askToRecord("r1", vi.fn())).toBe(true);
    expect(engine.getState().rec.status).toBe("asking");
    expect(sent.at(-1)).toEqual({ rec: "ask", id: "r1" });
    expect(started()).toBe(0);
    engine.onPeerRec("agree", "someone-else");            // an answer to a different recording doesn't count
    expect(started()).toBe(0);
    engine.onPeerRec("agree", "r1");
    expect(started()).toBe(1);
    expect(engine.getState().rec).toEqual({ status: "on", id: "r1", recorder: true });
    expect(seen.indexOf("on")).toBeLessThan(seen.indexOf("start:on"));
  });

  it("the person asked sees the indicator as soon as they agree, and never records", () => {
    const { engine, sent } = connected();
    engine.onPeerRec("ask", "r1");
    expect(engine.getState().rec.status).toBe("asked");
    engine.agreeToRecord();
    expect(engine.getState().rec).toEqual({ status: "on", id: "r1", recorder: false });
    expect(sent.at(-1)).toEqual({ rec: "agree", id: "r1" });
    expect(started()).toBe(0);
  });

  it("the other person withdrawing stops at once and throws the sound away", () => {
    const { engine } = connected();
    const done = vi.fn<(r: RecordingResult) => void>();
    engine.askToRecord("r1", done); engine.onPeerRec("agree", "r1");
    engine.onPeerRec("withdraw", "r1");
    expect(engine.getState().rec.status).toBe("off");
    expect(capture.cancel).toHaveBeenCalledOnce();
    expect(capture.stop).not.toHaveBeenCalled();
    expect(done).toHaveBeenCalledWith({ id: "r1", outcome: "withdrawn", seconds: 0 });
  });

  it("my own withdrawal tells the other phone, and a stale ask can't restart it", () => {
    const { engine, sent } = connected();
    engine.askToRecord("r1", vi.fn()); engine.onPeerRec("agree", "r1");
    engine.withdrawRecording();
    expect(sent.some((m) => m.rec === "withdraw" && m.id === "r1")).toBe(true);
    expect(capture.cancel).toHaveBeenCalledOnce();
    engine.onPeerRec("agree", "r1");                       // arrives late
    expect(started()).toBe(1);
  });

  it("the answerer's indicator goes off when the recording phone stops", () => {
    const { engine } = connected();
    engine.onPeerRec("ask", "r1"); engine.agreeToRecord();
    engine.onPeerRec("off", "r1");
    expect(engine.getState().rec.status).toBe("off");
  });

  it("a call ending keeps what both agreed to, with the indicator off", async () => {
    const { engine } = connected();
    const done = vi.fn<(r: RecordingResult) => void>();
    engine.askToRecord("r1", done); engine.onPeerRec("agree", "r1");
    engine.leave();
    expect(engine.getState().rec.status).toBe("off");
    await waitFor(() => expect(done).toHaveBeenCalledWith(expect.objectContaining({ id: "r1", outcome: "finished", contentType: "audio/webm" })));
  });

  it("a call dropping while still asking records nothing", () => {
    const { engine } = connected();
    const done = vi.fn<(r: RecordingResult) => void>();
    engine.askToRecord("r1", done);
    engine.leave();
    expect(started()).toBe(0);
    expect(done).toHaveBeenCalledWith(expect.objectContaining({ outcome: "withdrawn" }));
  });

  it("can't ask when the other phone can't answer", () => {
    const { engine, ctl } = connected();
    (ctl as { readyState: string }).readyState = "closing";
    expect(engine.askToRecord("r1", vi.fn())).toBe(false);
  });
});

const fakeApi = (over: Partial<RecordingApi> = {}): RecordingApi => ({ agree: vi.fn(async () => undefined), withdraw: vi.fn(async () => undefined), finish: vi.fn(async () => undefined), list: vi.fn(async () => []), review: vi.fn(async () => undefined), ...over });
const fakeCall = (): CallApi => ({ agreeToRecord: vi.fn(), withdrawRecording: vi.fn(), askToRecord: vi.fn(() => true) } as unknown as CallApi);
const state = (rec: CallState["rec"]): CallState => ({ ...initialState(), phase: "connected", rec });
const bar = (api: CallApi, rec: CallState["rec"], recApi: RecordingApi, isDoctor = false) => render(<RecordingBar api={api} state={state(rec)} recApi={recApi} isDoctor={isDoctor} appointmentId="a1" onDone={vi.fn()} />);

describe("recording controls", () => {
  it("the doctor's yes is saved before the other person is asked", async () => {
    const order: string[] = [];
    const recApi = fakeApi({ agree: vi.fn(async () => { order.push("server"); }) });
    const api = fakeCall();
    (api.askToRecord as ReturnType<typeof vi.fn>).mockImplementation(() => { order.push("peer"); return true; });
    bar(api, { status: "off" }, recApi, true);
    fireEvent.click(screen.getByRole("button", { name: "Ask to record this visit" }));
    await waitFor(() => expect(order).toEqual(["server", "peer"]));
  });

  it("only the doctor sees the ask", () => {
    bar(fakeCall(), { status: "off" }, fakeApi());
    expect(screen.queryByRole("button", { name: /Ask to record/ })).toBeNull();
  });

  it("the question says what will happen to the sound, and a server failure counts as no", async () => {
    const api = fakeCall();
    bar(api, { status: "asked", id: "r1" }, fakeApi({ agree: vi.fn(async () => { throw new RecordingError("offline", "No connection"); }) }));
    expect(screen.getByText(/not uploaded anywhere/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Yes, record" }));
    await waitFor(() => expect(api.withdrawRecording).toHaveBeenCalled());
    expect(api.agreeToRecord).not.toHaveBeenCalled();
  });

  it("stopping acts on the phone even if the server can't be told", () => {
    const api = fakeCall();
    bar(api, { status: "on", id: "r1", recorder: false }, fakeApi({ withdraw: vi.fn(async () => { throw new Error("down"); }) }));
    fireEvent.click(screen.getByRole("button", { name: "Stop and delete recording" }));
    expect(api.withdrawRecording).toHaveBeenCalled();
  });
});

describe("what happens to the sound", () => {
  const U = "00000000-0000-4000-8000-0000000000aa";
  beforeEach(async () => { setKdfIterations(10); await createVault(U, "blue goat river morning"); });
  afterEach(async () => { await deleteDb(U); });
  const sound: RecordingResult = { id: "r1", outcome: "finished", seconds: 9, bytes: new Uint8Array([5, 6, 7]), contentType: "audio/webm" };

  it("is sealed on the phone, never queued for sync, and comes back only with the key", async () => {
    await keepRecording(U, "r1", new Uint8Array([5, 6, 7]), "audio/webm");
    expect(await pendingCount(U)).toBe(0);
    const row = await transact(U, ["meta"], "readonly", (s) => get<Record<string, unknown>>(s.meta, "recording:r1"));
    expect(Object.keys(row!).sort()).toEqual(["key", "sealed"]);
    expect([...(await openRecording(U, "r1"))!.bytes]).toEqual([5, 6, 7]);
    lockVault(U);
    await expect(openRecording(U, "r1")).rejects.toThrow();
  });

  it("is dropped if the server refuses it, kept and flagged if the server can't be reached", async () => {
    expect(await settleRecording(U, fakeApi({ finish: vi.fn(async () => { throw new RecordingError("consent_incomplete", "no"); }) }), sound)).toMatch(/deleted/);
    expect(await openRecording(U, "r1")).toBeUndefined();
    expect(await settleRecording(U, fakeApi({ finish: vi.fn(async () => { throw new RecordingError("offline", "no"); }) }), sound)).toMatch(/can't be reviewed/);
    expect(await openRecording(U, "r1")).toBeDefined();
  });

  it("is not kept when withdrawn, and the server is told", async () => {
    const recApi = fakeApi();
    await settleRecording(U, recApi, { id: "r1", outcome: "withdrawn", seconds: 0 });
    expect(recApi.withdraw).toHaveBeenCalledWith("r1");
    expect(await openRecording(U, "r1")).toBeUndefined();
  });
});

describe("the test-mode QA list follows the server's rules", () => {
  const as = (role: string, id = role): Session => ({ token: "t", mode: "test", user: { id, name: role, role, facility: "Test" } as Session["user"] });
  beforeEach(() => localStorage.clear());

  it("only an admin reviews, and withdrawn recordings don't appear", async () => {
    const doctor = mockRecordingApi(as("clinician")), admin = mockRecordingApi(as("facility_admin"));
    await doctor.agree("r1", "a"); await doctor.finish("r1", 30);
    await doctor.agree("r2", "a"); await doctor.withdraw("r2");
    expect((await admin.list()).map((r) => r.id)).toEqual(["r1"]);
    await expect(doctor.review("r1", "meets_standard", "")).rejects.toMatchObject({ code: "forbidden" });
    await expect(mockRecordingApi(as("chv")).list()).rejects.toMatchObject({ code: "forbidden" });
    await admin.review("r1", "needs_follow_up", "n");
    const [row] = await admin.list();
    expect(row).toMatchObject({ mayReview: false, reviews: [{ outcome: "needs_follow_up" }] });
  });
});
