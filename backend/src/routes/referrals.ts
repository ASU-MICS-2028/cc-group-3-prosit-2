import type { Express, Request, Response } from 'express'
import type { Ctx } from '../app.js'
import { logAccess, type AccessEntry } from '../audit.js'
import { requireActor, type Actor } from '../auth.js'
import type { Queryable } from '../db.js'
import { SYSTEM_ID } from './payments.js'
import { Refusal, invalid, text } from './prescriptions.js'
import { canReach, reopenRecords } from './sync.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const REFERRERS = new Set(['chv', 'nurse', 'doctor', 'specialist'])
const RESPONDERS = new Set(['nurse', 'doctor', 'specialist', 'health_centre_admin', 'ghs_official'])

/** Every message in this file is written to care_events and shown in the app. Nothing here sends an SMS. */
const DELIVERY = 'logged_only'

// Illustrative rules, as in prescriptions.ts. No medical partner has signed them off, and the app says so.
type Priority = 'emergency' | 'urgent' | 'soon' | 'routine'
const ORDER: Priority[] = ['emergency', 'urgent', 'soon', 'routine']
const SIGNS: Record<string, [Priority, string]> = {
  unconscious: ['emergency', 'not responding'],
  convulsions: ['emergency', 'convulsions'],
  breathing_difficulty: ['emergency', 'struggling to breathe'],
  severe_bleeding: ['emergency', 'heavy bleeding'],
  fever_with_rash: ['urgent', 'fever with rash'],
  severe_dehydration: ['urgent', 'severe dehydration'],
  severe_pain: ['urgent', 'severe pain'],
  persistent_vomiting: ['soon', 'vomiting that will not stop'],
  not_eating: ['soon', 'not eating or drinking'],
}
/** For each level: [below this, or at or above this]. The urgent and soon lines match the app's vital flags (config/thresholds.ts). */
const VITALS: Record<string, { label: string; unit: string; emergency: [number, number]; urgent: [number, number]; soon: [number, number] }> = {
  systolic: { label: 'top blood pressure', unit: 'mmHg', emergency: [70, 220], urgent: [80, 180], soon: [0, 140] },
  diastolic: { label: 'bottom blood pressure', unit: 'mmHg', emergency: [40, 130], urgent: [50, 120], soon: [0, 90] },
  temperature: { label: 'temperature', unit: '°C', emergency: [34, 41], urgent: [35, 39.5], soon: [0, 37.5] },
}

/** The highest level anything reached, and what reached it. It's a suggestion to a person, never a diagnosis. */
export function suggestPriority(signs: string[], vitals: Record<string, number>): { priority: Priority; reason: string } {
  for (const level of ORDER.slice(0, 3) as Exclude<Priority, 'routine'>[]) {
    const why = signs.filter((s) => SIGNS[s]![0] === level).map((s) => SIGNS[s]![1])
    for (const [name, value] of Object.entries(vitals)) {
      const rule = VITALS[name]!
      if (value < rule[level][0] || value >= rule[level][1]) why.push(`${rule.label} ${value} ${rule.unit}`)
    }
    if (why.length) return { priority: level, reason: `Suggested ${level}: ${why.join('; ')}` }
  }
  return { priority: 'routine', reason: 'Suggested routine: no danger signs or out-of-range readings entered' }
}

const clinical = (b: Record<string, unknown>) => {
  const signs = b.danger_signs ?? []
  if (!Array.isArray(signs) || signs.some((s) => typeof s !== 'string' || !SIGNS[s])) throw invalid('danger_signs', 'danger_signs must be a list of known danger signs')
  const vitals = (b.vitals ?? {}) as Record<string, unknown>
  if (typeof vitals !== 'object' || Array.isArray(vitals)) throw invalid('vitals', 'vitals must be an object')
  for (const [k, v] of Object.entries(vitals)) {
    if (!VITALS[k] || typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > 400) throw invalid('vitals', `${k} is not a reading we accept`)
  }
  return suggestPriority(signs as string[], vitals as Record<string, number>)
}

