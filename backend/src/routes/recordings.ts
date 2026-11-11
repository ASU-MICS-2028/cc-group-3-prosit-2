import type { Express, Request, Response } from 'express'
import type { Ctx } from '../app.js'
import { logAccess, type AccessEntry } from '../audit.js'
import { requireActor, type Actor } from '../auth.js'
import type { Queryable } from '../db.js'
import { Refusal, invalid } from './prescriptions.js'
import { canReach } from './sync.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const OUTCOMES = new Set(['meets_standard', 'needs_follow_up'])
const MAX_SECONDS = 4 * 3600 // well past the phone's own limit; only here to refuse nonsense
type Row = Record<string, unknown>

const refused = (status: number, error: string, message: string, patientId?: unknown, outcome: AccessEntry['outcome'] = 'error') =>
  new Refusal(status, { error, message, ...(typeof patientId === 'string' ? { patientId } : {}) }, outcome)
const NOT_FOUND = () => refused(404, 'not_found', 'Unknown recording', undefined, 'not_found')

/** Consent and QA facts only. The recording stays encrypted on the doctor's phone; no route here accepts or returns media. */
export function recordingRoutes(app: Express, ctx: Ctx) {
  const guard = requireActor(ctx.jwtKey, ctx.db)
  const log = (req: Request, actor: Actor, action: AccessEntry['action'], outcome: AccessEntry['outcome'], patientId: string | null): AccessEntry => ({
    accessedBy: actor.id, patientId, resourceType: 'Media', action, outcome, sourceIp: req.ip ?? null,
  })
  const handle = (action: AccessEntry['action'], work: (req: Request, res: Response, actor: Actor) => Promise<void>) => async (req: Request, res: Response) => {
    const actor = res.locals.actor as Actor
    try {
      await work(req, res, actor)
    } catch (error) {
      if (!(error instanceof Refusal)) throw error
      await ctx.db.withTransaction(null, (q) => logAccess(q, log(req, actor, action, error.outcome, typeof error.body.patientId === 'string' ? error.body.patientId : null)))
      const { patientId: _hidden, ...body } = error.body
      res.status(error.status).json(body)
    }
  }

  /** The doctor on the visit, or the patient's side (their own login, or a CHV who looks after them). Nobody else. */
  const sideOf = async (q: Queryable, actor: Actor, visit: Row): Promise<'clinician' | 'patient' | null> => {
    if (actor.id === visit.specialist_id) return 'clinician'
    if ((actor.role === 'patient' || actor.role === 'chv') && await canReach(q, actor, String(visit.patient_id))) return 'patient'
    return null
  }
  const idOf = (req: Request) => {
    const id = String(req.params.id)
    if (!UUID.test(id)) throw invalid('id', 'The recording id must be a UUID')
    return id
  }
  const load = async (q: Queryable, id: string) => (await q.query(
    `SELECT r.*, a.patient_id, a.specialist_id FROM call_recordings r JOIN appointments a ON a.id = r.appointment_id WHERE r.id = $1 FOR UPDATE OF r`, [id],
  )).rows[0]
  const statusOf = (r: Row) => (r.withdrawn_at ? 'withdrawn' : r.ended_at ? 'finished' : 'open')
  const iso = (v: unknown) => (v ? new Date(String(v)).toISOString() : null)

  /**
   * One side says yes for this one recording. The doctor's yes opens the record, so a doctor always asks first; the
   * phone only tells the other person once this has been saved, and starts only after their yes has been saved too.
   */
  app.post('/recordings/:id/agree', guard, handle('update', async (req, res, actor) => {
    const id = idOf(req)
    const json = await ctx.db.withTransaction(actor.id, async (q) => {
      let rec = await load(q, id)
      if (!rec) {
        const appointment = (req.body as Row | undefined)?.appointment_id
        if (typeof appointment !== 'string' || !UUID.test(appointment)) throw invalid('appointment_id', 'appointment_id must be a UUID')
        const visit = (await q.query('SELECT patient_id, specialist_id, status FROM appointments WHERE id = $1', [appointment])).rows[0]
        if (!visit) throw refused(404, 'not_found', 'This visit is not on the server yet. Check for new visits, then try again', undefined, 'not_found')
        const side = await sideOf(q, actor, visit)
        if (!side) throw refused(403, 'forbidden', 'You are not part of this visit', visit.patient_id, 'denied')
        if (side !== 'clinician') throw refused(409, 'not_asked', 'The doctor has not asked to record this visit', visit.patient_id)
        if (visit.status !== 'booked') throw refused(409, 'visit_closed', 'This visit is no longer booked', visit.patient_id)
        await q.query('INSERT INTO call_recordings (id, appointment_id) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [id, appointment])
        rec = (await load(q, id))!
      }
      const side = await sideOf(q, actor, rec)
      if (!side) throw refused(403, 'forbidden', 'You are not part of this visit', rec.patient_id, 'denied')
      if (rec.withdrawn_at) throw refused(409, 'withdrawn', 'This recording was stopped. Ask again to start a new one', rec.patient_id)
      if (rec.ended_at) throw refused(409, 'finished', 'This recording has already finished', rec.patient_id)
      if (side === 'clinician') await q.query('UPDATE call_recordings SET clinician_agreed_at = COALESCE(clinician_agreed_at, now()) WHERE id = $1', [id])
      else await q.query('UPDATE call_recordings SET patient_agreed_at = COALESCE(patient_agreed_at, now()), patient_agreed_by = COALESCE(patient_agreed_by, $2) WHERE id = $1', [id, actor.id])
      await logAccess(q, log(req, actor, 'update', 'success', String(rec.patient_id)))
      const now = (await load(q, id))!
      return { id, clinicianAgreed: now.clinician_agreed_at !== null, patientAgreed: now.patient_agreed_at !== null }
    })
    res.json(json)
  }))

  /** Either side, at any moment, repeatable. A withdrawn recording can never appear on the QA list. */
  app.post('/recordings/:id/withdraw', guard, handle('update', async (req, res, actor) => {
    const id = idOf(req)
    await ctx.db.withTransaction(actor.id, async (q) => {
      const rec = await load(q, id)
      if (!rec) throw NOT_FOUND()
      if (!(await sideOf(q, actor, rec))) throw refused(403, 'forbidden', 'You are not part of this visit', rec.patient_id, 'denied')
      await q.query('UPDATE call_recordings SET withdrawn_at = COALESCE(withdrawn_at, now()), withdrawn_by = COALESCE(withdrawn_by, $2) WHERE id = $1', [id, actor.id])
      await logAccess(q, log(req, actor, 'update', 'success', String(rec.patient_id)))
    })
    res.status(204).end()
  }))

  /** The doctor's phone reports the recording finished. Refused unless both sides' yes is on file. */
  app.post('/recordings/:id/finish', guard, handle('update', async (req, res, actor) => {
    const id = idOf(req)
    const seconds = (req.body as Row | undefined)?.seconds
    if (!Number.isInteger(seconds) || (seconds as number) < 0 || (seconds as number) > MAX_SECONDS) throw invalid('seconds', `seconds must be a whole number up to ${MAX_SECONDS}`)
    await ctx.db.withTransaction(actor.id, async (q) => {
      const rec = await load(q, id)
      if (!rec) throw NOT_FOUND()
      if (actor.id !== rec.specialist_id) throw refused(403, 'forbidden', 'Only the doctor on this visit can do this', rec.patient_id, 'denied')
      if (rec.withdrawn_at) throw refused(409, 'withdrawn', 'This recording was stopped and must not be kept', rec.patient_id)
      if (!rec.clinician_agreed_at || !rec.patient_agreed_at) throw refused(409, 'consent_incomplete', 'Both people have not agreed to this recording', rec.patient_id, 'denied')
      await q.query('UPDATE call_recordings SET ended_at = COALESCE(ended_at, now()), seconds = COALESCE(seconds, $2) WHERE id = $1', [id, seconds])
      await logAccess(q, log(req, actor, 'update', 'success', String(rec.patient_id)))
    })
    res.status(204).end()
  }))

  const reviewsOf = async (q: Queryable, id: string) =>
    (await q.query(`SELECT rv.outcome, rv.note, rv.created_at, rv.created_by, p.full_name FROM recording_reviews rv JOIN practitioners p ON p.id = rv.created_by WHERE rv.recording_id = $1 ORDER BY rv.created_at`, [id])).rows

  /**
   * Who sees what, decided here: a health centre admin sees finished recordings of doctors at their own facility and
   * may review them; a doctor sees their own, and may not review them. Names no patient: a reviewer doesn't need to know.
   */
  app.get('/recordings', guard, handle('read', async (req, res, actor) => {
    const admin = actor.role === 'health_centre_admin'
    if (!admin && !['doctor', 'specialist', 'nurse'].includes(actor.role)) throw refused(403, 'forbidden', `A ${actor.role} account cannot see recordings`, undefined, 'denied')
    const where = admin ? `d.facility_id = (SELECT facility_id FROM practitioners WHERE id = $1) AND r.ended_at IS NOT NULL AND r.withdrawn_at IS NULL` : 'a.specialist_id = $1'
    const items = await ctx.db.withTransaction(actor.id, async (q) => {
      const { rows } = await q.query(
        `SELECT r.*, a.patient_id, d.full_name AS doctor_name, f.name AS facility_name
         FROM call_recordings r JOIN appointments a ON a.id = r.appointment_id
         JOIN practitioners d ON d.id = a.specialist_id LEFT JOIN facilities f ON f.id = d.facility_id
         WHERE ${where} ORDER BY r.created_at DESC LIMIT 100`, [actor.id],
      )
      const out = []
      for (const r of rows) {
        const reviews = await reviewsOf(q, String(r.id))
        await logAccess(q, log(req, actor, 'read', 'success', String(r.patient_id)))
        out.push({
          id: r.id, doctor: r.doctor_name, facility: r.facility_name ?? null, status: statusOf(r), askedAt: iso(r.created_at), endedAt: iso(r.ended_at), seconds: r.seconds ?? null,
          clinicianAgreedAt: iso(r.clinician_agreed_at), patientAgreedAt: iso(r.patient_agreed_at), withdrawnAt: iso(r.withdrawn_at),
          mayReview: admin && !reviews.some((v) => v.created_by === actor.id), onThisDoctorsPhone: !admin,
          reviews: reviews.map((v) => ({ reviewer: v.full_name, outcome: v.outcome, note: v.note ?? null, at: iso(v.created_at) })),
        })
      }
      return out
    })
    res.json(items)
  }))

  /** A health centre admin records a review of a finished recording by a doctor at their own facility. */
  app.post('/recordings/:id/review', guard, handle('create', async (req, res, actor) => {
    if (actor.role !== 'health_centre_admin') throw refused(403, 'forbidden', `A ${actor.role} account cannot review recordings`, undefined, 'denied')
    const id = idOf(req)
    const b = (req.body ?? {}) as Row
    if (typeof b.outcome !== 'string' || !OUTCOMES.has(b.outcome)) throw invalid('outcome', 'outcome must be meets_standard or needs_follow_up')
    const note = b.note === undefined || b.note === null || b.note === '' ? null : b.note
    if (note !== null && (typeof note !== 'string' || note.length > 500)) throw invalid('note', 'note is up to 500 characters')
    const created = await ctx.db.withTransaction(actor.id, async (q) => {
      const rec = await load(q, id)
      if (!rec) throw NOT_FOUND()
      const same = (await q.query(
        `SELECT 1 FROM practitioners d, practitioners me WHERE d.id = $1 AND me.id = $2 AND d.facility_id = me.facility_id`, [rec.specialist_id, actor.id],
      )).rows.length > 0
      if (!same) throw refused(403, 'forbidden', 'This recording belongs to another facility', rec.patient_id, 'denied')
      if (statusOf(rec) !== 'finished') throw refused(409, 'not_reviewable', 'Only a finished recording that nobody withdrew can be reviewed', rec.patient_id)
      const inserted = (await q.query(
        `INSERT INTO recording_reviews (recording_id, outcome, note) VALUES ($1, $2, $3) ON CONFLICT (recording_id, created_by) DO NOTHING RETURNING id`, [id, b.outcome, note],
      )).rows.length > 0
      await logAccess(q, log(req, actor, 'create', 'success', String(rec.patient_id)))
      return inserted
    })
    res.status(created ? 201 : 200).json({ id, reviewed: true })
  }))
}
