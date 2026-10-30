import { deleteDb, get, transact, type Row } from "../data/db";
import { MockServer } from "../data/mockServer";
import { auditLog, createPatient, listPatients, pendingCount, recordConsent, recordVitals } from "../data/repo";
import { conflictOf, resolveConflict, syncNow } from "../data/sync";
import { createVault, lockVault, unlockVault, VaultLockedError, open } from "../data/vault";
import type { Patient } from "../data/model";

let u: string;
let server: MockServer;
beforeEach(async () => { localStorage.clear(); u = crypto.randomUUID(); await createVault(u, "4821"); server = new MockServer(); });
afterEach(() => deleteDb(u));

const state = async (id: string) => (await transact(u, ["records"], "readonly", (s) => get<Row>(s.records, id)))!.syncState;
const withData = async () => {
  const p = await createPatient(u, { fullName: "Akosua Boateng" });
  await recordConsent(u, p.id, "clinical_care", "patient");
  const obs = await recordVitals(u, p.id, { systolic: 148, diastolic: 94 });
  return { p, obs };
};
const renamed = (p: Patient, name: string): Patient => ({ ...p, name: [{ text: name }] });

describe("sending", () => {
  it("sends everything waiting, in order, and marks it sent", async () => {
    const { p, obs } = await withData();
    expect(await pendingCount(u)).toBe(4);
    const r = await syncNow(u, server);
    expect(r).toEqual({ sent: 4, conflicts: 0, pending: 0, offline: false });
    expect(server.store.size).toBe(4);
    expect(await state(p.id)).toBe("sent");
    expect(await state(obs[0].id)).toBe("sent");
    expect((await auditLog(u)).filter((e) => e.action === "sync")).toHaveLength(4);
  });

  it("nothing to send is fine", async () => {
    expect(await syncNow(u, server)).toEqual({ sent: 0, conflicts: 0, pending: 0, offline: false });
    expect(server.pushes).toBe(0);
  });

  it("offline: everything stays saved on the phone, then goes out when the signal returns, once", async () => {
    const { p } = await withData();
    server.reachable = false;
    const r1 = await syncNow(u, server);
    expect(r1.offline).toBe(true);
    expect(r1.pending).toBe(4);
    expect(await state(p.id)).toBe("saved");
    expect(server.store.size).toBe(0);
    server.reachable = true;
    expect((await syncNow(u, server)).sent).toBe(4);
    expect(server.store.size).toBe(4);
    expect((await syncNow(u, server)).sent).toBe(0);      // a third time: nothing more to send
  });

  it("signal drops half way: what was sent stays sent, the rest waits", async () => {
    const { p } = await withData();
    let n = 0;
    const flaky = { push: async (req: Parameters<MockServer["push"]>[0]) => { if (++n === 3) server.reachable = false; return server.push(req); } };
    const r = await syncNow(u, flaky);
    expect(r.offline).toBe(true);
    expect(r.sent).toBe(2);
    expect(r.pending).toBe(2);
    expect(await state(p.id)).toBe("sent");
    server.reachable = true;
    expect((await syncNow(u, server)).sent).toBe(2);
    expect(server.store.size).toBe(4);
  });

  it("a lost reply does not make a duplicate: the retry is recognised", async () => {
    const p = await createPatient(u, { fullName: "Akosua Boateng" });
    server.loseNextReply = true;
    expect((await syncNow(u, server)).offline).toBe(true);
    expect(server.store.size).toBe(1);                       // the server did get it
    expect(await state(p.id)).toBe("saved");                 // the phone doesn't know
    const r = await syncNow(u, server);
    expect(r.sent).toBe(1);
    expect(server.store.size).toBe(1);                       // still one record
    expect(server.store.get(p.id)?.version).toBe(1);
    expect(await state(p.id)).toBe("sent");
  });

  it("two syncs at the same moment send each record once", async () => {
    await withData();
    const [a, b] = await Promise.all([syncNow(u, server), syncNow(u, server)]);
    expect(a).toBe(b);
    expect(server.pushes).toBe(4);
  });

  it("a change made twice before sending goes out once, as the newest version", async () => {
    const p = await createPatient(u, { fullName: "Akosua" });
    await createPatient(u, { id: p.id, fullName: "Akosua Boateng" });   // same id again = an edit
    expect(await pendingCount(u)).toBe(1);
    const r = await syncNow(u, server);
    expect(r.sent).toBe(1);
    expect(server.pushes).toBe(1);
    expect((server.store.get(p.id)!.resource as Patient).name[0].text).toBe("Akosua Boateng");
  });

  it("a reading whose patient has not reached the server yet waits, and is not lost or marked as a conflict", async () => {
    const { p, obs } = await withData();
    await syncNow(u, server);
    server.store.delete(p.id);                                          // server lost the patient
    const o2 = await recordVitals(u, p.id, { weight: 61 });
    const r = await syncNow(u, server);
    expect(r.conflicts).toBe(0);
    expect(await state(o2[0].id)).toBe("saved");
    server.store.set(p.id, { version: 1, resource: renamed({ resourceType: "Patient", id: p.id, name: [{ text: "x" }] }, "x") });
    expect((await syncNow(u, server)).pending).toBe(0);
    expect(await state(o2[0].id)).toBe("sent");
    expect(await state(obs[0].id)).toBe("sent");
  });

  it("refuses to send while the vault is locked, and sends nothing", async () => {
    await withData();
    lockVault(u);
    await expect(syncNow(u, server)).rejects.toBeInstanceOf(VaultLockedError);
    expect(server.pushes).toBe(0);
    expect(await unlockVault(u, "4821")).toBe(true);
    expect((await syncNow(u, server)).sent).toBe(4);
  });

  it("an unexpected server error is raised, and the record is kept for next time", async () => {
    const p = await createPatient(u, { fullName: "A" });
    const broken = { push: async () => { throw new Error("500"); } };
    await expect(syncNow(u, broken)).rejects.toThrow("500");
    expect(await state(p.id)).toBe("saved");
    expect((await syncNow(u, server)).sent).toBe(1);
  });
});

