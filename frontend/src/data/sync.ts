import { add, get, getAll, put, remove, transact, type AuditEntry, type Op, type ResourceType, type Row } from "./db";
import { open, seal } from "./vault";
import type { Resource } from "./model";

/** What the phone sends for one record. `baseVersion` is the server version the phone last saw. */
export type PushRequest = { id: string; resourceType: string; patientId: string | null; version: number; baseVersion: number | null; resource: Resource };
export type PushResult =
  | { status: "ok"; serverVersion: number }
  | { status: "duplicate"; serverVersion: number }              // retry of something already stored (D-011: 200)
  | { status: "conflict"; serverVersion: number; resource: Resource } // same id, different data (D-011: 409)
  | { status: "retry"; reason: string }                        // e.g. the patient has not arrived yet
  | { status: "rejected"; reason: string };                    // refused for good, e.g. the time was taken (409 double_booked)

export type PullItem = { id: string; resourceType: string; patientId: string | null; version: number; resource: Resource };
export type PullPage = { items: PullItem[]; cursor: number; more: boolean };

/** patient-record-service (`httpSyncApi`) or, in test mode, the mock. `pull` downloads what this
 *  person is allowed to see that others created (e.g. a doctor sees the visits booked for them). */
export interface SyncApi {
  push(req: PushRequest): Promise<PushResult>;
  pull?(since: number): Promise<PullPage>;
}

/** The record stays on the phone for the next try. `retryAfterMs` is set when the server answered but can't take it now. */
export class NetworkError extends Error { constructor(msg = "No connection", readonly retryAfterMs?: number) { super(msg); this.name = "NetworkError"; } }

/** The sign-in has ended for good: the person must sign in again. Their queued records stay on the phone. */
export class SessionExpiredError extends Error { constructor() { super("Your sign-in has ended"); this.name = "SessionExpiredError"; } }

export type SyncSummary = { sent: number; conflicts: number; pending: number; offline: boolean; pulled: number; retryAfterMs?: number };

const running = new Map<string, Promise<SyncSummary>>();
const again = new Set<string>();

/** Sends everything waiting, oldest first. Safe to call twice at once (the second call joins the
 *  first) and safe to repeat after a lost reply (the server answers "duplicate"). If something is saved
 *  while a round is running, one more round follows straight away, so it never waits for the next timer. */
export function syncNow(userId: string, api: SyncApi): Promise<SyncSummary> {
  const current = running.get(userId);
  if (current) { again.add(userId); return current; }
  const p = (async () => {
    let summary = await run(userId, api);
    while (again.delete(userId)) summary = await run(userId, api);      // even after an offline round: the signal may have just come back
    return summary;
  })().finally(() => { running.delete(userId); again.delete(userId); });
  running.set(userId, p);
  return p;
}

/** Resolves when no send or download is running. Used before shutting down a person's data (and by tests). */
export async function whenSyncIdle(): Promise<void> {
  while (running.size > 0) await Promise.allSettled([...running.values()]);
}

async function setState(userId: string, id: string, patch: Partial<Row>) {
  await transact(userId, ["records"], "readwrite", async (s) => {
    const row = await get<Row>(s.records, id);
    if (row) await put(s.records, { ...row, ...patch });
  });
}

