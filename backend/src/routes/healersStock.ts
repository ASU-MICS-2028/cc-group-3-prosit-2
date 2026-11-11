import type { Express, Request, Response } from 'express'
import type { Ctx } from '../app.js'
import { logAccess, type AccessEntry } from '../audit.js'
import { requireActor, type Actor } from '../auth.js'
import type { Queryable } from '../db.js'
import { Refusal, UUID, invalid, text } from './prescriptions.js'
import { canReach } from './sync.js'

type Row = Record<string, unknown>

const REFERRERS = new Set(['chv', 'nurse', 'doctor', 'specialist'])
const STOCK_ROLES = new Set(['pharmacist', 'health_centre_admin'])
const MAX_QUANTITY = 1_000_000
const denied = (message: string, patientId?: string) => new Refusal(403, { error: 'forbidden', message, ...(patientId ? { patientId } : {}) }, 'denied')
const need = (allowed: Set<string>, actor: Actor, doing: string) => { if (!allowed.has(actor.role)) throw denied(`A ${actor.role} account cannot ${doing}`) }

const uuid = (b: Row, field: string): string => {
  if (typeof b[field] !== 'string' || !UUID.test(b[field] as string)) throw invalid(field, `${field} must be a UUID`)
  return b[field] as string
}
const paramId = (req: Request): string => {
  const id = String(req.params.id)
  if (!UUID.test(id)) throw invalid('id', 'The id must be a UUID')
  return id
}
const count = (b: Row, field: string, min: number): number => {
  const v = b[field]
  if (!Number.isInteger(v) || (v as number) < min || (v as number) > MAX_QUANTITY) throw invalid(field, `${field} must be a whole number from ${min} to ${MAX_QUANTITY}`)
  return v as number
}
const optionalText = (b: Row, field: string, max: number): string | null => (b[field] === undefined || b[field] === null ? null : text(b, field, max))

const CONSENT_REFUSED = { error: 'consent_withdrawn', message: 'This patient withdrew their consent for a healer referral' }