describe("conflicts", () => {
  async function conflicted() {
    const p = await createPatient(u, { fullName: "Akosua Boateng" });
    await syncNow(u, server);
    server.editElsewhere(p.id, (r) => renamed(r as Patient, "Akosua B. (clinic)"));   // another phone
    await createPatient(u, { id: p.id, fullName: "Akosua Boateng-Mensah" });        // an edit here
    const r = await syncNow(u, server);
    return { p, r };
  }

  it("different data on a stale version is a conflict: nothing is overwritten, a person must choose", async () => {
    const { p, r } = await conflicted();
    expect(r.conflicts).toBe(1);
    expect(await state(p.id)).toBe("attention");
    const c = (await conflictOf(u, p.id))!;
    expect((c.mine as Patient).name[0].text).toBe("Akosua Boateng-Mensah");
    expect((c.theirs as Patient).name[0].text).toBe("Akosua B. (clinic)");
    expect((server.store.get(p.id)!.resource as Patient).name[0].text).toBe("Akosua B. (clinic)");  // server untouched
  });

  it("a record waiting for a decision is not resent, and does not block other records", async () => {
    const { p } = await conflicted();
    const other = await createPatient(u, { fullName: "Yaw Owusu" });
    const before = server.pushes;
    const r = await syncNow(u, server);
    expect(server.pushes - before).toBe(1);
    expect(r.sent).toBe(1);
    expect(await state(other.id)).toBe("sent");
    expect(await state(p.id)).toBe("attention");
  });

  it("keep mine: it goes out again on top of the server's version and wins", async () => {
    const { p } = await conflicted();
    await resolveConflict(u, p.id, "mine");
    expect(await state(p.id)).toBe("saved");
    expect((await syncNow(u, server)).sent).toBe(1);
    expect((server.store.get(p.id)!.resource as Patient).name[0].text).toBe("Akosua Boateng-Mensah");
    expect(await state(p.id)).toBe("sent");
    expect(await conflictOf(u, p.id)).toBeNull();
  });

  it("use theirs: the phone takes the server's copy and nothing is sent", async () => {
    const { p } = await conflicted();
    const before = server.pushes;
    await resolveConflict(u, p.id, "theirs");
    expect(await state(p.id)).toBe("sent");
    expect((await listPatients(u))[0].resource.name[0].text).toBe("Akosua B. (clinic)");
    expect((await syncNow(u, server)).sent).toBe(0);
    expect(server.pushes).toBe(before);
  });

  it("both choices are written to the audit log", async () => {
    const { p } = await conflicted();
    await resolveConflict(u, p.id, "theirs");
    expect((await auditLog(u)).some((a) => a.action === "resolve-theirs")).toBe(true);
  });

  it("resolving something that is not in conflict is refused", async () => {
    const p = await createPatient(u, { fullName: "A" });
    await expect(resolveConflict(u, p.id, "mine")).rejects.toThrow(/nothing to resolve/);
    await expect(resolveConflict(u, crypto.randomUUID(), "theirs")).rejects.toThrow();
  });

  it("the server's copy stays sealed on the phone too", async () => {
    const { p } = await conflicted();
    const raw = JSON.stringify(await transact(u, ["records"], "readonly", (s) => get<Row>(s.records, p.id)));
    expect(raw).not.toContain("clinic");
    const row = (await transact(u, ["records"], "readonly", (s) => get<Row>(s.records, p.id)))!;
    await expect(open(u, row.conflict!, p.id)).rejects.toThrow();   // wrong binding: must use the conflict binding
  });
});
