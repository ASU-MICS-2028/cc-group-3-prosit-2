import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { mockAuthApi } from "./mockApi";
import type { AuthApi, Session, User } from "./types";
import { hasPin } from "./pin";
import { shouldLock } from "./lock";

const KEY = "hc.session.v1";

type Ctx = {
  session: Session | null;
  user: User | null;
  locked: boolean;
  pinSet: boolean;
  api: AuthApi;
  signIn: (userId: string) => Promise<void>;
  signOut: () => Promise<void>;
  unlock: () => void;
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

export function SessionProvider({ children, api = mockAuthApi }: { children: ReactNode; api?: AuthApi }) {
  const [session, setSession] = useState<Session | null>(load);
  // Restarting the app with a saved session asks for the PIN again.
  const [locked, setLocked] = useState<boolean>(() => { const s = load(); return s !== null && hasPin(s.user.id); });
  const [pinSet, setPinSet] = useState<boolean>(() => { const s = load(); return s !== null && hasPin(s.user.id); });
  const hiddenAt = useRef<number | null>(null);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") hiddenAt.current = Date.now();
      else {
        if (session && hasPin(session.user.id) && shouldLock(hiddenAt.current, Date.now())) setLocked(true);
        hiddenAt.current = null;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [session]);

  const signIn = useCallback(async (userId: string) => {
    const s = await api.signIn(userId);
    localStorage.setItem(KEY, JSON.stringify(s));
    setSession(s);
    // Coming back to an account that already has a PIN asks for it; a new account sets its own.
    const has = hasPin(s.user.id);
    setPinSet(has);
    setLocked(has);
  }, [api]);

  /** Ends the session only. Each person's PIN and fingerprint stay on the phone. */
  const signOut = useCallback(async () => {
    await api.signOut();
    localStorage.removeItem(KEY);
    setSession(null);
    setLocked(false);
    setPinSet(false);
  }, [api]);

  const value = useMemo<Ctx>(() => ({
    session, user: session?.user ?? null, locked, pinSet, api, signIn, signOut,
    unlock: () => setLocked(false),
    refreshPin: () => setPinSet(session ? hasPin(session.user.id) : false),
  }), [session, locked, pinSet, api, signIn, signOut]);

  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export function useSession(): Ctx {
  const c = useContext(SessionCtx);
  if (!c) throw new Error("useSession needs a SessionProvider");
  return c;
}
