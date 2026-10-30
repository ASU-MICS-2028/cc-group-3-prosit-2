import { add, get, getAll, put, transact, type AuditEntry, type Op, type ResourceType, type Row } from "./db";
import { open, seal } from "./vault";
import {
  EXT_CONSENT, EXT_GROUP, EXT_WITHDRAWN, LOINC, LOINC_SYSTEM, PURPOSES, PURPOSE_SYSTEM, UCUM_SYSTEM, consentPurpose, consentWithdrawnAt, newId, toBase64,
  type Consent, type Gender, type GivenBy, type Media, type MediaKind, type Observation, type Patient, type Purpose, type Resource, type Vital,
} from "./model";

export type RepoErrorCode = "invalid" | "not-found" | "consent-required" | "consent-withdrawn" | "implausible" | "too-large" | "before-consent";
export class RepoError extends Error {
  constructor(public code: RepoErrorCode, message: string) { super(message); this.name = "RepoError"; }
}

const MAX_BYTES: Record<MediaKind, number> = { photo: 300_000, voice: 2_000_000 };

/* ---------- the one write path ---------- */

type Item = { resource: Resource; patientId: string | null; action: "create" | "update" };

/** Writes records, their sync-queue entries and their audit entries in ONE transaction, so a record
 *  can never change without a log entry, and never without being queued (Lab 6 lesson). Sealing
 *  happens first because a transaction closes if it waits on anything but the database. */
async function commit(userId: string, items: Item[]): Promise<void> {
  const sealed = await Promise.all(items.map((i) => seal(userId, i.resource, i.resource.id)));
  const now = new Date().toISOString();
  await transact(userId, ["records", "outbox", "audit"], "readwrite", async (s) => {
    for (let n = 0; n < items.length; n++) {
      const { resource, patientId, action } = items[n];
      const existing = await get<Row>(s.records, resource.id);
      const version = (existing?.version ?? 0) + 1;
      const row: Row = {
        id: resource.id, type: resource.resourceType as ResourceType, patientId, version,
        serverVersion: existing?.serverVersion ?? null, syncState: "saved", updatedAt: now, sealed: sealed[n],
      };
      await put(s.records, row);
      await add(s.outbox, { recordId: resource.id, version, queuedAt: now } satisfies Op);
      await add(s.audit, { at: now, userId, action, resourceType: resource.resourceType, resourceId: resource.id } satisfies AuditEntry);
    }
  });
}

async function audit(userId: string, action: string, resourceType: string, resourceId: string) {
  await transact(userId, ["audit"], "readwrite", (s) => add(s.audit, { at: new Date().toISOString(), userId, action, resourceType, resourceId } satisfies AuditEntry));
}

async function rowsOf(userId: string, type: ResourceType, patientId?: string): Promise<Row[]> {
  const all = await transact(userId, ["records"], "readonly", (s) => getAll<Row>(s.records));
  return all.filter((r) => r.type === type && (patientId === undefined || r.patientId === patientId));
}

export type View<T extends Resource> = { resource: T; syncState: Row["syncState"]; version: number };
async function views<T extends Resource>(userId: string, rows: Row[]): Promise<View<T>[]> {
  return Promise.all(rows.map(async (r) => ({ resource: await open<T>(userId, r.sealed, r.id), syncState: r.syncState, version: r.version })));
}

/* ---------- patients ---------- */

export type NewPatient = { fullName: string; gender?: Gender; birthDate?: string; village?: string; phone?: string; language?: string; id?: string };

export async function createPatient(userId: string, input: NewPatient): Promise<Patient> {
  const name = input.fullName?.trim() ?? "";
  if (!name || name.length > 200) throw new RepoError("invalid", "Please enter the patient's name.");
  if (input.phone && !/^\+[1-9][0-9]{7,14}$/.test(input.phone)) throw new RepoError("invalid", "The phone number is not valid.");
  if (input.birthDate && (Number.isNaN(Date.parse(input.birthDate)) || new Date(input.birthDate) > new Date())) throw new RepoError("invalid", "The date of birth is not valid.");
  const p: Patient = {
    resourceType: "Patient", id: input.id ?? newId(), name: [{ text: name }],
    ...(input.gender && { gender: input.gender }),
    ...(input.birthDate && { birthDate: input.birthDate }),
    ...(input.village?.trim() && { address: [{ city: input.village.trim() }] as Patient["address"] }),
    ...(input.phone && { telecom: [{ system: "phone", value: input.phone }] as Patient["telecom"] }),
    ...(input.language && { communication: [{ language: { text: input.language } }] as Patient["communication"] }),
  };
  await commit(userId, [{ resource: p, patientId: p.id, action: "create" }]);
  return p;
}

export async function listPatients(userId: string): Promise<View<Patient>[]> {
  const list = await views<Patient>(userId, await rowsOf(userId, "Patient"));
  await audit(userId, "search", "Patient", "*");
  return list.sort((a, b) => a.resource.name[0].text.localeCompare(b.resource.name[0].text));
}

