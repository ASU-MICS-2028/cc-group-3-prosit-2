import type { Sealed } from "./vault";

/** IndexedDB, one database per person (`hc-<userId>`). Only the sealed payload is secret; the
 *  fields beside it (id, type, state) are what the sync engine needs and contain no health data. */
export type ResourceType = "Patient" | "Consent" | "Observation" | "Media";
export type SyncState = "saved" | "sending" | "sent" | "attention";

export type Row = {
  id: string;
  type: ResourceType;
  patientId: string | null;
  version: number;              // bumped on every change made on this phone
  serverVersion: number | null; // last version the server confirmed
  syncState: SyncState;
  updatedAt: string;
  sealed: Sealed;               // the FHIR resource
  conflict?: Sealed;            // the server's copy, when the two differ
};
export type Op = { seq?: number; recordId: string; version: number; queuedAt: string };
export type AuditEntry = { seq?: number; at: string; userId: string; action: string; resourceType: string; resourceId: string };

const connections = new Map<string, Promise<IDBDatabase>>();
const name = (userId: string) => `hc-${userId}`;

export function openDb(userId: string): Promise<IDBDatabase> {
  let p = connections.get(userId);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const req = indexedDB.open(name(userId), 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        const records = db.createObjectStore("records", { keyPath: "id" });
        records.createIndex("type", "type");
        records.createIndex("patientId", "patientId");
        db.createObjectStore("outbox", { keyPath: "seq", autoIncrement: true });
        db.createObjectStore("audit", { keyPath: "seq", autoIncrement: true });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    connections.set(userId, p);
    p.catch(() => connections.delete(userId));
  }
  return p;
}

const wrap = <T>(r: IDBRequest<T>) => new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

/** Runs `fn` in one transaction: either every change in it lands or none does. */
export async function transact<T>(userId: string, stores: string[], mode: IDBTransactionMode, fn: (s: Record<string, IDBObjectStore>) => Promise<T>): Promise<T> {
  const db = await openDb(userId);
  const tx = db.transaction(stores, mode);
  const map = Object.fromEntries(stores.map((n) => [n, tx.objectStore(n)]));
  const done = new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error ?? new Error("aborted")); });
  try {
    const out = await fn(map);
    await done;
    return out;
  } catch (e) {
    try { tx.abort(); } catch { /* already finished */ }
    await done.catch(() => undefined);
    throw e;
  }
}

export const get = <T>(s: IDBObjectStore, key: IDBValidKey) => wrap<T | undefined>(s.get(key));
export const getAll = <T>(s: IDBObjectStore) => wrap<T[]>(s.getAll());
export const put = (s: IDBObjectStore, v: unknown) => wrap(s.put(v));
export const add = (s: IDBObjectStore, v: unknown) => wrap(s.add(v));
export const remove = (s: IDBObjectStore, key: IDBValidKey) => wrap(s.delete(key));

export async function closeDb(userId: string) {
  const p = connections.get(userId);
  connections.delete(userId);
  if (p) (await p).close();
}

/** Used when a person's PIN is wiped: the data can no longer be opened, so it is removed. */
export async function deleteDb(userId: string) {
  await closeDb(userId);
  await new Promise<void>((res, rej) => { const r = indexedDB.deleteDatabase(name(userId)); r.onsuccess = () => res(); r.onerror = () => rej(r.error); r.onblocked = () => res(); });
}