/** Each level is this many minutes after the last, if nobody has acknowledged. Illustrative, as above. */
const ESCALATE_MINUTES = 5
const LAST_LEVEL = 3
const FACILITY = '(SELECT facility_id FROM practitioners WHERE id = $1)'

/**
 * Who may see an emergency. Raising the level is what widens this: nurses at the facility and the patient's own
 * doctors first, then every doctor there, then the facility's admin, then GHS.
 * ponytail: no facility recorded means every nurse (then every doctor) can see it, because an emergency nobody can
 * see is worse. Narrow it once practitioners.facility_id is filled in for all staff.
 */
const SEES_EMERGENCY = `(
  e.created_by = $1
  OR ($2 IN ('nurse', 'doctor', 'specialist') AND (
    (($2 = 'nurse' OR e.escalation_level >= 1) AND (e.facility_id IS NULL OR e.facility_id = ${FACILITY}))
    OR e.patient_id IN (SELECT patient_id FROM sync_records WHERE resource_type = 'Appointment' AND practitioner_id = $1)))
  OR ($2 = 'health_centre_admin' AND e.escalation_level >= 2 AND e.facility_id = ${FACILITY})
  OR ($2 = 'ghs_official' AND e.escalation_level >= 3)
)`

/** The same ladder as SEES_EMERGENCY, as names: who a step reached, written down at the time. */
async function reachedAt(q: Queryable, level: number, e: Record<string, unknown>) {
  const { rows } = await q.query(
    `SELECT full_name FROM practitioners p WHERE p.active AND p.id <> $4::uuid AND (
       ($1::int = 0 AND p.role = 'nurse' AND ($2::uuid IS NULL OR p.facility_id = $2))
       OR ($1 = 0 AND p.id IN (SELECT practitioner_id FROM sync_records WHERE resource_type = 'Appointment' AND patient_id = $3::uuid))
       OR ($1 = 1 AND p.role IN ('doctor', 'specialist') AND ($2::uuid IS NULL OR p.facility_id = $2))
       OR ($1 = 2 AND p.role = 'health_centre_admin' AND p.facility_id = $2)
       OR ($1 = 3 AND p.role = 'ghs_official')
     ) ORDER BY full_name LIMIT 20`,
    [level, e.facility_id, e.patient_id, e.created_by],
  )
  return rows.map((r) => r.full_name).join(', ') || 'No one is registered for this step'
}

const record = (q: Queryable, e: { referral?: string; emergency?: string; kind: string; level?: number; actor?: string; notified: string; message: string; at?: Date }) => q.query(
  `INSERT INTO care_events (referral_id, emergency_id, kind, level, actor, notified, message, at) VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, now()))`,
  [e.referral ?? null, e.emergency ?? null, e.kind, e.level ?? null, e.actor ?? null, e.notified, e.message, e.at ?? null],
)

type Row = Record<string, unknown>
const iso = (v: unknown) => (v ? new Date(String(v)).toISOString() : null)

const eventsOf = async (q: Queryable, column: 'referral_id' | 'emergency_id', id: string) =>
  (await q.query(
    `SELECT c.kind, c.level, c.notified, c.message, c.at, p.full_name AS actor_name FROM care_events c
     LEFT JOIN practitioners p ON p.id = c.actor WHERE c.${column} = $1 ORDER BY c.at, c.recorded_at`, [id],
  )).rows.map((r) => ({ kind: r.kind, level: r.level, who: r.actor_name ?? null, notified: r.notified, message: r.message, at: iso(r.at), delivery: DELIVERY }))

const REFERRAL = `SELECT r.*, pa.full_name AS patient_name, fr.full_name AS from_name, tr.full_name AS to_name FROM referrals r
  JOIN patients pa ON pa.id = r.patient_id JOIN practitioners fr ON fr.id = r.created_by JOIN practitioners tr ON tr.id = r.to_practitioner_id`