async function run(userId: string, api: SyncApi): Promise<SyncSummary> {
  let sent = 0, conflicts = 0, offline = false, pulled = 0, retryAfterMs: number | undefined;
  const ops = (await transact(userId, ["outbox"], "readonly", (s) => getAll<Op>(s.outbox))).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));

  for (const op of ops) {
    const row = await transact(userId, ["records"], "readonly", (s) => get<Row>(s.records, op.recordId));
    const drop = () => transact(userId, ["outbox"], "readwrite", (s) => remove(s.outbox, op.seq as number));
    if (!row) { await drop(); continue; }
    if (row.version !== op.version) { await drop(); continue; }        // changed again since: the newer entry will carry it
    if (row.syncState === "attention") continue;                       // waiting for a person to resolve a conflict

    const resource = await open<Resource>(userId, row.sealed, row.id);
    await setState(userId, row.id, { syncState: "sending" });
    let result: PushResult;
    try {
      result = await api.push({ id: row.id, resourceType: row.type, patientId: row.patientId, version: row.version, baseVersion: row.serverVersion, resource });
    } catch (e) {
      await setState(userId, row.id, { syncState: "saved" });          // the phone keeps it; try again later
      if (e instanceof NetworkError) { offline = true; retryAfterMs = e.retryAfterMs; break; }
      throw e;
    }

    if (result.status === "ok" || result.status === "duplicate") {
      await transact(userId, ["records", "outbox", "audit"], "readwrite", async (s) => {
        const latest = await get<Row>(s.records, row.id);
        if (latest) await put(s.records, { ...latest, serverVersion: result.serverVersion, syncState: latest.version === row.version ? "sent" : "saved" });
        await remove(s.outbox, op.seq as number);
        await add(s.audit, { at: new Date().toISOString(), userId, action: "sync", resourceType: row.type, resourceId: row.id } satisfies AuditEntry);
      });
      sent++;
    } else if (result.status === "conflict") {
      const conflict = await seal(userId, result.resource, `${row.id}:conflict`);
      await transact(userId, ["records", "outbox"], "readwrite", async (s) => {
        const latest = await get<Row>(s.records, row.id);
        if (latest) await put(s.records, { ...latest, syncState: "attention", conflict, serverVersion: result.serverVersion });
        await remove(s.outbox, op.seq as number);
      });
      conflicts++;
    } else if (result.status === "rejected") {
      await transact(userId, ["records", "outbox", "audit"], "readwrite", async (s) => {
        const latest = await get<Row>(s.records, row.id);
        if (latest) await put(s.records, { ...latest, syncState: "attention", rejected: result.reason });
        await remove(s.outbox, op.seq as number);
        await add(s.audit, { at: new Date().toISOString(), userId, action: "sync-rejected", resourceType: row.type, resourceId: row.id } satisfies AuditEntry);
      });
      conflicts++;
    } else {
      await setState(userId, row.id, { syncState: "saved" });          // retry: leave it in the queue, carry on
    }
  }

  if (!offline && api.pull) {
    try { pulled = await pullAll(userId, api); }
    catch (e) { if (e instanceof NetworkError) { offline = true; retryAfterMs = e.retryAfterMs; } else throw e; }
  }

  const left = await transact(userId, ["records"], "readonly", (s) => getAll<Row>(s.records));
  return { sent, conflicts, pending: left.filter((r) => r.syncState === "saved" || r.syncState === "sending").length, offline, pulled, retryAfterMs };
}

/** A person's decision on a conflict: keep what they typed, or take the server's copy. */
export async function resolveConflict(userId: string, recordId: string, choice: "mine" | "theirs"): Promise<void> {
  const row = await transact(userId, ["records"], "readonly", (s) => get<Row>(s.records, recordId));
  if (!row || row.syncState !== "attention" || !row.conflict) throw new Error("There is nothing to resolve for this record.");
  const theirs = await open<Resource>(userId, row.conflict, `${row.id}:conflict`);
  const now = new Date().toISOString();

  if (choice === "theirs") {
    const sealed = await seal(userId, theirs, row.id);
    await transact(userId, ["records", "audit"], "readwrite", async (s) => {
      await put(s.records, { ...row, sealed, conflict: undefined, syncState: "sent", version: row.serverVersion ?? row.version, updatedAt: now });
      await add(s.audit, { at: now, userId, action: "resolve-theirs", resourceType: row.type, resourceId: row.id } satisfies AuditEntry);
    });
    return;
  }
  // "mine": it becomes a new change on top of the server's version, and goes out again.
  const version = row.version + 1;
  await transact(userId, ["records", "outbox", "audit"], "readwrite", async (s) => {
    await put(s.records, { ...row, conflict: undefined, syncState: "saved", version, updatedAt: now });
    await add(s.outbox, { recordId: row.id, version, queuedAt: now } satisfies Op);
    await add(s.audit, { at: now, userId, action: "resolve-mine", resourceType: row.type, resourceId: row.id } satisfies AuditEntry);
  });
}

export async function conflictOf(userId: string, recordId: string): Promise<{ mine: Resource; theirs: Resource } | null> {
  const row = await transact(userId, ["records"], "readonly", (s) => get<Row>(s.records, recordId));
  if (!row?.conflict) return null;
  return { mine: await open<Resource>(userId, row.sealed, row.id), theirs: await open<Resource>(userId, row.conflict, `${row.id}:conflict`) };
}

/* ---------- downloading ---------- */

const CURSOR = "pullCursor";

/** Takes what the server has for this person and saves it on the phone. A record the phone has unsent changes to
 *  is left alone (pushing it settles any clash); everything else is replaced by the server's copy. Repeating a
 *  download changes nothing. */
async function pullAll(userId: string, api: SyncApi): Promise<number> {
  let taken = 0;
  let cursor = (await transact(userId, ["meta"], "readonly", (s) => get<{ key: string; value: number }>(s.meta, CURSOR)))?.value ?? 0;
  for (let page = 0; page < 50; page++) {                                // a safety limit on pages
    const res = await api.pull!(cursor);
    for (const item of res.items) {
      const sealed = await seal(userId, item.resource, item.id);
      const wrote = await transact(userId, ["records", "audit"], "readwrite", async (s) => {
        const have = await get<Row>(s.records, item.id);
        if (have && (have.syncState !== "sent" || (have.serverVersion ?? 0) >= item.version)) return false;
        await put(s.records, { id: item.id, type: item.resourceType as ResourceType, patientId: item.patientId, version: item.version, serverVersion: item.version, syncState: "sent", updatedAt: new Date().toISOString(), sealed } satisfies Row);
        await add(s.audit, { at: new Date().toISOString(), userId, action: "sync-pull", resourceType: item.resourceType, resourceId: item.id } satisfies AuditEntry);
        return true;
      });
      if (wrote) taken++;
    }
    cursor = res.cursor;
    await transact(userId, ["meta"], "readwrite", (s) => put(s.meta, { key: CURSOR, value: cursor }));
    if (!res.more) break;
  }
  return taken;
}

