import { openDb, deleteDb } from "../data/db";
import { createVault, lockVault, unlockVault, VaultLockedError } from "../data/vault";
import {
  RepoError, addMedia, auditLog, createPatient, getPatient, listConsents, listMedia, listObservations, listPatients, markObservationInError,
  pendingCount, recordConsent, recordVitals, withdrawConsent,
} from "../data/repo";
import { consentPurpose, observationGroup } from "../data/model";

let u: string;
beforeEach(async () => { localStorage.clear(); u = crypto.randomUUID(); await createVault(u, "4821"); });
afterEach(() => deleteDb(u));

const code = async (p: Promise<unknown>) => p.then(() => "no error", (e) => (e instanceof RepoError ? e.code : String(e)));
const patient = () => createPatient(u, { fullName: "Akosua Boateng", village: "Dodowa" });
const consented = async () => { const p = await patient(); await recordConsent(u, p.id, "clinical_care", "patient"); return p; };

describe("patients", () => {
  it("saves a FHIR-shaped patient", async () => {
    const p = await createPatient(u, { fullName: "  Akosua Boateng ", gender: "female", birthDate: "1980-05-01", phone: "+233000000001", language: "Twi" });
    expect(p.resourceType).toBe("Patient");
    expect(p.name[0].text).toBe("Akosua Boateng");
    expect((await getPatient(u, p.id)).resource.telecom?.[0].value).toBe("+233000000001");
  });

  it.each([
    ["empty name", { fullName: "   " }],
    ["very long name", { fullName: "x".repeat(201) }],
    ["bad phone", { fullName: "A", phone: "0244000000" }],
    ["future birth date", { fullName: "A", birthDate: "2999-01-01" }],
    ["unparseable birth date", { fullName: "A", birthDate: "soon" }],
  ])("refuses %s", async (_n, input) => expect(await code(createPatient(u, input))).toBe("invalid"));

  it("an unknown patient is reported as not found, and the attempt is still logged", async () => {
    expect(await code(getPatient(u, crypto.randomUUID()))).toBe("not-found");
    expect((await auditLog(u)).some((a) => a.action === "read" && a.resourceType === "Patient")).toBe(true);
  });

  it("lists patients by name", async () => {
    await createPatient(u, { fullName: "Yaw" }); await createPatient(u, { fullName: "Abena" });
    expect((await listPatients(u)).map((v) => v.resource.name[0].text)).toEqual(["Abena", "Yaw"]);
  });

  it("each person sees only their own phone's patients", async () => {
    await patient();
    const other = crypto.randomUUID(); await createVault(other, "1111");
    expect(await listPatients(other)).toEqual([]);
    await deleteDb(other);
  });
});

describe("consent comes first (D-012, D-014)", () => {
  it("no consent: no reading", async () => {
    const p = await patient();
    expect(await code(recordVitals(u, p.id, { temperature: 37 }))).toBe("consent-required");
  });

  it("consent for reminders does not allow vitals", async () => {
    const p = await patient(); await recordConsent(u, p.id, "appointment_reminders", "patient");
    expect(await code(recordVitals(u, p.id, { temperature: 37 }))).toBe("consent-required");
  });

  it("clinical care consent allows readings; consent is never deleted, only withdrawn", async () => {
    const p = await consented();
    await recordVitals(u, p.id, { temperature: 37 });
    const [c] = await listConsents(u, p.id);
    expect(consentPurpose(c.resource)).toBe("clinical_care");
    await withdrawConsent(u, c.resource.id);
    expect((await listConsents(u, p.id))[0].resource.status).toBe("inactive");
    expect(await code(recordVitals(u, p.id, { temperature: 37 }))).toBe("consent-withdrawn");
    await recordConsent(u, p.id, "clinical_care", "patient");           // new consent restores it
    await recordVitals(u, p.id, { temperature: 37.2 });
  });

  it("withdrawing twice or an unknown consent is handled", async () => {
    const p = await consented(); const [c] = await listConsents(u, p.id);
    await withdrawConsent(u, c.resource.id);
    await expect(withdrawConsent(u, c.resource.id)).resolves.toBeDefined();
    expect(await code(withdrawConsent(u, crypto.randomUUID()))).toBe("not-found");
  });

  it("consent for a patient that does not exist is refused", async () => {
    expect(await code(recordConsent(u, crypto.randomUUID(), "clinical_care", "patient"))).toBe("not-found");
  });
});