function referralActions(r: Row, actor: Actor): string[] {
  if (r.to_practitioner_id === actor.id) return r.status === 'pending' ? ['accept', 'decline'] : r.status === 'accepted' ? ['complete'] : []
  return r.created_by === actor.id && r.status === 'pending' ? ['cancel'] : []
}
const referralJson = (r: Row, actor: Actor) => ({
  id: r.id, patient: { id: r.patient_id, name: r.patient_name }, reason: r.reason, priority: r.priority, priorityReason: r.priority_reason, status: r.status,
  from: r.from_name, to: r.to_name, sentAt: iso(r.created_at), relation: r.to_practitioner_id === actor.id ? 'received' : 'sent', actions: referralActions(r, actor),
})

const EMERGENCY = `SELECT e.*, pa.full_name AS patient_name, fr.full_name AS from_name, ak.full_name AS ack_name FROM emergencies e
  LEFT JOIN patients pa ON pa.id = e.patient_id JOIN practitioners fr ON fr.id = e.created_by LEFT JOIN practitioners ak ON ak.id = e.acknowledged_by`

function emergencyActions(e: Row, actor: Actor): string[] {
  const out: string[] = []
  if (RESPONDERS.has(actor.role) && e.created_by !== actor.id && e.status === 'raised') out.push('acknowledge')
  if (RESPONDERS.has(actor.role) && e.status === 'acknowledged') out.push('resolve')
  if (e.created_by === actor.id && (e.status === 'raised' || e.status === 'acknowledged')) out.push('cancel')
  return out
}
const emergencyJson = (e: Row, actor: Actor) => ({
  id: e.id, patient: e.patient_id ? { id: e.patient_id, name: e.patient_name } : null, description: e.description, location: e.location_note ?? null, status: e.status,
  level: e.escalation_level, raisedAt: iso(e.created_at), raisedBy: e.from_name, acknowledgedBy: e.ack_name ?? null, acknowledgedAt: iso(e.acknowledged_at),
  nextEscalationAt: e.status === 'raised' && Number(e.escalation_level) < LAST_LEVEL
    ? new Date(new Date(String(e.created_at)).getTime() + (Number(e.escalation_level) + 1) * ESCALATE_MINUTES * 60_000).toISOString() : null,
  actions: emergencyActions(e, actor),
})

