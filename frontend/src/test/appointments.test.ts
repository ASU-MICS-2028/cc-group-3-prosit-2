import { deleteDb } from "../data/db";
import { MockServer } from "../data/mockServer";
import { RepoError, auditLog, bookAppointment, cancelAppointment, createPatient, getPatient, listAppointments, listPatients, listConsents, recordConsent, listObservations, recordVitals } from "../data/repo";
import { cancelRejected, rejectedOf, syncNow } from "../data/sync";
import { createVault, wipeVault } from "../data/vault";
import { appointmentCallCode, appointmentPatientId, type Appointment } from "../data/model";
import { AVAILABILITY, dayStartUtc, slotsForDay } from "../config/people";

const DR = "00000000-0000-4000-8000-000000000003";
const NOW = new Date("2026-11-02T06:00:00Z");     // a Monday, before the clinic opens
let u: string, v: string, server: MockServer;
const users: string[] = [];
const newUser = async () => { const id = crypto.randomUUID(); await createVault(id, "x"); users.push(id); return id; };
beforeEach(async () => { localStorage.clear(); server = new MockServer(); u = await newUser(); v = await newUser(); });
afterEach(async () => { for (const id of users.splice(0)) await deleteDb(id); });

const code = async (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof RepoError ? e.code : String(e)));
const at = (hhmm: string, day = "2026-11-03") => new Date(`${day}T${hhmm}:00Z`);
async function consentedPatient(user = u, name = "Akosua Boateng") {
  const p = await createPatient(user, { fullName: name });
  await recordConsent(user, p.id, "clinical_care", "patient");
  return p;
}

describe("booking rules (the database's rules, on the phone)", () => {
  it("books a 30-minute visit, saved in UTC with both people named", async () => {
    const p = await consentedPatient();
    const a = await bookAppointment(u, { patientId: p.id, specialistId: DR, specialistName: "Dr. Kofi Mensah", start: at("09:30") }, NOW);
    expect(a).toMatchObject({ resourceType: "Appointment", status: "booked", start: "2026-11-03T09:30:00.000Z", end: "2026-11-03T10:00:00.000Z" });
    expect(appointmentPatientId(a)).toBe(p.id);
    expect(a.participant[1].actor.display).toBe("Dr. Kofi Mensah");
    expect((await listAppointments(u))).toHaveLength(1);
    expect(appointmentCallCode(a.id)).toBe(`appt-${a.id}`);
  });

  it.each([
    ["a time that has passed", new Date("2026-11-02T05:00:00Z"), "past"],
    ["more than 90 days ahead", new Date("2027-03-01T09:00:00Z"), "too-far"],
    ["a date that is not valid", new Date("nope"), "invalid"],
  ])("refuses %s", async (_n, start, expected) => {
    const p = await consentedPatient();
    expect(await code(bookAppointment(u, { patientId: p.id, specialistId: DR, start }, NOW))).toBe(expected);
  });

  it("refuses a nonsense visit length", async () => {
    const p = await consentedPatient();
    for (const minutes of [0, 5, 500, Number.NaN]) expect(await code(bookAppointment(u, { patientId: p.id, specialistId: DR, start: at("09:00"), minutes }, NOW))).toBe("invalid");
  });

  it("needs permission for care: none, or withdrawn, is refused", async () => {
    const p = await createPatient(u, { fullName: "Ama" });
    expect(await code(bookAppointment(u, { patientId: p.id, specialistId: DR, start: at("09:00") }, NOW))).toBe("consent-required");
  });

  it("an unknown patient is not found", async () => {
    expect(await code(bookAppointment(u, { patientId: crypto.randomUUID(), specialistId: DR, start: at("09:00") }, NOW))).toBe("not-found");
  });

  it("the same specialist can't be booked twice at overlapping times, but back-to-back is fine", async () => {
    const p = await consentedPatient(); const q = await consentedPatient(u, "Yaw Owusu");
    await bookAppointment(u, { patientId: p.id, specialistId: DR, start: at("09:00") }, NOW);
    expect(await code(bookAppointment(u, { patientId: q.id, specialistId: DR, start: at("09:15") }, NOW))).toBe("slot-taken");
    expect(await code(bookAppointment(u, { patientId: q.id, specialistId: DR, start: at("09:30") }, NOW))).toBe("ok");
  });

  it("one patient can't have two visits at the same time", async () => {
    const p = await consentedPatient();
    await bookAppointment(u, { patientId: p.id, specialistId: DR, start: at("09:00") }, NOW);
    expect(await code(bookAppointment(u, { patientId: p.id, specialistId: "00000000-0000-4000-8000-000000000099", start: at("09:00") }, NOW))).toBe("slot-taken");
  });

  it("cancelling frees the time, keeps the record, and is harmless twice", async () => {
    const p = await consentedPatient();
    const a = await bookAppointment(u, { patientId: p.id, specialistId: DR, start: at("09:00") }, NOW);
    await cancelAppointment(u, a.id); await cancelAppointment(u, a.id);
    expect((await listAppointments(u))[0].resource.status).toBe("cancelled");
    expect(await code(bookAppointment(u, { patientId: p.id, specialistId: DR, start: at("09:00") }, NOW))).toBe("ok");
    expect(await code(cancelAppointment(u, crypto.randomUUID()))).toBe("not-found");
  });

  it("every booking and cancel is logged", async () => {
    const p = await consentedPatient();
    const a = await bookAppointment(u, { patientId: p.id, specialistId: DR, start: at("09:00") }, NOW);
    await cancelAppointment(u, a.id);
    const log = (await auditLog(u)).filter((e) => e.resourceType === "Appointment");
    expect(log.map((e) => e.action)).toEqual(expect.arrayContaining(["create", "update"]));
  });
});

