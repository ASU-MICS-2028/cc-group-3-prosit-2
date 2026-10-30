import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSession } from "../auth/Session";
import { MockServer } from "./mockServer";
import { syncNow, type SyncApi, type SyncSummary } from "./sync";
import { VaultLockedError } from "./vault";

/** Test mode: one shared mock "server" that remembers its data between page loads. */
export const sharedServer = new MockServer("hc.mock.server.v1");

type Ctx = {
  userId: string;
  server: MockServer;
  /** Test switch: pretend there is no signal, even though the phone is online. */
  simulatedOffline: boolean;
  setSimulatedOffline: (v: boolean) => void;
  online: boolean;
  sync: () => Promise<SyncSummary | null>;
  lastSync: SyncSummary | null;
  /** Goes up whenever local data changed, so screens reload. */
  changed: number;
  notify: () => void;
};
const DataCtx = createContext<Ctx | null>(null);

export function DataProvider({ children, api = sharedServer }: { children: ReactNode; api?: SyncApi & { reachable?: boolean } }) {
  const { user, lockNow } = useSession();
  const [simulatedOffline, setSimulated] = useState(false);
  const [deviceOnline, setDeviceOnline] = useState(navigator.onLine);
  const [lastSync, setLastSync] = useState<SyncSummary | null>(null);
  const [changed, setChanged] = useState(0);
  const userId = user!.id;
  const online = deviceOnline && !simulatedOffline;
  const onlineRef = useRef(online);
  onlineRef.current = online;

  const notify = useCallback(() => setChanged((n) => n + 1), []);

  const sync = useCallback(async () => {
    if ("reachable" in api) (api as { reachable: boolean }).reachable = onlineRef.current;
    try {
      const summary = await syncNow(userId, api);
      setLastSync(summary);
      if (summary.sent > 0 || summary.conflicts > 0) setChanged((n) => n + 1);   // screens reload only if something moved
      return summary;
    } catch (e) {
      if (e instanceof VaultLockedError) { lockNow(); return null; }
      return null; // an unexpected server error: the records stay saved on the phone for the next try
    }
  }, [api, userId, lockNow]);

  // Send when the signal comes back, and every 20 seconds while the app is open.
  useEffect(() => {
    const on = () => { setDeviceOnline(true); void sync(); };
    const off = () => setDeviceOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    const timer = setInterval(() => { if (onlineRef.current) void sync(); }, 20_000);
    void sync();
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); clearInterval(timer); };
  }, [sync]);

  const setSimulatedOffline = useCallback((v: boolean) => { setSimulated(v); onlineRef.current = navigator.onLine && !v; if (!v) void sync(); }, [sync]);

  const value = useMemo<Ctx>(() => ({
    userId, server: sharedServer, simulatedOffline, setSimulatedOffline, online, sync, lastSync, changed, notify,
  }), [userId, simulatedOffline, setSimulatedOffline, online, sync, lastSync, changed, notify]);
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

export function useData(): Ctx {
  const c = useContext(DataCtx);
  if (!c) throw new Error("useData needs a DataProvider");
  return c;
}

/** Loads something from the phone's database and reloads when local data changes. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[] = []): { data?: T; error?: string; loading: boolean } {
  const { changed } = useData();
  const { lockNow } = useSession();
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  useEffect(() => {
    let live = true;
    load().then(
      (data) => live && setState({ data, loading: false }),
      (e: unknown) => {
        if (!live) return;
        if (e instanceof VaultLockedError) return lockNow();
        setState({ loading: false, error: e instanceof Error ? e.message : "Something went wrong." });
      },
    );
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changed, ...deps]);
  return state;
}
