import express, { type Express, type Request, type Response } from 'express'
import type { Ctx } from '../app.js'
import { logAccess, type AccessEntry } from '../audit.js'
import { requireActor, type Actor } from '../auth.js'
import { lockSpecialist, type Queryable } from '../db.js'
import { logger } from '../logging.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TYPES = new Set(['Patient', 'Consent', 'Observation', 'Media', 'Appointment'])
const CLINICIANS = new Set(['nurse', 'doctor', 'specialist'])
/** A patient may only send their own bookings. Pharmacists, healers, GHS officials and admins don't send patient records. */
const WRITERS = new Set(['chv', ...CLINICIANS, 'patient'])
const PAGE = 100
/** A voice note is up to 2 MB on the phone, so about 2.7 MB as text. */
export const SYNC_BODY_LIMIT = '4mb'
const CONSENT_EXT = 'https://healthconnect.example/observation-consent'
const GROUP_EXT = 'https://healthconnect.example/observation-group'
const WITHDRAWN_EXT = 'https://healthconnect.example/consent-withdrawn-at'

// The two numbers of a Postgres advisory lock: "this record" and "the whole download order".
const LOCK_RECORD = 7001
const LOCK_ORDER = 7002

type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any -- checked field by field below
type Answer = { http: number; body: Json; outcome: AccessEntry['outcome']; event?: Json }

class Stop extends Error {
  constructor(readonly answer: Answer) { super('stop') }
}
const rejected = (http: number, reason: string, message: string, outcome: AccessEntry['outcome'] = 'error') =>
  new Stop({ http, body: { status: 'rejected', reason, message }, outcome })
const bad = (message: string) => rejected(400, 'invalid', message)

const text = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !value) throw bad(`${field} is missing`)
  return value
}
const uuid = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !UUID.test(value)) throw bad(`${field} must be a UUID`)
  return value
}
const refId = (ref: unknown, prefix: string, field: string) => uuid(typeof ref === 'string' ? ref.replace(`${prefix}/`, '') : ref, field)

/** Whose record this is, read from the record itself, never from what the sender says around it. */
function patientOf(r: Json): string {
  switch (r.resourceType) {
    case 'Patient': return uuid(r.id, 'id')
    case 'Consent': return refId(r.patient?.reference, 'Patient', 'patient')
    case 'Appointment': return refId(r.participant?.[0]?.actor?.reference, 'Patient', 'participant[0]')
    default: return refId(r.subject?.reference, 'Patient', 'subject')
  }
}
const specialistOf = (r: Json) => r.resourceType === 'Appointment' ? refId(r.participant?.[1]?.actor?.reference, 'Practitioner', 'participant[1]') : null
const extension = (r: Json, url: string): Json | undefined => Array.isArray(r.extension) ? (r.extension as Json[]).find((e) => e?.url === url) : undefined

/** Writes the phone's record into its proper table, so the database's own rules decide (consent, ranges, double booking). */
async function project(q: Queryable, r: Json, actor: Actor) {
  switch (r.resourceType) {
    case 'Patient':
      // ponytail: the app's "village" goes in `region` until a village column is justified (docs/fhir-mapping.md).
      await q.query(
        `INSERT INTO patients (id, full_name, phone, date_of_birth, gender, region, preferred_language) VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, phone = EXCLUDED.phone, date_of_birth = EXCLUDED.date_of_birth,
           gender = EXCLUDED.gender, region = EXCLUDED.region, preferred_language = EXCLUDED.preferred_language`,
        [r.id, text(r.name?.[0]?.text, 'name'), r.telecom?.[0]?.value ?? null, r.birthDate ?? null, r.gender ?? null, r.address?.[0]?.city ?? null, r.communication?.[0]?.language?.text ?? null],
      )
      return
    case 'Consent':
      // A consent never changes except to record its withdrawal, once. The database refuses anything else.
      await q.query(
        `INSERT INTO consents (id, patient_id, purpose, given_by, recorded_by, given_at, withdrawn_at) VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET withdrawn_at = EXCLUDED.withdrawn_at
         WHERE consents.withdrawn_at IS NULL AND EXCLUDED.withdrawn_at IS NOT NULL`,
        [r.id, patientOf(r), text(r.category?.[0]?.coding?.[0]?.code, 'category'), text(r.performer?.[0]?.display, 'performer'), actor.id, text(r.dateTime, 'dateTime'), extension(r, WITHDRAWN_EXT)?.valueDateTime ?? null],
      )
      return
    case 'Observation': {
      const consent = refId(extension(r, CONSENT_EXT)?.valueReference?.reference, 'Consent', 'consent')
      await q.query(
        `INSERT INTO observations (id, patient_id, consent_id, loinc_code, value, group_id, status, recorded_by, effective_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status`,
        [r.id, patientOf(r), consent, text(r.code?.coding?.[0]?.code, 'code'), r.valueQuantity?.value ?? null, extension(r, GROUP_EXT)?.valueString ?? null, r.status ?? 'final', actor.id, text(r.effectiveDateTime, 'effectiveDateTime')],
      )
      return
    }
    case 'Appointment': {
      // Postgres also accepts words like 'infinity', which aren't a time anyone can attend.
      for (const f of ['start', 'end']) if (Number.isNaN(Date.parse(text(r[f], f)))) throw bad(`${f} must be a date-time`)
      const specialist = specialistOf(r)
      const role = (await q.query('SELECT role FROM practitioners WHERE id = $1 AND active', [specialist])).rows[0]?.role
      if (role !== 'specialist' && role !== 'doctor') throw rejected(422, 'unknown-specialist', 'That person is not an active doctor or specialist')
      await lockSpecialist(q, specialist!) // the role check above already refused a missing one
      await q.query(
        `INSERT INTO appointments (id, patient_id, specialist_id, starts_at, ends_at, status) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at`,
        [r.id, patientOf(r), specialist, text(r.start, 'start'), text(r.end, 'end'), r.status ?? 'booked'],
      )
      return
    }
    // Media stays only in sync_records for now. ponytail: photos in Postgres; move to S3 with SVC-2 (Eugene).
  }
}

