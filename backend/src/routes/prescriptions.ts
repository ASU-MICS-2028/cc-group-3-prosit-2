import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import type { Express, Request, Response } from 'express'
import { rateLimit } from 'express-rate-limit'
import type { Ctx } from '../app.js'
import { logAccess, type AccessEntry } from '../audit.js'
import { requireActor, type Actor } from '../auth.js'
import type { Queryable } from '../db.js'
import { canReach } from './sync.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PRESCRIBERS = new Set(['doctor', 'specialist'])
const VALID_DAYS = 30
// Illustrative thresholds. No medical partner or regulator has signed them off, and the report says so.
const REPEAT_LIMIT = 3 // same medicine for one patient within 30 days
const HOURLY_LIMIT = 20 // prescriptions from one prescriber in an hour

type Row = Record<string, unknown>

class Refusal extends Error {
  constructor(readonly status: number, readonly body: Row, readonly outcome: AccessEntry['outcome'] = 'error') { super(String(body.message)) }
}
const invalid = (field: string, message: string) => new Refusal(400, { error: 'invalid_request', field, message })
const FORBIDDEN = (who: string, what: string) => new Refusal(403, { error: 'forbidden', message: `A ${who} account cannot ${what}` }, 'denied')

const text = (b: Row, field: string, max = 200): string => {
  const v = b[field]
  if (typeof v !== 'string' || !v.trim() || v.length > max) throw invalid(field, `${field} is required, up to ${max} characters`)
  return v.trim()
}
const whole = (b: Row, field: string, max: number): number => {
  const v = b[field]
  if (!Number.isInteger(v) || (v as number) < 1 || (v as number) > max) throw invalid(field, `${field} must be a whole number from 1 to ${max}`)
  return v as number
}

/** Eight digits: short enough to read out or type on a basic phone. The QR carries a signature as well. */
const newCode = () => String(randomInt(10_000_000, 100_000_000))

/** A status that's true now: an active prescription past its date counts as expired. */
const statusNow = (r: Row) => (r.status === 'active' && new Date(String(r.expires_at)) <= new Date() ? 'expired' : r.status)