/** An unknown id is still logged, then reported as not found (not a crash). */
export async function getPatient(userId: string, id: string): Promise<View<Patient>> {
  await audit(userId, "read", "Patient", id);
  const row = await transact(userId, ["records"], "readonly", (s) => get<Row>(s.records, id));
  if (!row || row.type !== "Patient") throw new RepoError("not-found", "We couldn't find that patient.");
  return (await views<Patient>(userId, [row]))[0];
}

/* ---------- consent ---------- */

export async function recordConsent(userId: string, patientId: string, purpose: Purpose, givenBy: GivenBy): Promise<Consent> {
  if (!PURPOSES.includes(purpose)) throw new RepoError("invalid", "Unknown purpose.");
  await getPatient(userId, patientId);
  const c: Consent = {
    resourceType: "Consent", id: newId(), status: "active",
    scope: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/consentscope", code: "patient-privacy" }] },
    category: [{ coding: [{ system: PURPOSE_SYSTEM, code: purpose }] }],
    patient: { reference: `Patient/${patientId}` }, dateTime: new Date().toISOString(), performer: [{ display: givenBy }],
  };
  await commit(userId, [{ resource: c, patientId, action: "create" }]);
  return c;
}

export async function listConsents(userId: string, patientId: string): Promise<View<Consent>[]> {
  await audit(userId, "read", "Consent", patientId);
  return views<Consent>(userId, await rowsOf(userId, "Consent", patientId));
}

/** Consent is never deleted: withdrawing marks it inactive with the time (D-013). */
export async function withdrawConsent(userId: string, consentId: string): Promise<Consent> {
  const row = await transact(userId, ["records"], "readonly", (s) => get<Row>(s.records, consentId));
  if (!row || row.type !== "Consent") throw new RepoError("not-found", "We couldn't find that consent.");
  const c = await open<Consent>(userId, row.sealed, row.id);
  if (c.status === "inactive") return c;
  const withdrawn: Consent = { ...c, status: "inactive", extension: [...(c.extension ?? []), { url: EXT_WITHDRAWN, valueDateTime: new Date().toISOString() }] };
  await commit(userId, [{ resource: withdrawn, patientId: row.patientId, action: "update" }]);
  return withdrawn;
}

/** The consent a reading may be recorded under, or the reason there isn't one. */
async function clinicalConsent(userId: string, patientId: string): Promise<Consent> {
  const all = (await views<Consent>(userId, await rowsOf(userId, "Consent", patientId))).map((v) => v.resource).filter((c) => consentPurpose(c) === "clinical_care");
  const active = all.filter((c) => c.status === "active").sort((a, b) => b.dateTime.localeCompare(a.dateTime))[0];
  if (active) return active;
  if (all.some((c) => consentWithdrawnAt(c))) throw new RepoError("consent-withdrawn", "This person withdrew their permission. Ask for permission again before recording.");
  throw new RepoError("consent-required", "Ask for permission to record their health readings first.");
}

/* ---------- vitals ---------- */

export type VitalsInput = { systolic?: number; diastolic?: number; temperature?: number; weight?: number; height?: number };

function checkRange(v: Vital, value: number) {
  const l = LOINC[v];
  if (!Number.isFinite(value)) throw new RepoError("invalid", `${l.label} must be a number.`);
  if (value < l.min || value > l.max) throw new RepoError("implausible", `${l.label} of ${value} ${l.display} looks wrong (expected ${l.min} to ${l.max}). Please check it.`);
}

export async function recordVitals(userId: string, patientId: string, input: VitalsInput, at: Date = new Date()): Promise<Observation[]> {
  await getPatient(userId, patientId);
  const hasBp = input.systolic !== undefined || input.diastolic !== undefined;
  if (hasBp && (input.systolic === undefined || input.diastolic === undefined)) throw new RepoError("invalid", "Blood pressure needs both numbers.");
  const entries = (Object.keys(LOINC) as Vital[]).filter((v) => input[v] !== undefined);
  if (entries.length === 0) throw new RepoError("invalid", "Enter at least one reading.");
  for (const v of entries) checkRange(v, input[v] as number);
  if (hasBp && (input.systolic as number) <= (input.diastolic as number)) throw new RepoError("invalid", "The top blood pressure number should be bigger than the bottom one.");
  if (at.getTime() > Date.now() + 5 * 60_000) throw new RepoError("invalid", "The reading time is in the future.");

  const consent = await clinicalConsent(userId, patientId);
  if (at.toISOString() < consent.dateTime) throw new RepoError("before-consent", "This reading is from before permission was given.");

  const group = hasBp ? newId() : undefined; // systolic + diastolic share a group id
  const obs = entries.map((v): Observation => {
    const l = LOINC[v];
    return {
      resourceType: "Observation", id: newId(), status: "final",
      category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "vital-signs" }] }],
      code: { coding: [{ system: LOINC_SYSTEM, code: l.code, display: l.label }] },
      subject: { reference: `Patient/${patientId}` }, effectiveDateTime: at.toISOString(), performer: [{ reference: `Practitioner/${userId}` }],
      valueQuantity: { value: input[v] as number, unit: l.display, system: UCUM_SYSTEM, code: l.ucum },
      extension: [{ url: EXT_CONSENT, valueReference: { reference: `Consent/${consent.id}` } }, ...(group && (v === "systolic" || v === "diastolic") ? [{ url: EXT_GROUP, valueString: group }] : [])],
    };
  });
  await commit(userId, obs.map((resource) => ({ resource, patientId, action: "create" as const })));
  return obs;
}

