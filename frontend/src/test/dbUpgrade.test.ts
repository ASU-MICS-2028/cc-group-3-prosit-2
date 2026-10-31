import { closeDb, deleteDb, get, openDb, put, transact } from "../data/db";

/** Phones that already hold records made by the previous version of the app have a version-1 database. */
describe("upgrading an existing database", () => {
  it("keeps the records, the queue and the log, and adds the download bookmark store", async () => {
    const u = crypto.randomUUID();
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(`hc-${u}`, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        const records = db.createObjectStore("records", { keyPath: "id" });
        records.createIndex("type", "type"); records.createIndex("patientId", "patientId");
        db.createObjectStore("outbox", { keyPath: "seq", autoIncrement: true });
        db.createObjectStore("audit", { keyPath: "seq", autoIncrement: true });
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(["records", "outbox", "audit"], "readwrite");
        tx.objectStore("records").put({ id: "r1", type: "Patient", patientId: "r1", version: 1, serverVersion: null, syncState: "saved", updatedAt: "x", sealed: { iv: "a", ct: "b" } });
        tx.objectStore("outbox").add({ recordId: "r1", version: 1, queuedAt: "x" });
        tx.objectStore("audit").add({ at: "x", userId: u, action: "create", resourceType: "Patient", resourceId: "r1" });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });

    const db = await openDb(u);                                         // the app opens it: version 2
    expect([...db.objectStoreNames].sort()).toEqual(["audit", "meta", "outbox", "records"]);
    expect((await transact(u, ["records"], "readonly", (s) => get(s.records, "r1")))).toMatchObject({ id: "r1", syncState: "saved" });
    expect((await transact(u, ["outbox"], "readonly", (s) => new Promise<unknown[]>((res) => { const r = s.outbox.getAll(); r.onsuccess = () => res(r.result); }))).length).toBe(1);
    expect((await transact(u, ["audit"], "readonly", (s) => new Promise<unknown[]>((res) => { const r = s.audit.getAll(); r.onsuccess = () => res(r.result); }))).length).toBe(1);
    await transact(u, ["meta"], "readwrite", (s) => put(s.meta, { key: "pullCursor", value: 7 }));
    expect((await transact(u, ["meta"], "readonly", (s) => get(s.meta, "pullCursor")))).toEqual({ key: "pullCursor", value: 7 });
    await closeDb(u); await deleteDb(u);
  });
});