/** Healer directory and consented referrals; stock, low-stock alerts and redistribution (FB-9b, SVC-13, SVC-14). */
export function healerStockRoutes(app: Express, ctx: Ctx) {
  const signedIn = requireActor(ctx.jwtKey, ctx.db)

  const entry = (req: Request, actor: Actor, action: AccessEntry['action'], outcome: AccessEntry['outcome'], patientId: string): AccessEntry => ({
    accessedBy: actor.id, patientId, resourceType: 'Referral', action, outcome, sourceIp: req.ip ?? null,
  })

  /** A refusal is answered and, if it concerns a patient, put on record. The database's own refusals become clear answers. */
  const handle = (action: AccessEntry['action'], work: (req: Request, res: Response, actor: Actor) => Promise<void>) => async (req: Request, res: Response) => {
    const actor = res.locals.actor as Actor
    try {
      await work(req, res, actor)
    } catch (error) {
      if (error instanceof Refusal) {
        const { patientId, ...body } = error.body
        if (typeof patientId === 'string') await ctx.db.withTransaction(null, (q) => logAccess(q, entry(req, actor, action, error.outcome, patientId)))
        return void res.status(error.status).json(body)
      }
      const { code, hint, message, constraint } = error as { code?: string; hint?: string; message?: string; constraint?: string }
      if (constraint === 'stock_items_quantity_check') return void res.status(409).json({ error: 'insufficient_stock', message: 'There is not that much in stock to move' })
      if (hint === 'consent_withdrawn') return void res.status(403).json(CONSENT_REFUSED)
      if (code?.startsWith('23')) return void res.status(422).json({ error: 'refused', message })
      throw error
    }
  }

  /* ---------------- Healer directory ---------------- */

  /** Synthetic entries from the seed script, labelled so here and in the app. Not a register of certified healers. */
  app.get('/healers', signedIn, handle('read', async (_req, res, actor) => {
    if (!REFERRERS.has(actor.role) && actor.role !== 'traditional_healer') throw denied(`A ${actor.role} account cannot see the healer directory`)
    const { rows } = await ctx.db.query(
      `SELECT id, full_name AS name, community, practice FROM practitioners WHERE role = 'traditional_healer' AND active ORDER BY full_name LIMIT 200`)
    res.json({ synthetic: true, healers: rows })
  }))

  /* ---------------- Referrals ---------------- */

  const REFERRAL = `SELECT r.id, r.patient_id, pa.full_name AS patient_name, r.reason, r.status, r.remedies, r.created_at, r.created_by,
      f.full_name AS from_name, f.role AS from_role, t.id AS to_id, t.full_name AS to_name, t.role AS to_role, c.withdrawn_at
    FROM referrals r
    JOIN patients pa ON pa.id = r.patient_id
    JOIN practitioners f ON f.id = r.created_by
    JOIN practitioners t ON t.id = r.to_practitioner_id
    JOIN consents c ON c.id = r.consent_id
    WHERE (t.role = 'traditional_healer' OR f.role = 'traditional_healer')`

  // A healer gets a name and the reason: nothing else from the record.
  const referralJson = (r: Row) => ({
    id: r.id, patient: { id: r.patient_id, name: r.patient_name }, reason: r.reason, status: r.status, remedies: r.remedies ?? null,
    from: { id: r.created_by, name: r.from_name }, to: { id: r.to_id, name: r.to_name },
    direction: r.to_role === 'traditional_healer' ? 'to_healer' : 'from_healer', createdAt: new Date(String(r.created_at)).toISOString(),
  })

  /** A carer sends a patient to a healer. Refused unless a healer_referral consent is on record and still stands. */
  app.post('/healer-referrals', signedIn, handle('create', async (req, res, actor) => {
    need(REFERRERS, actor, 'refer to a healer')
    const b = (req.body ?? {}) as Row
    const id = uuid(b, 'id'), patient = uuid(b, 'patient_id'), healer = uuid(b, 'healer_id')
    const reason = text(b, 'reason', 500)
    const created = await ctx.db.withTransaction(actor.id, async (q) => {
      const again = (await q.query('SELECT patient_id, to_practitioner_id, created_by FROM referrals WHERE id = $1', [id])).rows[0]
      if (again) {
        if (again.patient_id !== patient || again.to_practitioner_id !== healer || again.created_by !== actor.id) throw new Refusal(409, { error: 'id_conflict', message: 'This id is already used by a different referral' })
        return false
      }
      if (!(await canReach(q, actor, patient))) throw denied('This patient is not one of yours', patient)
      const found = (await q.query(`SELECT 1 FROM practitioners WHERE id = $1 AND role = 'traditional_healer' AND active`, [healer])).rows[0]
      if (!found) throw new Refusal(404, { error: 'not_found', message: 'That healer is not in the directory' }, 'not_found')
      const consents = (await q.query(`SELECT id, withdrawn_at FROM consents WHERE patient_id = $1 AND purpose = 'healer_referral' ORDER BY given_at DESC`, [patient])).rows
      const active = consents.find((c) => c.withdrawn_at === null)
      if (!active) {
        throw new Refusal(403, consents.length > 0
          ? { ...CONSENT_REFUSED, patientId: patient }
          : { error: 'consent_missing', message: 'This patient has not agreed to a healer referral. Ask them first', patientId: patient }, 'denied')
      }
      await q.query(
        `INSERT INTO referrals (id, patient_id, consent_id, to_practitioner_id, reason, priority) VALUES ($1, $2, $3, $4, $5, 'routine') ON CONFLICT (id) DO NOTHING`,
        [id, patient, active.id, healer, reason],
      )
      await logAccess(q, entry(req, actor, 'create', 'success', patient))
      return true
    })
    const row = (await ctx.db.query(`${REFERRAL} AND r.id = $1`, [id])).rows[0]!
    res.status(created ? 201 : 200).json(referralJson(row))
  }))

  /** What I sent and what I received. A withdrawn consent takes the referral off both lists at once. */
  app.get('/healer-referrals/mine', signedIn, handle('read', async (req, res, actor) => {
    if (!REFERRERS.has(actor.role) && actor.role !== 'traditional_healer') throw denied(`A ${actor.role} account cannot see healer referrals`)
    const items = await ctx.db.withTransaction(actor.id, async (q) => {
      const { rows } = await q.query(`${REFERRAL} AND (r.created_by = $1 OR r.to_practitioner_id = $1) AND c.withdrawn_at IS NULL ORDER BY r.created_at DESC LIMIT 100`, [actor.id])
      for (const patient of new Set(rows.map((r) => r.patient_id as string))) await logAccess(q, entry(req, actor, 'read', 'success', patient))
      return rows.map(referralJson)
    })
    res.json(items)
  }))

  const mineToAnswer = async (q: Queryable, id: string, actor: Actor) => {
    const row = (await q.query(`${REFERRAL} AND r.id = $1 FOR UPDATE OF r`, [id])).rows[0]
    if (!row || row.to_id !== actor.id) throw new Refusal(404, { error: 'not_found', message: 'That referral is not addressed to you' }, 'not_found')
    if (row.withdrawn_at !== null) throw new Refusal(403, { ...CONSENT_REFUSED, patientId: String(row.patient_id) }, 'denied')
    return row
  }

  const NEXT: Record<string, string[]> = { pending: ['accepted', 'declined'], accepted: ['completed'] }

  /** The healer accepts, declines or finishes a referral addressed to them, and may note remedies in use. */
  app.post('/healer-referrals/:id/status', signedIn, handle('update', async (req, res, actor) => {
    if (actor.role !== 'traditional_healer') throw denied(`A ${actor.role} account cannot answer a healer referral`)
    const id = paramId(req)
    const b = (req.body ?? {}) as Row
    const status = text(b, 'status', 20)
    const remedies = optionalText(b, 'remedies', 500)
    const row = await ctx.db.withTransaction(actor.id, async (q) => {
      const r = await mineToAnswer(q, id, actor)
      if (!NEXT[String(r.status)]?.includes(status)) throw new Refusal(409, { error: 'bad_status', message: `A ${String(r.status)} referral cannot become ${status}`, patientId: String(r.patient_id) })
      await q.query('UPDATE referrals SET status = $2, remedies = coalesce($3, remedies) WHERE id = $1', [id, status, remedies])
      await logAccess(q, entry(req, actor, 'update', 'success', String(r.patient_id)))
      return (await q.query(`${REFERRAL} AND r.id = $1`, [id])).rows[0]!
    })
    res.json(referralJson(row))
  }))

  /** Two-way: the healer sends the patient back to whoever referred them, under the same consent. */
  app.post('/healer-referrals/:id/refer-back', signedIn, handle('create', async (req, res, actor) => {
    if (actor.role !== 'traditional_healer') throw denied(`A ${actor.role} account cannot refer back`)
    const referral = paramId(req)
    const b = (req.body ?? {}) as Row
    const id = uuid(b, 'id')
    const reason = text(b, 'reason', 500)
    const row = await ctx.db.withTransaction(actor.id, async (q) => {
      const r = await mineToAnswer(q, referral, actor)
      if (!['accepted', 'completed'].includes(String(r.status))) throw new Refusal(409, { error: 'bad_status', message: 'Accept the referral before referring back', patientId: String(r.patient_id) })
      await q.query(
        `INSERT INTO referrals (id, patient_id, consent_id, to_practitioner_id, reason, priority)
         SELECT $1, patient_id, consent_id, created_by, $2, 'routine' FROM referrals WHERE id = $3 ON CONFLICT (id) DO NOTHING`, [id, reason, referral],
      )
      await logAccess(q, entry(req, actor, 'create', 'success', String(r.patient_id)))
      return (await q.query(`${REFERRAL} AND r.id = $1`, [id])).rows[0]!
    })
    res.status(201).json(referralJson(row))
  }))

  /* ---------------- Stock ---------------- */

  /** The one facility this person runs stock for. Never taken from the request. */
  const facilityOf = async (q: Queryable, actor: Actor): Promise<{ id: string; name: string }> => {
    need(STOCK_ROLES, actor, 'manage stock')
    const row = (await q.query(
      `SELECT f.id, f.name FROM practitioners p JOIN facilities f ON f.id = p.facility_id AND f.active WHERE p.id = $1`, [actor.id])).rows[0]
    if (!row) throw new Refusal(409, { error: 'no_facility', message: 'This account is not linked to a facility, so it has no stock to manage' })
    return { id: String(row.id), name: String(row.name) }
  }

  const itemJson = (r: Row) => ({
    id: r.id, name: r.name, unit: r.unit, quantity: r.quantity, reorderLevel: r.reorder_level,
    low: Number(r.quantity) <= Number(r.reorder_level),
  })

  const TRANSFER = `SELECT t.*, s.name AS from_name, d.name AS to_name, p.full_name AS moved_by
    FROM stock_transfers t JOIN facilities s ON s.id = t.from_facility_id JOIN facilities d ON d.id = t.to_facility_id JOIN practitioners p ON p.id = t.created_by`
  const transferJson = (r: Row) => ({
    id: r.id, item: r.item_name, unit: r.unit, quantity: r.quantity,
    from: { id: r.from_facility_id, name: r.from_name }, to: { id: r.to_facility_id, name: r.to_name },
    movedBy: r.moved_by, at: new Date(String(r.created_at)).toISOString(),
  })

  /** Levels at my facility, flags for what is low, where else it's short, and the moves in and out. */
  app.get('/stock', signedIn, handle('read', async (_req, res, actor) => {
    res.json(await ctx.db.withTransaction(actor.id, async (q) => {
      const facility = await facilityOf(q, actor)
      const items = (await q.query('SELECT * FROM stock_items WHERE facility_id = $1 AND active ORDER BY name LIMIT 500', [facility.id])).rows
      const others = (await q.query('SELECT id, name FROM facilities WHERE active AND id <> $1 ORDER BY name LIMIT 200', [facility.id])).rows
      const short = (await q.query(
        `SELECT s.facility_id, f.name AS facility, s.name, s.quantity, s.unit FROM stock_items s JOIN facilities f ON f.id = s.facility_id
         WHERE s.active AND f.active AND s.facility_id <> $1 AND s.quantity <= s.reorder_level
           AND s.name IN (SELECT name FROM stock_items WHERE facility_id = $1 AND active) ORDER BY s.name LIMIT 100`, [facility.id])).rows
      const transfers = (await q.query(`${TRANSFER} WHERE $1 IN (t.from_facility_id, t.to_facility_id) ORDER BY t.created_at DESC LIMIT 50`, [facility.id])).rows
      return {
        synthetic: true, facility, items: items.map(itemJson), facilities: others,
        lowElsewhere: short.map((s) => ({ facilityId: s.facility_id, facility: s.facility, item: s.name, quantity: s.quantity, unit: s.unit })),
        transfers: transfers.map(transferJson),
      }
    }))
  }))

  /** Adds an item, or records a stock take: the level counted now, so sending it twice is harmless. */
  app.post('/stock', signedIn, handle('update', async (req, res, actor) => {
    const b = (req.body ?? {}) as Row
    const name = text(b, 'name', 100), unit = text(b, 'unit', 30)
    const quantity = count(b, 'quantity', 0), reorderLevel = count(b, 'reorder_level', 0)
    const row = await ctx.db.withTransaction(actor.id, async (q) => {
      const facility = await facilityOf(q, actor)
      return (await q.query(
        `INSERT INTO stock_items (facility_id, name, unit, quantity, reorder_level) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (facility_id, name) DO UPDATE SET quantity = EXCLUDED.quantity, reorder_level = EXCLUDED.reorder_level, active = true RETURNING *`,
        [facility.id, name, unit, quantity, reorderLevel])).rows[0]!
    })
    res.json(itemJson(row))
  }))

  /** Moves stock out of my facility, to another. The id comes from the phone, so a retry can't move it twice. */
  app.post('/stock/transfers', signedIn, handle('create', async (req, res, actor) => {
    const b = (req.body ?? {}) as Row
    const id = uuid(b, 'id'), itemId = uuid(b, 'item_id'), to = uuid(b, 'to_facility_id')
    const quantity = count(b, 'quantity', 1)
    const result = await ctx.db.withTransaction(actor.id, async (q) => {
      const facility = await facilityOf(q, actor)
      const item = (await q.query('SELECT name, unit FROM stock_items WHERE id = $1 AND facility_id = $2', [itemId, facility.id])).rows[0]
      if (!item) throw new Refusal(404, { error: 'not_found', message: 'That item is not at your facility' }, 'not_found')
      if (to === facility.id) throw invalid('to_facility_id', 'Choose a different facility')
      if (!(await q.query('SELECT 1 FROM facilities WHERE id = $1 AND active', [to])).rows[0]) throw new Refusal(404, { error: 'not_found', message: 'That facility was not found' }, 'not_found')
      const fresh = (await q.query(
        `INSERT INTO stock_transfers (id, from_facility_id, to_facility_id, item_name, unit, quantity) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING RETURNING id`,
        [id, facility.id, to, item.name, item.unit, quantity])).rows.length > 0
      const row = (await q.query(`${TRANSFER} WHERE t.id = $1`, [id])).rows[0]!
      if (!fresh && (row.from_facility_id !== facility.id || row.to_facility_id !== to || row.item_name !== item.name || row.quantity !== quantity)) {
        throw new Refusal(409, { error: 'id_conflict', message: 'This id is already used by a different transfer' })
      }
      return { fresh, json: transferJson(row) }
    })
    res.status(result.fresh ? 201 : 200).json(result.json)
  }))
}
