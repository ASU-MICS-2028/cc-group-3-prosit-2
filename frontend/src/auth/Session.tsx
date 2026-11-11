import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { mockAuthApi } from "./mockApi";
import { httpAuthApi, SignInRefused, type LiveAuthApi } from "./liveApi";
import type { AuthApi, Session, User } from "./types";
import { hasPin } from "./pin";
import { SessionExpiredError, type LiveAuth } from "../data/sync";
import { hasVault, lockVault } from "../data/vault";
import { wipeLocalData } from "../data/wipe";
import { shouldLock } from "./lock";

const KEY = "hc.session.v1";
const liveAuthApi = httpAuthApi();
/** Someone is "set up" once they have both a passphrase (the vault) and a PIN. */
const isSetUp = (userId: string) => hasPin(userId) && hasVault(userId);

type Ctx = {
  session: Session | null;
  user: User | null;
  locked: boolean;
  pinSet: boolean;
  api: AuthApi;
  signIn: (userId: string) => Promise<void>;
  signInLive: (username: string, password: string) => Promise<void>;
  /** The last sign-in ended by itself, so the sign-in screen says why. */
  expired: boolean;
  liveAuth: LiveAuth;
  signOut: () => Promise<void>;
  unlock: () => void;
  lockNow: () => void;
  refreshPin: () => void;
};
const SessionCtx = createContext<Ctx | null>(null);

function load(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null; // a damaged entry means "signed out", never a crash
  }
}

/** The test accounts and the seeded real ones share ids, and a person's phone data is kept by id. Test records must
 *  never upload to the real server, nor a download bookmark carry across, so one phone keeps one kind per person. */
async function claimPhoneData(s: Session) {
  const key = `hc.mode.${s.user.id}`;
  const had = localStorage.getItem(key) ?? (hasVault(s.user.id) ? "test" : null);   // before real sign-in, everything was test mode
  if (had === "live" && s.mode === "test") throw new SignInRefused("This person has real records on this phone. Use their real sign-in.");
  if (had === "test" && s.mode === "live") await wipeLocalData(s.user.id);          // made-up records only
  localStorage.setItem(key, s.mode);
}

export function SessionProvider({ children, api = mockAuthApi, live = liveAuthApi }: { children: ReactNode; api?: AuthApi; live?: LiveAuthApi }) {
  const [session, setSession] = useState<Session | null>(load);
  // Restarting the app with a saved session asks for the PIN again.
  const [locked, setLocked] = useState<boolean>(() => { const s = load(); return s !== null && isSetUp(s.user.id); });
  const [pinSet, setPinSet] = useState<boolean>(() => { const s = load(); return s !== null && isSetUp(s.user.id); });
  const [expired, setExpired] = useState(false);
  const hiddenAt = useRef<number | null>(null);
  const refreshing = useRef<Promise<void> | null>(null);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") hiddenAt.current = Date.now();
      else {
        if (session && isSetUp(session.user.id) && shouldLock(hiddenAt.current, Date.now())) setLocked(true);
        hiddenAt.current = null;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [session]);

  const begin = useCallback(async (s: Session) => {
    await claimPhoneData(s);
    localStorage.setItem(KEY, JSON.stringify(s));
    setSession(s);
    setExpired(false);
    // Coming back to an account that already has a PIN asks for it; a new account sets its own.
    const has = isSetUp(s.user.id);
    setPinSet(has);
    setLocked(has);
  }, []);

  const signIn = useCallback(async (userId: string) => begin(await api.signIn(userId)), [api, begin]);
  const signInLive = useCallback(async (username: string, password: string) => begin(await live.signIn(username, password)), [live, begin]);

  /** Back to the sign-in screen. Only the session goes: the queue, the PIN and the records stay for this person. */
  const expire = useCallback(() => {
    const s = load();
    if (s) lockVault(s.user.id);
    localStorage.removeItem(KEY);
    setSession(null);
    setLocked(false);
    setPinSet(false);
    setExpired(true);
  }, []);

  /** A refresh token works once, and using one twice signs the person out everywhere, so one swap runs at a time and
   *  a call that lost the race just uses the token the winner saved.
   *  ponytail: two tabs refreshing in the same instant still trips that; wrap in navigator.locks if people run two tabs. */
  const refresh = useCallback((stale: string) => {
    refreshing.current ??= (async () => {
      const now = load();
      if (!now) throw new SessionExpiredError();
      if (now.token !== stale) { setSession(now); return; }
      const next = await live.refresh(now.refreshToken ?? "");       // no signal or a server fault throws, and the session stays
      if (!next) { expire(); throw new SessionExpiredError(); }
      if (load()?.user.id !== now.user.id) return;                   // signed out while the swap was running
      localStorage.setItem(KEY, JSON.stringify(next));
      setSession(next);
    })().finally(() => { refreshing.current = null; });
    return refreshing.current;
  }, [live, expire]);

  const liveAuth = useMemo<LiveAuth>(() => ({ token: () => load()?.token ?? "", refresh, expire }), [refresh, expire]);

  /** Ends the session only. Each person's PIN and fingerprint stay on the phone. */
  const signOut = useCallback(async () => {
    if (session) lockVault(session.user.id);   // the data key leaves memory: next time needs the passphrase
    if (session?.mode === "live") void live.signOut(session.refreshToken ?? "");   // best effort: signing out works with no signal
    else await api.signOut();
    localStorage.removeItem(KEY);
    setSession(null);
    setLocked(false);
    setPinSet(false);
  }, [api, live, session]);

  const value = useMemo<Ctx>(() => ({
    session, user: session?.user ?? null, locked, pinSet, api, signIn, signInLive, expired, liveAuth, signOut,
    unlock: () => setLocked(false),
    lockNow: () => setLocked(true),
    refreshPin: () => setPinSet(session ? isSetUp(session.user.id) : false),
  }), [session, locked, pinSet, api, signIn, signInLive, expired, liveAuth, signOut]);

  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export function useSession(): Ctx {
  const c = useContext(SessionCtx);
  if (!c) throw new Error("useSession needs a SessionProvider");
  return c;
}
