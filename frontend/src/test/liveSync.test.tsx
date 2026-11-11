import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useRef } from "react";
import { Routes } from "../App";
import { SessionProvider, useSession } from "../auth/Session";
import type { LiveAuthApi } from "../auth/liveApi";
import type { Session } from "../auth/types";
import { deleteDb, get, transact, type Row } from "../data/db";
import { createPatient, pendingCount } from "../data/repo";
import { NetworkError, SessionExpiredError, httpSyncApi, nextSyncDelay, rejectedOf, syncNow, whenSyncIdle, type LiveAuth } from "../data/sync";
import { createVault, hasVault, lockVault } from "../data/vault";
import { navigate } from "../router";

const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });
const auth: LiveAuth = { token: () => "t", refresh: async () => { throw new SessionExpiredError(); }, expire: () => undefined };
const fetchReplies = (...replies: Response[]) => {
  const f = vi.fn(async () => replies.length > 1 ? replies.shift()! : replies[0]);
  vi.stubGlobal("fetch", f);
  return f;
};

let u: string;
const state = async (id: string) => (await transact(u, ["records"], "readonly", (s) => get<Row>(s.records, id)))!.syncState;
const syncOnce = () => syncNow(u, { push: httpSyncApi(auth, "http://api").push });

beforeEach(async () => { localStorage.clear(); u = crypto.randomUUID(); await createVault(u, "4821"); });
afterEach(async () => { await whenSyncIdle(); vi.unstubAllGlobals(); await deleteDb(u); });

describe("the 20-second retry", () => {
  it("waits 20 to 25 seconds at random, and longer if the server asked", () => {
    expect(nextSyncDelay(0, 0)).toBe(20_000);
    expect(nextSyncDelay(0, 1)).toBe(25_000);
    expect(nextSyncDelay(60_000, 0)).toBe(60_000);
  });
});

describe("talking to the real sync API", () => {
  it("503: the record stays queued, and Retry-After is passed on", async () => {
    const p = await createPatient(u, { fullName: "Abena Owusu" });
    fetchReplies(json(503, { error: "unavailable" }, { "retry-after": "15" }));
    const r = await syncOnce();
    expect(r).toMatchObject({ sent: 0, pending: 1, offline: true, retryAfterMs: 15_000 });
    expect(await state(p.id)).toBe("saved");

    fetchReplies(json(201, { status: "ok", serverVersion: 1 }));
    expect((await syncOnce()).sent).toBe(1);
    expect(await state(p.id)).toBe("sent");
  });

  it("409 double booking: shown to the person, not retried", async () => {
    const p = await createPatient(u, { fullName: "Abena Owusu" });
    fetchReplies(json(409, { status: "rejected", reason: "slot-taken" }));
    expect((await syncOnce()).conflicts).toBe(1);
    expect(await state(p.id)).toBe("attention");
    expect((await rejectedOf(u, p.id))?.reason).toBe("slot-taken");
  });

  it("a reply that isn't ours, like a Wi-Fi login page, never counts as sent", async () => {
    const p = await createPatient(u, { fullName: "Abena Owusu" });
    fetchReplies(new Response("<html>Accept terms</html>", { status: 200 }));
    expect((await syncOnce()).sent).toBe(0);
    expect(await state(p.id)).toBe("saved");
  });

  it("no signal: NetworkError, with no Retry-After", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    await expect(httpSyncApi(auth, "http://api").pull(0)).rejects.toSatisfy((e) => e instanceof NetworkError && e.retryAfterMs === undefined);
  });

  it("401: refreshes once, retries with the new token, and keeps the record if refreshing is impossible", async () => {
    const p = await createPatient(u, { fullName: "Abena Owusu" });
    let token = "old";
    const refresh = vi.fn(async () => { token = "new"; });
    const f = fetchReplies(json(401, {}), json(201, { status: "ok", serverVersion: 1 }));
    await syncNow(u, { push: httpSyncApi({ ...auth, token: () => token, refresh }, "http://api").push });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(((f.mock.calls as unknown as [string, RequestInit][])[1][1].headers as Record<string, string>).authorization).toBe("Bearer new");

    const q = await createPatient(u, { fullName: "Yaw Owusu" });
    fetchReplies(json(401, {}));
    await expect(syncOnce()).rejects.toBeInstanceOf(SessionExpiredError);
    expect(await state(q.id)).toBe("saved");
    expect(await pendingCount(u)).toBe(1);
  });
});