describe("clinic hours", () => {
  it("slots are every 30 minutes from 08:00 to 15:30 UTC, and Sunday is closed", () => {
    const mon = slotsForDay(dayStartUtc(new Date("2026-11-03T12:00:00Z"), 0));
    expect(mon).toHaveLength(16);
    expect(mon[0]).toBe("2026-11-03T08:00:00.000Z"); expect(mon[15]).toBe("2026-11-03T15:30:00.000Z");
    expect(slotsForDay(dayStartUtc(new Date("2026-11-01T12:00:00Z"), 0))).toEqual([]);
    expect(AVAILABILITY.slotMinutes).toBe(30);
  });
});

describe("the server refuses a double booking made on two phones", () => {
  it("the second phone's booking is refused for good, kept on the phone, and can be cancelled to try again", async () => {
    const p1 = await consentedPatient(u, "Akosua Boateng"); const p2 = await consentedPatient(v, "Yaw Owusu");
    const a1 = await bookAppointment(u, { patientId: p1.id, specialistId: DR, start: at("10:00") }, NOW);
    const a2 = await bookAppointment(v, { patientId: p2.id, specialistId: DR, start: at("10:00") }, NOW);   // neither phone knows about the other
    await syncNow(u, server.as({ userId: u, role: "chv" }));
    const r = await syncNow(v, server.as({ userId: v, role: "chv" }));
    expect(r.conflicts).toBe(1);
    expect(server.store.get(a1.id)?.resource).toBeDefined();
    expect(server.store.has(a2.id)).toBe(false);
    expect((await rejectedOf(v, a2.id))?.reason).toBe("slot-taken");
    expect((await rejectedOf(v, a1.id))).toBeNull();
    await cancelRejected(v, a2.id);
    expect((await listAppointments(v))[0].resource.status).toBe("cancelled");
    await syncNow(v, server.as({ userId: v, role: "chv" }));
    expect((server.store.get(a2.id)!.resource as Appointment).status).toBe("cancelled");
    expect(await code(bookAppointment(v, { patientId: p2.id, specialistId: DR, start: at("10:30") }, NOW))).toBe("ok");
  });

  it("'cancelRejected' only works on a refused booking", async () => {
    const p = await consentedPatient();
    await expect(cancelRejected(u, p.id)).rejects.toThrow(/nothing to resolve/);
  });

  it("a cancelled visit frees the slot on the server too", async () => {
    const p1 = await consentedPatient(u); const p2 = await consentedPatient(v, "Yaw");
    const a1 = await bookAppointment(u, { patientId: p1.id, specialistId: DR, start: at("11:00") }, NOW);
    await syncNow(u, server.as({ userId: u, role: "chv" }));
    await cancelAppointment(u, a1.id); await syncNow(u, server.as({ userId: u, role: "chv" }));
    await bookAppointment(v, { patientId: p2.id, specialistId: DR, start: at("11:00") }, NOW);
    expect((await syncNow(v, server.as({ userId: v, role: "chv" }))).conflicts).toBe(0);
  });

  it("the server tells which times are taken, without saying for whom", async () => {
    const p = await consentedPatient();
    await bookAppointment(u, { patientId: p.id, specialistId: DR, start: at("10:00") }, NOW);
    await syncNow(u, server.as({ userId: u, role: "chv" }));
    const taken = await server.as({ userId: v, role: "chv" }).taken(DR, "2026-11-03T00:00:00Z", "2026-11-04T00:00:00Z");
    expect(taken).toEqual([{ start: "2026-11-03T10:00:00.000Z", end: "2026-11-03T10:30:00.000Z" }]);
    expect(JSON.stringify(taken)).not.toContain(p.id);
  });
});