/** The reason the server refused a record, in words the screen can show. */
export async function rejectedOf(userId: string, recordId: string): Promise<{ reason: string; resource: Resource } | null> {
  const row = await transact(userId, ["records"], "readonly", (s) => get<Row>(s.records, recordId));
  if (!row?.rejected) return null;
  return { reason: row.rejected, resource: await open<Resource>(userId, row.sealed, row.id) };
}

/** A refused booking is cancelled (not deleted), so the person can book another time. */
export async function cancelRejected(userId: string, recordId: string): Promise<void> {
  const row = await transact(userId, ["records"], "readonly", (s) => get<Row>(s.records, recordId));
  if (!row?.rejected) throw new Error("There is nothing to resolve for this record.");
  const res = await open<Resource>(userId, row.sealed, row.id);
  if (res.resourceType !== "Appointment") throw new Error("Only a booking can be cancelled this way.");
  const sealed = await seal(userId, { ...res, status: "cancelled" }, row.id);
  const version = row.version + 1, now = new Date().toISOString();
  await transact(userId, ["records", "outbox", "audit"], "readwrite", async (s) => {
    await put(s.records, { ...row, sealed, rejected: undefined, syncState: "saved", version, updatedAt: now });
    await add(s.outbox, { recordId: row.id, version, queuedAt: now } satisfies Op);
    await add(s.audit, { at: now, userId, action: "resolve-cancel", resourceType: row.type, resourceId: row.id } satisfies AuditEntry);
  });
}

/* ---------- the real API ---------- */

export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? "https://api-hc.agroconnect.space";

/** About every 20 seconds, never sooner than the server asked, and up to 5 seconds later at random so phones
 *  don't all come back at the same moment after an outage. */
export const nextSyncDelay = (retryAfterMs = 0, random = Math.random()) => Math.max(20_000, retryAfterMs) + random * 5_000;

/** A fetch that fails like the rest of sync: no signal, or a signal that hangs, is a NetworkError. */
export async function reach(url: string, init: RequestInit): Promise<Response> {
  try { return await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) }); } catch { throw new NetworkError(); }
}

/** A 503 (database outage) or 429: the server is there but can't take this now. */
export function busy(res: Response): NetworkError {
  const seconds = Number(res.headers.get("retry-after"));
  return new NetworkError("The server is busy", Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0);
}

/** What sync needs from the sign-in. It lives in Session.tsx so a refreshed token reaches every call. */
export type LiveAuth = { token(): string; refresh(stale: string): Promise<void>; expire(): void };
export type TakenSlot = { start: string; end: string };

export function httpSyncApi(auth: LiveAuth, baseUrl = API_URL): Required<SyncApi> & { taken(specialistId: string, fromIso: string, toIso: string): Promise<TakenSlot[]> } {
  async function call(path: string, body?: unknown): Promise<Response> {
    const send = (token: string) => reach(baseUrl + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const token = auth.token();
    let res = await send(token);
    if (res.status === 401) {
      await auth.refresh(token);                  // throws if there is no way back but signing in
      res = await send(auth.token());
      if (res.status === 401) { auth.expire(); throw new SessionExpiredError(); }
    }
    if (res.status === 429 || res.status >= 500) throw busy(res);
    return res;
  }
  async function read<T>(path: string): Promise<T> {
    const res = await call(path);
    const data = res.ok ? await res.json().catch(() => null) as T | null : null;
    if (data === null) throw new NetworkError("Unexpected reply");    // e.g. a Wi-Fi login page
    return data;
  }
  return {
    async push(req) {
      const res = await call("/sync/push", req);
      const data = await res.json().catch(() => null) as PushResult | null;
      if (data && typeof data.status === "string") return data;       // the body is a PushResult at any status, 409 included
      if (res.status === 413) return { status: "rejected", reason: "too-large" };
      return { status: "retry", reason: `unexpected-reply-${res.status}` };
    },
    pull: (since) => read<PullPage>(`/sync/pull?since=${since}`),
    taken: (specialistId, fromIso, toIso) => read<TakenSlot[]>(`/sync/taken?${new URLSearchParams({ specialist: specialistId, from: fromIso, to: toIso }).toString()}`),
  };
}