describe("the live session", () => {
  const person = { id: "00000000-0000-4000-8000-0000000000aa", name: "Esi Addo", role: "chv" as const };
  const pair = (n: number): Session => ({ token: `t${n}`, refreshToken: `r${n}`, user: person, mode: "live" });
  const fakeLive = (over: Partial<LiveAuthApi> = {}): LiveAuthApi => ({ signIn: async () => pair(1), refresh: async () => pair(2), signOut: async () => undefined, ...over });

  beforeEach(() => navigate("/", { replace: true }));
  afterEach(async () => { await whenSyncIdle(); lockVault(person.id); await deleteDb(person.id); });

  it("a refresh token is used once, even when two calls find the old token expired", async () => {
    localStorage.setItem("hc.session.v1", JSON.stringify(pair(1)));
    const refresh = vi.fn(async () => pair(2));
    let auth!: LiveAuth;
    function Grab() { const s = useSession(); const r = useRef(s.liveAuth); auth = r.current; return null; }
    render(<SessionProvider live={fakeLive({ refresh })}><Grab /></SessionProvider>);
    await act(async () => { await Promise.all([auth.refresh("t1"), auth.refresh("t1")]); });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(auth.token()).toBe("t2");
    await act(async () => { await auth.refresh("t1"); });          // arriving late, after the swap
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("an expired sign-in goes to the sign-in screen, keeps the queue, and sends it after signing back in", async () => {
    const PHRASE = "blue goat river morning";
    const live = fakeLive({ refresh: async () => null });
    render(<SessionProvider live={live}><Routes /></SessionProvider>);
    fireEvent.click(await screen.findByText("Sign in with a real account"));
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "esi" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "not-a-real-one" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    vi.stubGlobal("fetch", vi.fn(async () => json(503, {})));      // no sign of the API yet: set up first
    await screen.findByText("Choose a passphrase");
    fireEvent.change(screen.getByLabelText("Passphrase"), { target: { value: PHRASE } });
    fireEvent.change(screen.getByLabelText("Type it again"), { target: { value: PHRASE } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText("Choose a PIN");
    fireEvent.change(screen.getByLabelText("PIN (4 to 6 digits)"), { target: { value: "4821" } });
    fireEvent.change(screen.getByLabelText("Type it again"), { target: { value: "4821" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByText("Choose a PIN")).toBeNull());
    const p = await createPatient(person.id, { fullName: "Abena Owusu" });

    vi.stubGlobal("fetch", vi.fn(async () => json(401, {})));
    window.dispatchEvent(new Event("online"));                     // the signal returns, the token has expired
    expect((await screen.findByRole("alert")).textContent).toMatch(/Your records are safe on this phone/);
    expect(localStorage.getItem("hc.session.v1")).toBeNull();
    await whenSyncIdle();
    expect(await pendingCount(person.id)).toBe(1);

    const pushes = vi.fn(async (url: string) => (url.includes("/sync/pull") ? json(200, { items: [], cursor: 0, more: false }) : json(201, { status: "ok", serverVersion: 1 })));
    vi.stubGlobal("fetch", pushes);
    fireEvent.click(await screen.findByText("Sign in with a real account"));
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "esi" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "not-a-real-one" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Enter your passphrase");
    fireEvent.change(screen.getByLabelText("Passphrase"), { target: { value: PHRASE } });
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
    await waitFor(async () => expect(await pendingCount(person.id)).toBe(0));
    expect(pushes.mock.calls.some(([url]) => url.includes("/sync/push"))).toBe(true);
    expect((await transact(person.id, ["records"], "readonly", (s) => get<Row>(s.records, p.id)))!.syncState).toBe("sent");
  });

  it("test records for an id are cleared before a real sign-in with that id, and real ones block test mode", async () => {
    await createVault(person.id, "4821");
    let useS!: ReturnType<typeof useSession>;
    function Grab() { useS = useSession(); return null; }
    render(<SessionProvider live={fakeLive()} api={{ demoAccounts: () => [person], signIn: async () => ({ token: "x", user: person, mode: "test" }), signOut: async () => undefined }}><Grab /></SessionProvider>);
    await act(async () => { await useS.signInLive("esi", "pw-pw-pw-pw"); });
    expect(hasVault(person.id)).toBe(false);

    await createVault(person.id, "4821");
    await expect(useS.signIn(person.id)).rejects.toThrow(/real records/);
    expect(hasVault(person.id)).toBe(true);
  });
});