export function prescriptionRoutes(app: Express, ctx: Ctx) {
  // The signature proves a QR came from this server and wasn't altered. It holds no patient data.
  // A separate purpose string means a token signature can never pass as a prescription one, or the reverse.
  const sign = (id: string, code: string) => createHmac('sha256', ctx.jwtKey!).update(`prescription-qr|${id}|${code}`).digest('base64url').slice(0, 22)
  const qrFor = (id: string, code: string) => `hc-rx:1:${id}:${code}:${sign(id, code)}`
  const readQr = (qr: string): string => {
    const [scheme, version, id, code, signature] = qr.split(':')
    if (scheme !== 'hc-rx' || version !== '1' || !id || !code || !signature) throw invalid('qr', 'That QR code is not a HealthConnect prescription')
    const expected = Buffer.from(sign(id, code))
    const given = Buffer.from(signature)
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      throw new Refusal(400, { error: 'bad_signature', message: 'That QR code has been altered, or did not come from HealthConnect' }, 'denied')
    }
    return code
  }

  const limit = rateLimit({
    windowMs: 60_000, limit: ctx.authRatePerMinute ?? 60, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'too_many_requests', message: 'Too many tries. Wait a minute and try again' },
  })
  const guard = [limit, requireActor(ctx.jwtKey, ctx.db)]
  const entry = (req: Request, actor: Actor, action: AccessEntry['action'], outcome: AccessEntry['outcome'], patientId: string | null): AccessEntry => ({
    accessedBy: actor.id, patientId, resourceType: 'Prescription', action, outcome, sourceIp: req.ip ?? null,
  })

  /** Runs a handler; a refusal is answered and put on record, a real fault goes to the error handler (500 or 503). */
  const handle = (action: AccessEntry['action'], work: (req: Request, res: Response, actor: Actor) => Promise<void>) => async (req: Request, res: Response) => {
    const actor = res.locals.actor as Actor
    try {
      await work(req, res, actor)
    } catch (error) {
      if (!(error instanceof Refusal)) throw error
      await ctx.db.withTransaction(null, (q) => logAccess(q, entry(req, actor, action, error.outcome, typeof error.body.patientId === 'string' ? error.body.patientId : null)))
      const { patientId: _hidden, ...body } = error.body
      res.status(error.status).json(body)
    }
  }

  const flagsOf = async (q: Queryable, id: string) =>
    (await q.query('SELECT kind, detail, reviewed_at FROM prescription_flags WHERE prescription_id = $1 ORDER BY created_at, kind', [id])).rows
      .map((f) => ({ kind: f.kind, detail: f.detail, reviewed: f.reviewed_at !== null }))

  const DETAILS = `SELECT rx.*, pa.full_name AS patient_name, pr.full_name AS prescriber_name, li.licence_number, f.name AS dispensed_at_name
    FROM prescriptions rx
    JOIN patients pa ON pa.id = rx.patient_id
    JOIN practitioners pr ON pr.id = rx.created_by
    LEFT JOIN prescriber_licences li ON li.practitioner_id = rx.created_by AND li.valid_until >= CURRENT_DATE
    LEFT JOIN facilities f ON f.id = rx.dispensed_facility_id`

  const toJson = (r: Row, flags: unknown[], withCode: boolean) => ({
    id: r.id, patient: { id: r.patient_id, name: r.patient_name },
    medication: r.medication, dose: r.dose, frequency: r.frequency, durationDays: r.duration_days, quantity: r.quantity, instructions: r.instructions ?? null,
    prescriber: { name: r.prescriber_name, licence: r.licence_number ?? null },
    status: statusNow(r), issuedAt: new Date(String(r.created_at)).toISOString(), expiresAt: new Date(String(r.expires_at)).toISOString(),
    dispensedAt: r.dispensed_at ? new Date(String(r.dispensed_at)).toISOString() : null, dispensedAtPlace: r.dispensed_at_name ?? null,
    flags,
    ...(withCode ? { code: r.verification_code, qr: qrFor(String(r.id), String(r.verification_code)) } : {}),
  })

  /**
   * A doctor or specialist issues a prescription. The id comes from the phone, so sending it twice gives back the
   * same one. It's checked here, not on the phone: consent, whether it's their patient, and the fraud checks.
   */
  app.post('/prescriptions', ...guard, handle('create', async (req, res, actor) => {
    if (!PRESCRIBERS.has(actor.role)) throw FORBIDDEN(actor.role, 'prescribe')
    const b = (req.body ?? {}) as Row
    if (typeof b.id !== 'string' || !UUID.test(b.id)) throw invalid('id', 'id must be a UUID')
    if (typeof b.patient_id !== 'string' || !UUID.test(b.patient_id)) throw invalid('patient_id', 'patient_id must be a UUID')
    const id = b.id, patient = b.patient_id
    const fields = {
      medication: text(b, 'medication'), dose: text(b, 'dose'), frequency: text(b, 'frequency'),
      duration: whole(b, 'duration_days', 365), quantity: whole(b, 'quantity', 10_000),
      instructions: b.instructions === undefined || b.instructions === null ? null : text(b, 'instructions', 500),
    }
    const result = await ctx.db.withTransaction(actor.id, async (q) => {
      let created = false
      const again = (await q.query('SELECT patient_id, medication FROM prescriptions WHERE id = $1', [id])).rows[0]
      if (again) {
        if (again.patient_id !== patient || again.medication !== fields.medication) throw new Refusal(409, { error: 'id_conflict', message: 'This id is already used by a different prescription' })
      } else {
        if (!(await canReach(q, actor, patient))) throw new Refusal(403, { error: 'forbidden', message: 'This patient has no visit with you', patientId: patient }, 'denied')
        const consent = (await q.query(
          `SELECT id FROM consents WHERE patient_id = $1 AND purpose = 'clinical_care' AND withdrawn_at IS NULL ORDER BY given_at DESC LIMIT 1`, [patient],
        )).rows[0]
        if (!consent) throw new Refusal(403, { error: 'consent_missing', message: 'This patient has not given consent for care. Ask them first', patientId: patient }, 'denied')

        // Fraud checks, against what's already there.
        const flags: [string, string][] = []
        const same = (await q.query(
          `SELECT count(*) FILTER (WHERE status = 'active' AND expires_at > now())::int AS active, count(*) FILTER (WHERE created_at > now() - interval '30 days')::int AS recent
           FROM prescriptions WHERE patient_id = $1 AND lower(medication) = lower($2)`, [patient, fields.medication],
        )).rows[0]!
        if (Number(same.active) > 0) flags.push(['duplicate', `This patient already has an unused prescription for ${fields.medication}`])
        if (Number(same.recent) + 1 >= REPEAT_LIMIT) flags.push(['repeated', `${Number(same.recent) + 1} prescriptions for ${fields.medication} in 30 days`])
        const hourly = (await q.query(`SELECT count(*)::int AS n FROM prescriptions WHERE created_by = $1 AND created_at > now() - interval '1 hour'`, [actor.id])).rows[0]!
        if (Number(hourly.n) + 1 > HOURLY_LIMIT) flags.push(['prescriber_rate', `${Number(hourly.n) + 1} prescriptions from this prescriber in an hour`])
        const licensed = (await q.query('SELECT 1 FROM prescriber_licences WHERE practitioner_id = $1 AND valid_until >= CURRENT_DATE', [actor.id])).rows.length > 0
        if (!licensed) flags.push(['unlicensed', 'This prescriber has no valid licence in the test register'])

        // ON CONFLICT with no target covers a repeat of the id and a clash of codes (one in 90 million per pair).
        let inserted = false
        for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
          inserted = (await q.query(
            `INSERT INTO prescriptions (id, patient_id, consent_id, medication, dose, frequency, duration_days, quantity, instructions, verification_code, expires_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now() + make_interval(days => $11)) ON CONFLICT DO NOTHING RETURNING id`,
            [id, patient, consent.id, fields.medication, fields.dose, fields.frequency, fields.duration, fields.quantity, fields.instructions, newCode(), VALID_DAYS],
          )).rows.length > 0
          if (!inserted && (await q.query('SELECT 1 FROM prescriptions WHERE id = $1', [id])).rows.length > 0) break // the same request, sent twice at once
        }
        created = inserted
        if (inserted) for (const [kind, detail] of flags) await q.query('INSERT INTO prescription_flags (prescription_id, kind, detail) VALUES ($1, $2, $3)', [id, kind, detail])
        await logAccess(q, entry(req, actor, 'create', 'success', patient))
      }
      const row = (await q.query(`${DETAILS} WHERE rx.id = $1`, [id])).rows[0]!
      return { created, json: toJson(row, await flagsOf(q, id), true) }
    })
    res.status(result.created ? 201 : 200).json(result.json)
  }))

  /** A pharmacist checks a code or a scanned QR. Nothing changes yet. Every try is on record, found or not. */
  app.post('/prescriptions/verify', ...guard, handle('read', async (req, res, actor) => {
    if (actor.role !== 'pharmacist') throw FORBIDDEN(actor.role, 'verify prescriptions')
    const b = (req.body ?? {}) as Row
    const code = typeof b.qr === 'string' ? readQr(b.qr) : typeof b.code === 'string' ? b.code.replace(/\s/g, '') : ''
    if (!/^\d{8,}$/.test(code)) throw invalid('code', 'The code has 8 digits')
    const found = await ctx.db.withTransaction(actor.id, async (q) => {
      const row = (await q.query(`${DETAILS} WHERE rx.verification_code = $1`, [code])).rows[0]
      if (!row) return null
      await logAccess(q, entry(req, actor, 'read', 'success', String(row.patient_id)))
      return toJson(row, await flagsOf(q, String(row.id)), false)
    })
    if (!found) throw new Refusal(404, { error: 'not_found', message: "That code isn't valid. Ask the patient to check it" }, 'not_found')
    res.json(found)
  }))

  /**
   * Hands the medicine over, once. The patient's code has to come with it, so knowing an id isn't enough. Open flags
   * must be acknowledged: a person looks before the medicine leaves. The database refuses a second dispense, even
   * two at the same moment.
   */
  app.post('/prescriptions/:id/dispense', ...guard, handle('update', async (req, res, actor) => {
    if (actor.role !== 'pharmacist') throw FORBIDDEN(actor.role, 'dispense')
    const id = String(req.params.id)
    if (!UUID.test(id)) throw invalid('id', 'The prescription id must be a UUID')
    const b = (req.body ?? {}) as Row
    const code = typeof b.code === 'string' ? b.code.replace(/\s/g, '') : ''
    const json = await ctx.db.withTransaction(actor.id, async (q) => {
      const rx = (await q.query('SELECT patient_id, verification_code FROM prescriptions WHERE id = $1', [id])).rows[0]
      if (!rx || rx.verification_code !== code) throw new Refusal(404, { error: 'not_found', message: "That code isn't valid for this prescription" }, 'not_found')
      const patientId = String(rx.patient_id)
      const open = (await flagsOf(q, id)).filter((f) => !f.reviewed)
      if (open.length && b.acknowledgeFlags !== true) throw new Refusal(409, { error: 'flags_need_review', message: 'Read these warnings first', flags: open, patientId }, 'error')
      try {
        await q.query(
          `UPDATE prescriptions SET status = 'dispensed', dispensed_by = $2, dispensed_at = now(),
             dispensed_facility_id = (SELECT facility_id FROM practitioners WHERE id = $2) WHERE id = $1`, [id, actor.id],
        )
      } catch (error) {
        const hint = (error as { hint?: string }).hint
        const said: Record<string, [string, string]> = {
          already_dispensed: ['already_dispensed', 'This prescription has already been dispensed. Do not give the medicine'],
          already_cancelled: ['cancelled', 'This prescription was cancelled. Do not give the medicine'],
          already_expired: ['expired', 'This prescription has expired. Ask for a new one'],
          expired: ['expired', 'This prescription has expired. Ask for a new one'],
        }
        const answer = hint ? said[hint] : undefined
        if (!answer) throw error
        throw new Refusal(409, { error: answer[0], message: answer[1], patientId }, 'denied')
      }
      await q.query('UPDATE prescription_flags SET reviewed_by = $2, reviewed_at = now() WHERE prescription_id = $1 AND reviewed_at IS NULL', [id, actor.id])
      await logAccess(q, entry(req, actor, 'update', 'success', patientId))
      return toJson((await q.query(`${DETAILS} WHERE rx.id = $1`, [id])).rows[0]!, await flagsOf(q, id), false)
    })
    res.json(json)
  }))

  /** Only the person who wrote it can cancel it, and only while it's still unused. */
  app.post('/prescriptions/:id/cancel', ...guard, handle('update', async (req, res, actor) => {
    const id = String(req.params.id)
    if (!UUID.test(id)) throw invalid('id', 'The prescription id must be a UUID')
    await ctx.db.withTransaction(actor.id, async (q) => {
      const rx = (await q.query('SELECT patient_id, created_by, status FROM prescriptions WHERE id = $1', [id])).rows[0]
      if (!rx) throw new Refusal(404, { error: 'not_found', message: 'Unknown prescription' }, 'not_found')
      const patientId = String(rx.patient_id)
      if (rx.created_by !== actor.id) throw new Refusal(403, { error: 'forbidden', message: 'Only the prescriber can cancel this', patientId }, 'denied')
      if (rx.status !== 'active') throw new Refusal(409, { error: `already_${String(rx.status)}`, message: `This prescription is already ${String(rx.status)}`, patientId })
      await q.query(`UPDATE prescriptions SET status = 'cancelled' WHERE id = $1`, [id])
      await logAccess(q, entry(req, actor, 'update', 'success', patientId))
    })
    res.status(204).end()
  }))

  /** A doctor's issued prescriptions, a patient's own medicines (with the code to show), a pharmacist's dispensed list. */
  app.get('/prescriptions/mine', ...guard, handle('read', async (_req, res, actor) => {
    const where = PRESCRIBERS.has(actor.role) ? ['rx.created_by = $1', actor.id]
      : actor.role === 'patient' ? ['rx.patient_id = $1', actor.patientId ?? '']
      : actor.role === 'pharmacist' ? ['rx.dispensed_by = $1', actor.id] : null
    if (!where) throw FORBIDDEN(actor.role, 'list prescriptions')
    const items = await ctx.db.withTransaction(actor.id, async (q) => {
      const { rows } = await q.query(`${DETAILS} WHERE ${where[0]} ORDER BY rx.created_at DESC LIMIT 50`, [where[1]])
      const out = []
      for (const r of rows) out.push(toJson(r, await flagsOf(q, String(r.id)), actor.role !== 'pharmacist'))
      return out
    })
    res.json(items)
  }))

  /** The sandbox pharmacy network: pharmacies we've added ourselves, not a partner's live data. */
  app.get('/pharmacies', ...guard, async (_req: Request, res: Response) => {
    const { rows } = await ctx.db.query(`SELECT id, name, region, district FROM facilities WHERE type = 'pharmacy' AND active ORDER BY region, name`)
    res.json({ mode: 'test', pharmacies: rows })
  })
}