/** The same rule the app's mock server follows (D-032): the person's own records, plus those of their patients. */
const VISIBLE = `(
  s.owner = $1
  OR ($2 = 'patient' AND s.patient_id = $3)
  OR ($2 = 'chv' AND s.patient_id IN (SELECT id FROM sync_records WHERE resource_type = 'Patient' AND owner = $1))
  OR ($2 IN ('nurse', 'doctor', 'specialist') AND s.patient_id IN (SELECT patient_id FROM sync_records WHERE resource_type = 'Appointment' AND practitioner_id = $1))
)`

/** May this person add to, or see, this patient's records? */
async function canReach(q: Queryable, actor: Actor, patientId: string): Promise<boolean> {
  if (actor.role === 'patient') return actor.patientId === patientId
  const { rows } = await q.query(
    `SELECT 1 FROM sync_records s WHERE s.patient_id = $4 AND ${VISIBLE} LIMIT 1`,
    [actor.id, actor.role, actor.patientId ?? null, patientId],
  )
  return rows.length > 0
}

/** Turns the database's refusals into answers the phone can act on, never a bare 500. */
function fromDatabase(error: unknown): Answer | null {
  const { code, hint, message } = error as { code?: string; hint?: string; message?: string }
  if (code === '23P01') return { http: 409, body: { status: 'rejected', reason: 'slot-taken', error: 'double_booked', message: 'Someone else booked that time first' }, outcome: 'error' }
  if (code === '23503') return { http: 424, body: { status: 'retry', reason: 'depends-on-a-record-not-here-yet' }, outcome: 'error' }
  if (hint === 'consent_withdrawn') return { http: 403, body: { status: 'rejected', reason: 'consent-withdrawn', message }, outcome: 'denied' }
  // Bad values (22xxx), a broken rule (23xxx), or a trigger's refusal: the message is written for people and names no one.
  if (code?.startsWith('22') || code?.startsWith('23') || code === 'P0001') return { http: 422, body: { status: 'rejected', reason: 'refused-by-rules', message }, outcome: 'error' }
  return null
}