export async function listObservations(userId: string, patientId: string): Promise<View<Observation>[]> {
  await audit(userId, "read", "Observation", patientId);
  const list = await views<Observation>(userId, await rowsOf(userId, "Observation", patientId));
  return list.sort((a, b) => b.resource.effectiveDateTime.localeCompare(a.resource.effectiveDateTime));
}

/** Clinical records are corrected, never deleted (D-013). A blood pressure pair is corrected together. */
export async function markObservationInError(userId: string, observationId: string): Promise<void> {
  const row = await transact(userId, ["records"], "readonly", (s) => get<Row>(s.records, observationId));
  if (!row || row.type !== "Observation") throw new RepoError("not-found", "We couldn't find that reading.");
  const target = await open<Observation>(userId, row.sealed, row.id);
  const group = target.extension.find((e) => e.url === EXT_GROUP);
  const siblings = (await views<Observation>(userId, await rowsOf(userId, "Observation", row.patientId ?? undefined)))
    .map((v) => v.resource)
    .filter((o) => o.id === target.id || (group && "valueString" in group && o.extension.some((e) => e.url === EXT_GROUP && "valueString" in e && e.valueString === group.valueString)));
  await commit(userId, siblings.filter((o) => o.status !== "entered-in-error").map((o) => ({ resource: { ...o, status: "entered-in-error" as const }, patientId: row.patientId, action: "update" as const })));
}

/* ---------- photos and voice notes ---------- */

export async function addMedia(userId: string, patientId: string, kind: MediaKind, contentType: string, bytes: Uint8Array): Promise<Media> {
  if (bytes.byteLength === 0) throw new RepoError("invalid", "The recording is empty.");
  if (bytes.byteLength > MAX_BYTES[kind]) throw new RepoError("too-large", kind === "photo" ? "That photo is too big. Take it again." : "That recording is too long. Record a shorter one.");
  await getPatient(userId, patientId);
  await clinicalConsent(userId, patientId);
  const m: Media = {
    resourceType: "Media", id: newId(), status: "completed",
    type: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/media-type", code: kind === "photo" ? "image" : "audio" }] },
    subject: { reference: `Patient/${patientId}` }, createdDateTime: new Date().toISOString(),
    content: { contentType, size: bytes.byteLength, data: toBase64(bytes) },
  };
  await commit(userId, [{ resource: m, patientId, action: "create" }]);
  return m;
}

export async function listMedia(userId: string, patientId: string): Promise<View<Media>[]> {
  await audit(userId, "read", "Media", patientId);
  return views<Media>(userId, await rowsOf(userId, "Media", patientId));
}

/** Like readings, photos and recordings are corrected, never deleted. */
export async function markMediaInError(userId: string, mediaId: string): Promise<void> {
  const row = await transact(userId, ["records"], "readonly", (s) => get<Row>(s.records, mediaId));
  if (!row || row.type !== "Media") throw new RepoError("not-found", "We couldn't find that.");
  const m = await open<Media>(userId, row.sealed, row.id);
  if (m.status === "entered-in-error") return;
  await commit(userId, [{ resource: { ...m, status: "entered-in-error" }, patientId: row.patientId, action: "update" }]);
}

/* ---------- audit and sync bookkeeping ---------- */

export async function auditLog(userId: string): Promise<AuditEntry[]> {
  return transact(userId, ["audit"], "readonly", (s) => getAll<AuditEntry>(s.audit));
}

export async function pendingCount(userId: string): Promise<number> {
  const rows = await transact(userId, ["records"], "readonly", (s) => getAll<Row>(s.records));
  return rows.filter((r) => r.syncState !== "sent").length;
}

export type Activity = { id: string; type: ResourceType; label: string; syncState: Row["syncState"]; updatedAt: string };

/** What is waiting, sent or stuck, in words a person can read. Logged as a search (it shows names). */
export async function listActivity(userId: string, limit = 50): Promise<Activity[]> {
  const rows = await transact(userId, ["records"], "readonly", (s) => getAll<Row>(s.records));
  await audit(userId, "search", "Queue", "*");
  const out: Activity[] = [];
  for (const r of rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit)) {
    const res = await open<Resource>(userId, r.sealed, r.id);
    const label =
      res.resourceType === "Patient" ? `Patient: ${res.name[0].text}`
      : res.resourceType === "Consent" ? `Permission: ${consentPurpose(res).replace(/_/g, " ")}${res.status === "inactive" ? " (withdrawn)" : ""}`
      : res.resourceType === "Observation" ? `Reading: ${res.code.coding[0].display} ${res.valueQuantity.value} ${res.valueQuantity.unit}`
      : `${res.type.coding[0].code === "image" ? "Photo" : "Voice note"}`;
    out.push({ id: r.id, type: r.type, label, syncState: r.syncState, updatedAt: r.updatedAt });
  }
  return out;
}