describe("downloading: who sees what", () => {
  const as = (id: string, role: string) => server.as({ userId: id, role });

  it("a doctor sees the visits booked with them and those patients' records, and nobody else's", async () => {
    const dr = await newUser();
    const mine = await consentedPatient(u, "Akosua Boateng"); const other = await consentedPatient(u, "Yaw Owusu");
    await recordVitals(u, mine.id, { temperature: 37 }); await recordVitals(u, other.id, { temperature: 38 });
    await bookAppointment(u, { patientId: mine.id, specialistId: dr, start: at("10:00") }, NOW);
    await syncNow(u, as(u, "chv"));
    const r = await syncNow(dr, as(dr, "clinician"));
    expect(r.pulled).toBeGreaterThan(0);
    expect((await listPatients(dr)).map((x) => x.resource.name[0].text)).toEqual(["Akosua Boateng"]);
    expect((await listAppointments(dr))).toHaveLength(1);
    expect((await listObservations(dr, mine.id))).toHaveLength(1);
    expect((await listConsents(dr, mine.id))).toHaveLength(1);
    await expect(getPatient(dr, other.id)).rejects.toThrow();
  });

  it("a doctor with no visits downloads nothing", async () => {
    await consentedPatient(u);
    await syncNow(u, as(u, "chv"));
    const dr = await newUser();
    expect((await syncNow(dr, as(dr, "clinician"))).pulled).toBe(0);
    expect(await listPatients(dr)).toEqual([]);
  });

  it("a role with no rights (pharmacist, GHS) downloads nobody's patients", async () => {
    await consentedPatient(u); await syncNow(u, as(u, "chv"));
    for (const role of ["pharmacist", "ghs", "patient", "healer"]) { const x = await newUser(); expect((await syncNow(x, as(x, role))).pulled, role).toBe(0); }
  });

  it("a second download changes nothing, and nothing downloaded is sent back", async () => {
    const dr = await newUser();
    const p = await consentedPatient(u);
    await bookAppointment(u, { patientId: p.id, specialistId: dr, start: at("10:00") }, NOW);
    await syncNow(u, as(u, "chv"));
    const first = await syncNow(dr, as(dr, "clinician"));
    const pushesAfterFirst = server.pushes;
    const second = await syncNow(dr, as(dr, "clinician"));
    expect(first.pulled).toBeGreaterThan(0); expect(second.pulled).toBe(0); expect(second.sent).toBe(0);
    expect(server.pushes).toBe(pushesAfterFirst);
  });

  it("a change made later by the other side arrives in the next download", async () => {
    const dr = await newUser();
    const p = await consentedPatient(u);
    const a = await bookAppointment(u, { patientId: p.id, specialistId: dr, start: at("10:00") }, NOW);
    await syncNow(u, as(u, "chv")); await syncNow(dr, as(dr, "clinician"));
    await cancelAppointment(u, a.id); await syncNow(u, as(u, "chv"));
    await syncNow(dr, as(dr, "clinician"));
    expect((await listAppointments(dr))[0].resource.status).toBe("cancelled");
  });

  it("the person's own records come back after the phone's data was wiped", async () => {
    await consentedPatient(u, "Akosua Boateng"); await syncNow(u, as(u, "chv"));
    await deleteDb(u); wipeVault(u); await createVault(u, "new passphrase");      // a wipe, then a fresh start
    expect(await listPatients(u)).toEqual([]);
    const r = await syncNow(u, as(u, "chv"));
    expect(r.pulled).toBe(2);                                                       // the patient and the consent
    expect((await listPatients(u)).map((x) => x.resource.name[0].text)).toEqual(["Akosua Boateng"]);
  });

  it("downloading never overwrites something the phone has not sent yet", async () => {
    const p = await consentedPatient(u); await syncNow(u, as(u, "chv"));
    await createPatient(u, { id: p.id, fullName: "Akosua Boateng-Mensah" });         // an unsent edit
    server.editElsewhere(p.id, (r) => ({ ...(r as never as { name: unknown }), name: [{ text: "Akosua B. Clinic" }] } as never));
    const r = await syncNow(u, as(u, "chv"));
    expect(r.conflicts).toBe(1);                                                    // settled by a person, not silently replaced
    expect((await listPatients(u))[0].resource.name[0].text).toBe("Akosua Boateng-Mensah");
  });

  it("being offline during a download is not an error", async () => {
    await consentedPatient(u); server.reachable = false;
    const r = await syncNow(u, as(u, "chv"));
    expect(r.offline).toBe(true); expect(r.pulled).toBe(0);
  });
});