export function syncRoutes(app: Express, ctx: Ctx) {
  /**
   * The phone sends one changed record (D-011). Same id and same data: already stored. Same id, different
   * data, on an old version: conflict, and a person chooses. The answer's body is always the app's
   * `PushResult`, so a retry after a lost reply is safe.
   */
  app.post('/sync/push', requireActor(ctx.jwtKey, ctx.db), async (req: Request, res: Response) => {
    const actor = res.locals.actor as Actor
    const body = (req.body ?? {}) as Json
    const resource = body.resource as Json | undefined
    const logType = (TYPES.has(String(body.resourceType)) ? body.resourceType : 'Patient') as AccessEntry['resourceType']
    const entry = (outcome: AccessEntry['outcome'], patientId: string | null, action: AccessEntry['action'] = 'update'): AccessEntry => ({
      accessedBy: actor.id, patientId, resourceType: logType, action, outcome, sourceIp: req.ip ?? null,
    })

    // Worked out first, so even a refused attempt is logged against the patient it was aimed at.
    let patientId: string | null = null
    try { if (resource && typeof resource === 'object') patientId = patientOf(resource) } catch { /* bad input: answered below */ }
    let answer: Answer
    try {
      if (!WRITERS.has(actor.role)) throw rejected(403, 'forbidden', `A ${actor.role} account cannot send patient records`, 'denied')
      const id = uuid(body.id, 'id')
      if (!TYPES.has(String(body.resourceType))) throw bad('resourceType is not one we keep')
      if (!resource || typeof resource !== 'object') throw bad('resource is missing')
      if (resource.id !== id || resource.resourceType !== body.resourceType) throw bad('resource does not match id and resourceType')
      if (body.baseVersion !== null && body.baseVersion !== undefined && !Number.isInteger(body.baseVersion)) throw bad('baseVersion must be a whole number')
      patientId = patientOf(resource)
      if (body.patientId != null && body.patientId !== patientId) throw bad('patientId does not match the record')
      const patient = patientId
      if (actor.role === 'patient' && (resource.resourceType !== 'Appointment' || actor.patientId !== patient)) {
        throw rejected(403, 'forbidden', 'A patient can only book their own visits', 'denied')
      }

      answer = await ctx.db.withTransaction(actor.id, async (q) => {
        // Two copies of one record arriving together wait for each other, so only one can win.
        await q.query('SELECT pg_advisory_xact_lock($1, hashtext($2))', [LOCK_RECORD, id])
        const have = (await q.query('SELECT version, resource, owner, patient_id, resource = $2::jsonb AS same FROM sync_records WHERE id = $1', [id, JSON.stringify(resource)])).rows[0] as Json | undefined

        const isNewPatient = !have && resource.resourceType === 'Patient'
        if (have?.patient_id && have.patient_id !== patient) throw bad('This id belongs to a different patient')
        if (!isNewPatient && !(await canReach(q, actor, patient))) {
          const known = (await q.query('SELECT 1 FROM patients WHERE id = $1', [patient])).rows.length > 0
          // Not here yet: the patient's own record may still be on its way. Otherwise they aren't this person's patient.
          if (!known) throw new Stop({ http: 424, body: { status: 'retry', reason: 'patient-not-here-yet' }, outcome: 'not_found' })
          throw rejected(403, 'forbidden', 'This patient is not one of yours', 'denied')
        }
        if (have?.same) {
          await logAccess(q, entry('success', patient))
          return { http: 200, body: { status: 'duplicate', serverVersion: have.version }, outcome: 'success' as const }
        }
        if (have && body.baseVersion !== have.version) {
          await logAccess(q, entry('error', patient))
          return { http: 409, body: { status: 'conflict', serverVersion: have.version, resource: have.resource }, outcome: 'error' as const }
        }
        const specialist = specialistOf(resource)
        const wasBooked = have?.resource?.status === 'booked'
        const firstWithThisPatient = specialist !== null &&
          (await q.query(`SELECT 1 FROM sync_records WHERE resource_type = 'Appointment' AND practitioner_id = $1 AND patient_id = $2 LIMIT 1`, [specialist, patient])).rows.length === 0

        await project(q, resource, actor)

        // Held until COMMIT, so a record numbered 5 can never appear after a phone has already read past it to 6.
        // ponytail: one writer at a time for this last step only; per-region order if pushes ever queue up here.
        await q.query('SELECT pg_advisory_xact_lock($1, 0)', [LOCK_ORDER])
        const version: number = have ? have.version + 1 : 1
        await q.query(
          `INSERT INTO sync_records (id, resource_type, patient_id, practitioner_id, owner, version, seq, resource)
           VALUES ($1, $2, $3, $4, $5, $6, nextval('sync_records_seq'), $7::jsonb)
           ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, seq = EXCLUDED.seq, resource = EXCLUDED.resource, practitioner_id = EXCLUDED.practitioner_id`,
          [id, resource.resourceType, patient, specialist, actor.id, version, JSON.stringify(resource)],
        )
        // A doctor's first visit with a patient opens that patient's older records to them. Those were numbered
        // before the doctor's bookmark, so number them again or the doctor's phone would never download them.
        if (firstWithThisPatient) {
          await q.query(`UPDATE sync_records SET seq = nextval('sync_records_seq') WHERE patient_id = $1 AND resource_type <> 'Appointment'`, [patient])
        }
        await logAccess(q, entry('success', patient, have ? 'update' : 'create'))
        const isBooking = resource.resourceType === 'Appointment' && resource.status === 'booked' && !wasBooked
        return {
          http: have ? 200 : 201, body: { status: 'ok', serverVersion: version }, outcome: 'success' as const,
          ...(isBooking ? { event: { appointmentId: id, patientId: patient, specialistId: specialist, startsAt: new Date(resource.start).toISOString(), endsAt: new Date(resource.end).toISOString() } } : {}),
        }
      })
    } catch (error) {
      const refusal = error instanceof Stop ? error.answer : fromDatabase(error)
      if (!refusal) throw error // a real fault: the error handler answers 500
      await ctx.db.withTransaction(null, (q) => logAccess(q, entry(refusal.outcome, patientId)))
      return void res.status(refusal.http).json(refusal.body)
    }

    // After COMMIT, as in POST /appointments. If SNS fails the visit is still booked; the reminder is what's lost.
    if (answer.event) {
      const phone = await ctx.db.query(
        `SELECT p.phone FROM patients p WHERE p.id = $1 AND p.phone IS NOT NULL AND EXISTS (
           SELECT 1 FROM consents c WHERE c.patient_id = p.id AND c.purpose = 'appointment_reminders' AND c.withdrawn_at IS NULL)`,
        [answer.event.patientId],
      ).catch(() => ({ rows: [] as Json[] }))
      await ctx.events.publish('appointment.created', { ...answer.event, patientPhone: phone.rows[0]?.phone ?? null })
        .catch((error: unknown) => logger.error({ err: error, appointmentId: answer.event?.appointmentId }, 'visit saved but appointment.created was not published'))
    }
    res.status(answer.http).json(answer.body)
  })

  /** Downloads what this person may see that changed after their bookmark. The server decides, not the app. */
  app.get('/sync/pull', requireActor(ctx.jwtKey, ctx.db), async (req: Request, res: Response) => {
    const actor = res.locals.actor as Actor
    const raw = req.query.since ?? '0'
    if (typeof raw !== 'string' || !/^\d{1,18}$/.test(raw)) return void res.status(400).json({ error: 'invalid_request', field: 'since', message: 'since must be a whole number' })
    const page = await ctx.db.withTransaction(actor.id, async (q) => {
      const { rows } = await q.query(
        `SELECT s.id, s.resource_type, s.patient_id, s.version, s.seq, s.resource FROM sync_records s
         WHERE s.seq > $4 AND ${VISIBLE} ORDER BY s.seq LIMIT $5`,
        [actor.id, actor.role, actor.patientId ?? null, raw, PAGE + 1],
      )
      const items = rows.slice(0, PAGE)
      const logged = new Set<string>()
      for (const r of items) {
        const key = `${String(r.patient_id)}:${String(r.resource_type)}`
        if (logged.has(key)) continue
        logged.add(key)
        await logAccess(q, { accessedBy: actor.id, patientId: String(r.patient_id), resourceType: r.resource_type as AccessEntry['resourceType'], action: 'read', outcome: 'success', sourceIp: req.ip ?? null })
      }
      const newest = items.length ? null : (await q.query('SELECT COALESCE(max(seq), 0) AS seq FROM sync_records')).rows[0]?.seq
      return { items, more: rows.length > PAGE, newest }
    })
    const cursor = page.items.length ? Number(page.items.at(-1)!.seq) : Math.max(Number(raw), Number(page.newest))
    res.json({
      items: page.items.map((r) => ({ id: r.id, resourceType: r.resource_type, patientId: r.patient_id, version: r.version, resource: r.resource })),
      cursor, more: page.more,
    })
  })

  /** Which times a doctor or specialist is already booked, so the app can grey them out. Times only: no patient, no reason. */
  app.get('/sync/taken', requireActor(ctx.jwtKey, ctx.db), async (req: Request, res: Response) => {
    const actor = res.locals.actor as Actor
    if (!WRITERS.has(actor.role)) return void res.status(403).json({ error: 'forbidden', message: `A ${actor.role} account cannot book visits` })
    const { specialist, from, to } = req.query
    if (typeof specialist !== 'string' || !UUID.test(specialist)) return void res.status(400).json({ error: 'invalid_request', field: 'specialist', message: 'specialist must be a UUID' })
    if (typeof from !== 'string' || typeof to !== 'string' || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) {
      return void res.status(400).json({ error: 'invalid_request', message: 'from and to must be date-times' })
    }
    const { rows } = await ctx.db.query(
      `SELECT starts_at, ends_at FROM appointments WHERE specialist_id = $1 AND status = 'booked' AND tstzrange(starts_at, ends_at) && tstzrange($2::timestamptz, $3::timestamptz) ORDER BY starts_at`,
      [specialist, new Date(from).toISOString(), new Date(to).toISOString()],
    )
    res.json(rows.map((r) => ({ start: new Date(r.starts_at as string).toISOString(), end: new Date(r.ends_at as string).toISOString() })))
  })
}

/** The big-body parser, mounted before the normal 100 kB one. */
export const syncBodyParser = express.json({ limit: SYNC_BODY_LIMIT })
