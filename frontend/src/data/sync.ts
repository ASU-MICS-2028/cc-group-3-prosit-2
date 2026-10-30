import { add, get, getAll, put, remove, transact, type AuditEntry, type Op, type Row } from "./db";
import { open, seal } from "./vault";
import type { Resource } from "./model";

/** What the phone sends for one record. `baseVersion` is the server version the phone last saw. */
export type PushRequest = { id: string; resourceType: string; patientId: string | null; version: number; baseVersion: number | null; resource: Resource };
export type PushResult =
  | { status: "ok"; serverVersion: number }
  | { status: "duplicate"; serverVersion: number }              // retry of something already stored (D-011: 200)
  | { status: "conflict"; serverVersion: number; resource: Resource } // same id, different data (D-011: 409)
  | { status: "retry"; reason: string };                       // e.g. the patient has not arrived yet

/** The real implementation will call patient-record-service; today a mock stands in. */
export interface SyncApi { push(req: PushRequest): Promise<PushResult>; }

export class NetworkError extends Error { constructor(msg = "No connection") { super(msg); this.name = "NetworkError"; } }

export type SyncSummary = { sent: number; conflicts: number; pending: number; offline: boolean };

const running = new Map<string, Promise<SyncSummary>>();

/** Sends everything waiting, oldest first. Safe to call twice at once (the second call joins the
 *  first) and safe to repeat after a lost reply (the server answers "duplicate"). */
export function syncNow(userId: string, api: SyncApi): Promise<SyncSummary> {
  const current = running.get(userId);
  if (current) return current;
  const p = run(userId, api).finally(() => running.delete(userId));
  running.set(userId, p);
  return p;
}

async function setState(userId: string, id: string, patch: Partial<Row>) {
  await transact(userId, ["records"], "readwrite", async (s) => {
    const row = await get<Row>(s.records, id);
    if (row) await put(s.records, { ...row, ...patch });
  });
}

async function run(userId: string, api: SyncApi): Promise<SyncSummary> {
  let sent = 0, conflicts = 0, offline = false;
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
      if (e instanceof NetworkError) { offline = true; break; }
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
    } else {
      await setState(userId, row.id, { syncState: "saved" });          // retry: leave it in the queue, carry on
    }
  }

  const left = await transact(userId, ["records"], "readonly", (s) => getAll<Row>(s.records));
  return { sent, conflicts, pending: left.filter((r) => r.syncState === "saved" || r.syncState === "sending").length, offline };
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