describe("vitals", () => {
  it("blood pressure is two readings that share a group id; a temperature is one", async () => {
    const p = await consented();
    const bp = await recordVitals(u, p.id, { systolic: 148, diastolic: 94 });
    expect(bp).toHaveLength(2);
    expect(observationGroup(bp[0])).toBeDefined();
    expect(observationGroup(bp[0])).toBe(observationGroup(bp[1]));
    expect(bp.map((o) => o.code.coding[0].code).sort()).toEqual(["8462-4", "8480-6"]);
    expect(bp[0].valueQuantity.system).toBe("http://unitsofmeasure.org");
    expect(await recordVitals(u, p.id, { temperature: 37.4 })).toHaveLength(1);
  });

  it.each([
    ["a typo (368 for 36.8)", { temperature: 368 }, "implausible"],
    ["a negative weight", { weight: -5 }, "implausible"],
    ["not a number", { weight: Number.NaN }, "invalid"],
    ["only one blood pressure number", { systolic: 120 }, "invalid"],
    ["top number below bottom", { systolic: 80, diastolic: 120 }, "invalid"],
    ["nothing entered", {}, "invalid"],
  ])("refuses %s", async (_n, input, expected) => {
    const p = await consented();
    expect(await code(recordVitals(u, p.id, input))).toBe(expected);
  });

  it("refuses a reading from the future, and one from before consent", async () => {
    const p = await consented();
    expect(await code(recordVitals(u, p.id, { weight: 60 }, new Date(Date.now() + 3_600_000)))).toBe("invalid");
    expect(await code(recordVitals(u, p.id, { weight: 60 }, new Date(Date.now() - 3_600_000)))).toBe("before-consent");
  });

  it("a wrong reading is marked in error, never deleted; a pair goes together", async () => {
    const p = await consented();
    const bp = await recordVitals(u, p.id, { systolic: 148, diastolic: 94 });
    await markObservationInError(u, bp[0].id);
    const list = await listObservations(u, p.id);
    expect(list).toHaveLength(2);
    expect(list.every((v) => v.resource.status === "entered-in-error")).toBe(true);
    await expect(markObservationInError(u, bp[0].id)).resolves.toBeUndefined();   // again: no harm
    expect(await code(markObservationInError(u, crypto.randomUUID()))).toBe("not-found");
  });
});

describe("photos and voice notes", () => {
  it("need consent, a size, and a sensible size", async () => {
    const p = await patient();
    expect(await code(addMedia(u, p.id, "photo", "image/jpeg", new Uint8Array([1, 2, 3])))).toBe("consent-required");
    await recordConsent(u, p.id, "clinical_care", "patient");
    expect(await code(addMedia(u, p.id, "photo", "image/jpeg", new Uint8Array(0)))).toBe("invalid");
    expect(await code(addMedia(u, p.id, "photo", "image/jpeg", new Uint8Array(300_001)))).toBe("too-large");
    const m = await addMedia(u, p.id, "photo", "image/jpeg", new Uint8Array([1, 2, 3]));
    expect(m.content.size).toBe(3);
    const big = await addMedia(u, p.id, "photo", "image/jpeg", crypto.getRandomValues(new Uint8Array(65_536)).map((x) => x));   // a realistic ~100 KB photo is stored whole
    expect(big.content.size).toBe(65_536);
    const largest = await addMedia(u, p.id, "photo", "image/jpeg", new Uint8Array(300_000));
    expect(largest.content.size).toBe(300_000);
    expect((await listMedia(u, p.id))).toHaveLength(3);
  });
});

describe("audit and safety", () => {
  it("every write and read leaves a log entry, with ids and no health data", async () => {
    const p = await consented();
    await recordVitals(u, p.id, { temperature: 37 });
    await listObservations(u, p.id); await getPatient(u, p.id); await listPatients(u);
    const log = await auditLog(u);
    for (const a of ["create", "read", "search"]) expect(log.some((e) => e.action === a), a).toBe(true);
    expect(log.filter((e) => e.action === "create").map((e) => e.resourceType).sort()).toEqual(["Consent", "Observation", "Patient"]);
    expect(JSON.stringify(log)).not.toContain("Akosua");
    expect(log.every((e) => e.userId === u && e.at)).toBe(true);
  });

  it("if saving fails (locked vault), nothing is written: no record, no queue entry, no log entry", async () => {
    lockVault(u);
    await expect(createPatient(u, { fullName: "Ghost" })).rejects.toBeInstanceOf(VaultLockedError);
    expect(await unlockVault(u, "4821")).toBe(true);
    expect(await listPatients(u)).toEqual([]);
    expect(await pendingCount(u)).toBe(0);
    expect((await auditLog(u)).some((e) => e.action === "create")).toBe(false);
  });

  it("what is stored on the phone is encrypted: the name is not in the raw database", async () => {
    await createPatient(u, { fullName: "Akosua Boateng", village: "Dodowa", phone: "+233000000001" });
    const db = await openDb(u);
    const raw = await new Promise<unknown[]>((res) => { const r = db.transaction("records").objectStore("records").getAll(); r.onsuccess = () => res(r.result); });
    const text = JSON.stringify(raw);
    for (const secret of ["Akosua", "Boateng", "Dodowa", "233000000001"]) expect(text).not.toContain(secret);
  });

  it("new records are queued to send and counted as waiting", async () => {
    await patient();
    expect(await pendingCount(u)).toBe(1);
  });
});