export function referralRoutes(app: Express, ctx: Ctx) {
  const guard = requireActor(ctx.jwtKey, ctx.db)
  const entry = (req: Request, actor: Actor, type: AccessEntry['resourceType'], action: AccessEntry['action'], outcome: AccessEntry['outcome'], patientId: string | null): AccessEntry => ({
    accessedBy: actor.id, patientId, resourceType: type, action, outcome, sourceIp: req.ip ?? null,
  })
  const handle = (type: AccessEntry['resourceType'], action: AccessEntry['action'], work: (req: Request, res: Response, actor: Actor) => Promise<void>) => async (req: Request, res: Response) => {
    const actor = res.locals.actor as Actor
    try {
      await work(req, res, actor)
    } catch (error) {
      if (!(error instanceof Refusal)) throw error
      await ctx.db.withTransaction(null, (q) => logAccess(q, entry(req, actor, type, action, error.outcome, typeof error.body.patientId === 'string' ? error.body.patientId : null)))
      const { patientId: _hidden, ...body } = error.body
      res.status(error.status).json(body)
    }
  }
  const idParam = (req: Request) => {
    const id = String(req.params.id)
    if (!UUID.test(id)) throw invalid('id', 'The id must be a UUID')
    return id
  }
  const forbidden = (message: string, patientId?: unknown) => new Refusal(403, { error: 'forbidden', message, ...(patientId ? { patientId } : {}) }, 'denied')
  const NOT_FOUND = (what: string) => new Refusal(404, { error: 'not_found', message: `Unknown ${what}` }, 'not_found')
  const conflict = (status: string, patientId: unknown) => new Refusal(409, { error: 'wrong_status', message: `This is already ${status}`, patientId: patientId ?? undefined })

  /* ---------------- Referrals ---------------- */

  app.post('/referrals/suggest', guard, handle('Referral', 'read', async (req, res, actor) => {
    if (!REFERRERS.has(actor.role)) throw forbidden(`A ${actor.role} account cannot refer patients`)
    res.json({ ...clinical((req.body ?? {}) as Row), note: 'A suggestion from example rules, not a diagnosis' })
  }))

  /**
   * Sends a referral. The server works out the priority again from what it's given, and only then applies what the
   * person chose. A suggested emergency can't be lowered. The id comes from the phone, so a retry returns the same one.
   */
  app.post('/referrals', guard, handle('Referral', 'create', async (req, res, actor) => {
    if (!REFERRERS.has(actor.role)) throw forbidden(`A ${actor.role} account cannot refer patients`)
    const b = (req.body ?? {}) as Row
    for (const f of ['id', 'patient_id', 'to_practitioner_id']) if (typeof b[f] !== 'string' || !UUID.test(b[f] as string)) throw invalid(f, `${f} must be a UUID`)
    const [id, patient, to] = [b.id as string, b.patient_id as string, b.to_practitioner_id as string]
    if (to === actor.id) throw invalid('to_practitioner_id', 'You cannot refer a patient to yourself')
    const reason = text(b, 'reason', 500)
    const suggestion = clinical(b)
    if (b.priority !== undefined && !ORDER.includes(b.priority as Priority)) throw invalid('priority', 'priority must be emergency, urgent, soon or routine')
    const chosen = (b.priority as Priority | undefined) ?? suggestion.priority
    if (suggestion.priority === 'emergency' && chosen !== 'emergency') throw new Refusal(422, { error: 'cannot_lower_emergency', message: 'A suggested emergency cannot be lowered', patientId: patient })
    const why = chosen === suggestion.priority ? suggestion.reason : `${suggestion.reason}. Changed to ${chosen} by the person referring`

    const result = await ctx.db.withTransaction(actor.id, async (q) => {
      const again = (await q.query('SELECT patient_id, created_by FROM referrals WHERE id = $1', [id])).rows[0]
      if (again && (again.patient_id !== patient || again.created_by !== actor.id)) throw new Refusal(409, { error: 'id_conflict', message: 'This id is already used by a different referral' })
      let created = false
      if (!again) {
        if (!(await canReach(q, actor, patient))) throw new Refusal(403, { error: 'forbidden', message: 'This patient is not one of yours', patientId: patient }, 'denied')
        const target = (await q.query(`SELECT full_name FROM practitioners WHERE id = $1 AND active AND role IN ('doctor', 'specialist')`, [to])).rows[0]
        if (!target) throw invalid('to_practitioner_id', 'to_practitioner_id is not an active doctor or specialist')
        const consent = (await q.query(`SELECT id FROM consents WHERE patient_id = $1 AND purpose = 'clinical_care' AND withdrawn_at IS NULL ORDER BY given_at DESC LIMIT 1`, [patient])).rows[0]
        if (!consent) throw new Refusal(403, { error: 'consent_missing', message: 'This patient has not given consent for care. Ask them first', patientId: patient }, 'denied')
        created = (await q.query(
          `INSERT INTO referrals (id, patient_id, consent_id, to_practitioner_id, reason, priority, priority_reason) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING RETURNING id`,
          [id, patient, consent.id, to, reason, chosen, why],
        )).rows.length > 0
        if (created) await record(q, { referral: id, kind: 'sent', actor: actor.id, notified: String(target.full_name), message: `New ${chosen} referral: ${reason}. ${why}` })
        await logAccess(q, entry(req, actor, 'Referral', 'create', 'success', patient))
      }
      return { created, json: referralJson((await q.query(`${REFERRAL} WHERE r.id = $1`, [id])).rows[0]!, actor) }
    })
    res.status(result.created ? 201 : 200).json(result.json)
  }))

  /** Open referrals sent to me, and all the ones I sent. Most urgent first, then longest waiting. */
  app.get('/referrals/mine', guard, handle('Referral', 'read', async (req, res, actor) => {
    if (!REFERRERS.has(actor.role)) throw forbidden(`A ${actor.role} account has no referrals`)
    const items = await ctx.db.withTransaction(actor.id, async (q) => {
      const { rows } = await q.query(
        `${REFERRAL} WHERE (r.to_practitioner_id = $1 AND r.status IN ('pending', 'accepted')) OR r.created_by = $1
         ORDER BY array_position(ARRAY['emergency', 'urgent', 'soon', 'routine'], r.priority), r.created_at LIMIT 100`, [actor.id],
      )
      for (const pid of new Set(rows.map((r) => String(r.patient_id)))) await logAccess(q, entry(req, actor, 'Referral', 'read', 'success', pid))
      return rows.map((r) => referralJson(r, actor))
    })
    res.json(items)
  }))

  app.get('/referrals/:id', guard, handle('Referral', 'read', async (req, res, actor) => {
    const id = idParam(req)
    const json = await ctx.db.withTransaction(actor.id, async (q) => {
      const r = (await q.query(`${REFERRAL} WHERE r.id = $1`, [id])).rows[0]
      if (!r) throw NOT_FOUND('referral')
      if (r.to_practitioner_id !== actor.id && r.created_by !== actor.id) throw forbidden('This referral is not yours', r.patient_id)
      await logAccess(q, entry(req, actor, 'Referral', 'read', 'success', String(r.patient_id)))
      return { ...referralJson(r, actor), events: await eventsOf(q, 'referral_id', id) }
    })
    res.json(json)
  }))

  /** Who may do what, and from which status. `SELECT ... FOR UPDATE` so two taps can't both win. */
  const STEPS: Record<string, { to: string; from: string; receiver: boolean }> = {
    accept: { to: 'accepted', from: 'pending', receiver: true },
    decline: { to: 'declined', from: 'pending', receiver: true },
    complete: { to: 'completed', from: 'accepted', receiver: true },
    cancel: { to: 'cancelled', from: 'pending', receiver: false },
  }
  app.post('/referrals/:id/:action', guard, handle('Referral', 'update', async (req, res, actor) => {
    const id = idParam(req)
    const step = STEPS[String(req.params.action)]
    if (!step) throw NOT_FOUND('action')
    const json = await ctx.db.withTransaction(actor.id, async (q) => {
      const r = (await q.query(`SELECT * FROM referrals WHERE id = $1 FOR UPDATE`, [id])).rows[0]
      if (!r) throw NOT_FOUND('referral')
      if ((step.receiver ? r.to_practitioner_id : r.created_by) !== actor.id) throw forbidden(step.receiver ? 'Only the person it was sent to can do that' : 'Only the person who sent it can cancel it', r.patient_id)
      if (r.status !== step.from) throw conflict(String(r.status), r.patient_id)
      // Reading the patient's record comes with accepting. A doctor who already sees this patient loses nothing.
      if (step.to === 'accepted' && !(await canReach(q, actor, String(r.patient_id)))) await reopenRecords(q, String(r.patient_id))
      await q.query('UPDATE referrals SET status = $2 WHERE id = $1', [id, step.to])
      const other = step.receiver ? r.created_by : r.to_practitioner_id
      const name = (await q.query('SELECT full_name FROM practitioners WHERE id = $1', [other])).rows[0]!.full_name
      await record(q, { referral: id, kind: step.to, actor: actor.id, notified: String(name), message: `Referral ${step.to}.` })
      await logAccess(q, entry(req, actor, 'Referral', 'update', 'success', String(r.patient_id)))
      return { ...referralJson((await q.query(`${REFERRAL} WHERE r.id = $1`, [id])).rows[0]!, actor), events: await eventsOf(q, 'referral_id', id) }
    })
    res.json(json)
  }))

  /* ---------------- Emergencies ---------------- */

  /**
   * Escalation is worked out from the clock whenever anyone asks, before anyone is shown anything, so an emergency
   * can't sit at the wrong level once it's looked at. It runs as the system, in its own transaction, and steps carry
   * the time they fell due, however late they were written. SKIP LOCKED: someone else is already settling that row.
   * ponytail: runs on read; with no reader the row catches up on the next read. A timer can call this if a
   * notification ever has to leave the system while nobody has the app open.
   */
  const settle = () => ctx.db.withTransaction(SYSTEM_ID, async (q) => {
    const { rows } = await q.query(
      `SELECT id, escalation_level, facility_id, patient_id, created_by, created_at, description,
              LEAST(floor(extract(epoch FROM now() - created_at) / 60 / $1::int)::int, $2::int) AS due
       FROM emergencies WHERE status = 'raised' AND escalation_level < $2
         AND created_at + make_interval(mins => (escalation_level + 1) * $1::int) <= now()
       FOR UPDATE SKIP LOCKED`, [ESCALATE_MINUTES, LAST_LEVEL],
    )
    for (const e of rows) {
      const id = String(e.id)
      const raised = new Date(String(e.created_at)).getTime()
      let last = 0
      for (let level = Number(e.escalation_level) + 1; level <= Number(e.due); level++) {
        last = raised + level * ESCALATE_MINUTES * 60_000
        await record(q, {
          emergency: id, kind: 'escalated', level, at: new Date(last), notified: await reachedAt(q, level, e),
          message: `Not acknowledged after ${level * ESCALATE_MINUTES} minutes: ${String(e.description)}`,
        })
      }
      await q.query('UPDATE emergencies SET escalation_level = $2, escalated_at = $3 WHERE id = $1', [id, e.due, new Date(last)])
    }
  })

  /** The emergency button. No consent check: care goes ahead on implied consent. A retry returns the same one. */
  app.post('/emergencies', guard, handle('Emergency', 'create', async (req, res, actor) => {
    if (!REFERRERS.has(actor.role)) throw forbidden(`A ${actor.role} account cannot raise an emergency`)
    const b = (req.body ?? {}) as Row
    if (typeof b.id !== 'string' || !UUID.test(b.id)) throw invalid('id', 'id must be a UUID')
    if (b.patient_id !== undefined && (typeof b.patient_id !== 'string' || !UUID.test(b.patient_id))) throw invalid('patient_id', 'patient_id must be a UUID')
    const id = b.id, description = text(b, 'description', 500)
    const location = b.location_note === undefined || b.location_note === null || b.location_note === '' ? null : text(b, 'location_note', 200)
    const result = await ctx.db.withTransaction(actor.id, async (q) => {
      const again = (await q.query('SELECT created_by FROM emergencies WHERE id = $1', [id])).rows[0]
      if (again && again.created_by !== actor.id) throw new Refusal(409, { error: 'id_conflict', message: 'This id is already used by a different emergency' })
      let created = false
      if (!again) {
        // A patient still waiting on this phone's sync isn't on the server yet. That must never hold up an emergency.
        let patient = (b.patient_id as string | undefined) ?? null
        if (patient && (await q.query('SELECT 1 FROM patients WHERE id = $1', [patient])).rows.length === 0) patient = null
        if (patient && !(await canReach(q, actor, patient))) throw forbidden('This patient is not one of yours', patient)
        const row = (await q.query(
          `INSERT INTO emergencies (id, patient_id, facility_id, location_note, description) VALUES ($1, $2, (SELECT facility_id FROM practitioners WHERE id = $3), $4, $5)
           ON CONFLICT DO NOTHING RETURNING id, facility_id, patient_id, created_by`, [id, patient, actor.id, location, description],
        )).rows[0]
        if (row) {
          created = true
          await record(q, { emergency: id, kind: 'raised', level: 0, actor: actor.id, notified: await reachedAt(q, 0, row), message: description })
          await logAccess(q, entry(req, actor, 'Emergency', 'create', 'success', patient))
        }
      }
      return { created, json: { ...emergencyJson((await q.query(`${EMERGENCY} WHERE e.id = $1`, [id])).rows[0]!, actor), events: await eventsOf(q, 'emergency_id', id) } }
    })
    res.status(result.created ? 201 : 200).json(result.json)
  }))

  /** Open emergencies this person may see: least answered and most escalated first. */
  app.get('/emergencies/mine', guard, handle('Emergency', 'read', async (req, res, actor) => {
    await settle()
    const items = await ctx.db.withTransaction(actor.id, async (q) => {
      const { rows } = await q.query(
        `${EMERGENCY} WHERE e.status IN ('raised', 'acknowledged') AND ${SEES_EMERGENCY}
         ORDER BY e.status = 'raised' DESC, e.escalation_level DESC, e.created_at LIMIT 100`, [actor.id, actor.role],
      )
      for (const pid of new Set(rows.map((r) => r.patient_id ? String(r.patient_id) : null))) await logAccess(q, entry(req, actor, 'Emergency', 'read', 'success', pid))
      return rows.map((r) => emergencyJson(r, actor))
    })
    res.json(items)
  }))

  const visibleEmergency = async (q: Queryable, id: string, actor: Actor, lock = false) => {
    const known = (await q.query(`SELECT patient_id FROM emergencies WHERE id = $1 ${lock ? 'FOR UPDATE' : ''}`, [id])).rows[0]
    if (!known) throw NOT_FOUND('emergency')
    const r = (await q.query(`${EMERGENCY} WHERE e.id = $3 AND ${SEES_EMERGENCY}`, [actor.id, actor.role, id])).rows[0]
    if (!r) throw forbidden('This emergency has not reached you', known.patient_id)
    return r
  }

  app.get('/emergencies/:id', guard, handle('Emergency', 'read', async (req, res, actor) => {
    const id = idParam(req)
    await settle()
    const json = await ctx.db.withTransaction(actor.id, async (q) => {
      const e = await visibleEmergency(q, id, actor)
      await logAccess(q, entry(req, actor, 'Emergency', 'read', 'success', e.patient_id ? String(e.patient_id) : null))
      return { ...emergencyJson(e, actor), events: await eventsOf(q, 'emergency_id', id) }
    })
    res.json(json)
  }))

  app.post('/emergencies/:id/:action', guard, handle('Emergency', 'update', async (req, res, actor) => {
    const id = idParam(req)
    const action = String(req.params.action)
    if (!['acknowledge', 'resolve', 'cancel'].includes(action)) throw NOT_FOUND('action')
    await settle()
    const json = await ctx.db.withTransaction(actor.id, async (q) => {
      const e = await visibleEmergency(q, id, actor, true)
      const patient = e.patient_id ? String(e.patient_id) : null
      if (!emergencyActions(e, actor).includes(action)) {
        if (action === 'acknowledge' && e.created_by === actor.id) throw forbidden('Someone else has to acknowledge an emergency you raised', patient)
        if (e.status === 'resolved' || e.status === 'cancelled' || (action === 'acknowledge' && e.status === 'acknowledged') || (action === 'resolve' && e.status === 'raised')) throw conflict(String(e.status), patient)
        throw forbidden(`A ${actor.role} account cannot ${action} this emergency`, patient)
      }
      if (action === 'acknowledge') await q.query(`UPDATE emergencies SET status = 'acknowledged', acknowledged_by = $2, acknowledged_at = now() WHERE id = $1`, [id, actor.id])
      if (action === 'resolve') await q.query(`UPDATE emergencies SET status = 'resolved', resolved_at = now() WHERE id = $1`, [id])
      if (action === 'cancel') await q.query(`UPDATE emergencies SET status = 'cancelled' WHERE id = $1`, [id])
      const kind = { acknowledge: 'acknowledged', resolve: 'resolved', cancel: 'cancelled' }[action]!
      await record(q, { emergency: id, kind, actor: actor.id, notified: String(e.from_name), message: `Emergency ${kind}.` })
      await logAccess(q, entry(req, actor, 'Emergency', 'update', 'success', patient))
      return { ...emergencyJson((await q.query(`${EMERGENCY} WHERE e.id = $1`, [id])).rows[0]!, actor), events: await eventsOf(q, 'emergency_id', id) }
    })
    res.json(json)
  }))
}
