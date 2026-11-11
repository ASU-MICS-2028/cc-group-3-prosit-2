import { execSync } from "node:child_process";
import { deleteDb, get, transact, type Row } from "../data/db";
import { httpAuthApi } from "../auth/liveApi";
import type { Session } from "../auth/types";
import { bookAppointment, createPatient, listPatients, pendingCount, recordConsent, recordVitals } from "../data/repo";
import { SessionExpiredError, httpSyncApi, rejectedOf, syncNow, type LiveAuth } from "../data/sync";
import { createVault } from "../data/vault";

/** The real backend, the real adapter. Skipped unless a backend is running; setup is in learnings/frontend.md. */
const URL_ = process.env.E2E_API_URL, PASSWORD = process.env.E2E_PASSWORD, PG = process.env.E2E_PG_CONTAINER;
const DOCTOR = "00000000-0000-4000-8000-000000000003";
const auth = httpAuthApi(URL_);

/** What Session.tsx does, without React. */
function holder(s: Session): LiveAuth & { s: Session } {
  const h = {
    s, token: () => h.s.token, expire: () => undefined,
    async refresh() { const next = await auth.refresh(h.s.refreshToken ?? ""); if (!next) throw new SessionExpiredError(); h.s = next; },
  };
  return h;
}
const phone = async () => { const id = crypto.randomUUID(); await createVault(id, "4821"); return id; };
const patient = async (u: string, fullName: string) => { const p = await createPatient(u, { fullName }); await recordConsent(u, p.id, "clinical_care", "patient"); return p; };
const syncState = async (u: string, id: string) => (await transact(u, ["records"], "readonly", (s) => get<Row>(s.records, id)))!.syncState;
const randomSlot = () => new Date(Date.now() + (2 + Math.floor(Math.random() * 80)) * 86_400_000 + Math.floor(Math.random() * 48) * 1_800_000);

describe.skipIf(!URL_ || !PASSWORD)("the adapter against a running backend", () => {
  const phones: string[] = [];
  const newPhone = async () => { const id = await phone(); phones.push(id); return id; };
  afterAll(async () => { for (const id of phones) await deleteDb(id); });

  it("a wrong password is refused in words", async () => {
    await expect(auth.signIn("chv", "definitely-not-the-password")).rejects.toThrow(/Wrong username or password/);
  });

  it("records queued offline upload when the signal returns, and a doctor downloads the booked patient", async () => {
    const session = await auth.signIn("chv", PASSWORD!);
    expect(session).toMatchObject({ mode: "live", user: { role: "chv" } });
    const u = await newPhone();
    const p = await patient(u, "Esi Offline");
    await recordVitals(u, p.id, { systolic: 120, diastolic: 80 });
    const live = holder(session);
    await bookAppointment(u, { patientId: p.id, specialistId: DOCTOR, specialistName: "Dr. Kofi Mensah", start: randomSlot() });

    const before = await pendingCount(u);
    const noSignal = await syncNow(u, httpSyncApi(live, "http://127.0.0.1:1"));
    expect(noSignal).toMatchObject({ offline: true, sent: 0, pending: before });

    const back = await syncNow(u, httpSyncApi(live, URL_));
    expect(back).toMatchObject({ offline: false, sent: before, conflicts: 0, pending: 0 });
    expect(await syncState(u, p.id)).toBe("sent");

    const doctor = await newPhone();
    const seen = await syncNow(doctor, httpSyncApi(holder(await auth.signIn("clinician", PASSWORD!)), URL_));
    expect(seen.pulled).toBeGreaterThanOrEqual(before);
    expect((await listPatients(doctor)).map((x) => x.resource.name[0].text)).toContain("Esi Offline");
  });

  it("a double booking comes back as 409 slot-taken and needs a person", async () => {
    const live = holder(await auth.signIn("chv", PASSWORD!));
    const a = await newPhone(), b = await newPhone();
    const pa = await patient(a, "Esi Clash"), pb = await patient(b, "Yaa Clash");
    const start = randomSlot();
    const bookA = await bookAppointment(a, { patientId: pa.id, specialistId: DOCTOR, specialistName: "Dr. Kofi Mensah", start });
    const bookB = await bookAppointment(b, { patientId: pb.id, specialistId: DOCTOR, specialistName: "Dr. Kofi Mensah", start });
    expect(await syncNow(a, httpSyncApi(live, URL_))).toMatchObject({ conflicts: 0, pending: 0 });
    expect((await syncNow(b, httpSyncApi(live, URL_))).conflicts).toBe(1);
    expect(await syncState(a, bookA.id)).toBe("sent");
    expect(await syncState(b, bookB.id)).toBe("attention");
    expect((await rejectedOf(b, bookB.id))?.reason).toBe("slot-taken");
  });

  it("an expired token is refreshed; a dead refresh token keeps the queue", async () => {
    const live = holder(await auth.signIn("chv", PASSWORD!));
    const u = await newPhone();
    const first = await patient(u, "Esi Token");
    live.s = { ...live.s, token: "expired" };
    expect((await syncNow(u, httpSyncApi(live, URL_))).sent).toBe(2);
    expect(live.s.token).not.toBe("expired");
    expect(await syncState(u, first.id)).toBe("sent");

    const good = live.s;
    const second = await patient(u, "Yaa Token");
    live.s = { ...good, token: "expired", refreshToken: "finished" };
    await expect(syncNow(u, httpSyncApi(live, URL_))).rejects.toBeInstanceOf(SessionExpiredError);
    expect(await syncState(u, second.id)).toBe("saved");
    expect(await pendingCount(u)).toBe(2);

    live.s = good;
    expect((await syncNow(u, httpSyncApi(live, URL_))).sent).toBe(2);
  });

  it.skipIf(!PG)("a database outage answers 503 with Retry-After, and the queue uploads afterwards", { timeout: 90_000 }, async () => {
    const live = holder(await auth.signIn("chv", PASSWORD!));
    const u = await newPhone();
    const p = await patient(u, "Esi Outage");
    execSync(`docker stop ${PG}`);
    try {
      const r = await syncNow(u, httpSyncApi(live, URL_));
      expect(r).toMatchObject({ offline: true, sent: 0, pending: 2, retryAfterMs: 15_000 });
      expect(await syncState(u, p.id)).toBe("saved");
    } finally { execSync(`docker start ${PG}`); }
    for (let i = 0; i < 40 && (await pendingCount(u)) > 0; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      await syncNow(u, httpSyncApi(live, URL_)).catch(() => undefined);
    }
    expect(await syncState(u, p.id)).toBe("sent");
  });
});
