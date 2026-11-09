import type { Express, Request, Response } from 'express'
import express from 'express'
import type { Ctx } from '../app.js'
import { requireActor, type Actor } from '../auth.js'
import type { Queryable } from '../db.js'
import { logger } from '../logging.js'
import { ProviderUnavailable } from '../votex.js'
import { canReach } from './sync.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const E164 = /^\+[1-9][0-9]{7,14}$/
const NETWORKS = new Set(['mtn', 'telecel', 'airteltigo'])
/** Set here, never by the caller: otherwise anyone could pay one pesewa. Illustrative prices. */
export const CONSULTATION_FEE = 25
const SIMULATED_DELAY_MS = 3_000
const RECHECK_MS = 10_000
const SYSTEM_ID = '00000000-0000-0000-0000-000000000000'
type Row = Record<string, unknown>

export class Refusal extends Error {
  constructor(readonly status: number, readonly body: Row) { super(String(body.message)) }
}
const invalid = (field: string, message: string) => new Refusal(400, { error: 'invalid_request', field, message })

/** What's being paid for. Other modules add theirs (insurance adds the premium), each working out its own price. */
export type PaymentPurpose = (q: Queryable, actor: Actor, subjectId: string) => Promise<{ patientId: string; amount: number; description: string }>

const consultationFee: PaymentPurpose = async (q, _actor, subjectId) => {
  const visit = (await q.query('SELECT patient_id, status FROM appointments WHERE id = $1', [subjectId])).rows[0]
  if (!visit) throw new Refusal(404, { error: 'not_found', field: 'subject_id', message: 'Unknown visit' })
  if (visit.status === 'cancelled') throw new Refusal(409, { error: 'visit_cancelled', message: 'This visit was cancelled, so there is nothing to pay' })
  return { patientId: String(visit.patient_id), amount: CONSULTATION_FEE, description: 'HealthConnect consultation fee' }
}

export const toPayment = (p: Row) => ({
  id: p.id, purpose: p.purpose, subjectId: p.subject_id, patientId: p.patient_id,
  amount: Number(p.amount), currency: p.currency, network: p.network, status: p.status,
  testMode: true, simulated: p.provider === 'simulated',
  checkoutUrl: p.status === 'pending' ? p.checkout_url ?? null : null,
  createdAt: new Date(String(p.created_at)).toISOString(),
})

export function paymentRoutes(app: Express, ctx: Ctx, extraPurposes: Record<string, PaymentPurpose> = {}) {
  const purposes: Record<string, PaymentPurpose> = { consultation_fee: consultationFee, ...extraPurposes }
  const guard = requireActor(ctx.jwtKey, ctx.db)

  /** Who may pay: the patient themselves, or a health worker for one of their patients. */
  const mayPay = async (q: Queryable, actor: Actor, patientId: string) => actor.role === 'patient' ? actor.patientId === patientId : (actor.role === 'chv' || actor.role === 'nurse') && canReach(q, actor, patientId)

  /** With no provider, a payment pretends: pending for a moment, then successful. A phone ending in 0000 fails at the start, so both outcomes can be shown. */
  const settleSimulated = () => ctx.db.withTransaction(SYSTEM_ID, (q) => q.query(
    `UPDATE payments SET status = 'successful' WHERE provider = 'simulated' AND status = 'pending' AND created_at <= now() - make_interval(secs => $1)`, [SIMULATED_DELAY_MS / 1000],
  ))

  /** Falls back to asking votex365 directly, in case their webhook hasn't come. */
  async function refresh(p: Row): Promise<Row> {
    if (p.provider !== 'votex365' || p.status !== 'pending' || !p.provider_ref || !ctx.checkout) return p
    if (Date.now() - new Date(String(p.updated_at)).getTime() < RECHECK_MS) return p
    const status = await ctx.checkout.status(String(p.provider_ref)).catch(() => null)
    const { rows } = await ctx.db.withTransaction(SYSTEM_ID, (q) => q.query('UPDATE payments SET status = coalesce($2, status) WHERE id = $1 RETURNING *', [p.id, status]))
    return rows[0] ?? p
  }

  /**
   * Starts a payment. Answers with `checkoutUrl`, a votex365 page where the person approves it. The amount comes from
   * the server. The same id sent twice is the same payment; the phone number goes to votex365 and isn't stored.
   */
  app.post('/payments', guard, async (req: Request, res: Response) => {
    const actor = res.locals.actor as Actor
    const b = (req.body ?? {}) as Row
    try {
      if (typeof b.id !== 'string' || !UUID.test(b.id)) throw invalid('id', 'id must be a UUID')
      const purpose = typeof b.purpose === 'string' && Object.hasOwn(purposes, b.purpose) ? purposes[b.purpose] : undefined
      if (!purpose) throw invalid('purpose', 'purpose is not one we take payment for')
      if (typeof b.subject_id !== 'string' || !UUID.test(b.subject_id)) throw invalid('subject_id', 'subject_id must be a UUID')
      if (typeof b.network !== 'string' || !NETWORKS.has(b.network)) throw invalid('network', 'network must be mtn, telecel or airteltigo')
      if (typeof b.phone !== 'string' || !E164.test(b.phone)) throw invalid('phone', 'Phone numbers must look like +233241234567')
      const { id, subject_id: subject, network, phone } = { id: b.id, subject_id: b.subject_id, network: b.network, phone: b.phone }

      const started = await ctx.db.withTransaction(actor.id, async (q) => {
        const again = (await q.query('SELECT * FROM payments WHERE id = $1', [id])).rows[0]
        if (again) {
          if (again.created_by !== actor.id) throw new Refusal(409, { error: 'id_conflict', message: 'This id belongs to another payment' })
          return { row: again, created: false, description: '' }
        }
        const what = await purpose(q, actor, subject)
        if (!(await mayPay(q, actor, what.patientId))) throw new Refusal(403, { error: 'forbidden', message: 'You can only pay for yourself or your own patients' })
        const provider = ctx.checkout ? 'votex365' : 'simulated'
        const status = provider === 'simulated' && phone.endsWith('0000') ? 'failed' : 'pending'
        const { rows } = await q.query(
          `INSERT INTO payments (id, patient_id, purpose, subject_id, amount, network, provider, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
          [id, what.patientId, b.purpose, subject, what.amount, network, provider, status],
        )
        return { row: rows[0]!, created: true, description: what.description }
      })

      let row = started.row
      // Outside the transaction: never hold a database connection while waiting on someone else's server.
      if (row.provider === 'votex365' && row.status === 'pending' && !row.checkout_url && ctx.checkout) {
        const checkout = await ctx.checkout.create({
          reference: id, amount: Number(row.amount), description: started.description || 'HealthConnect payment',
          customer: { phone }, metadata: { paymentId: id, purpose: String(row.purpose) },
        })
        row = (await ctx.db.withTransaction(SYSTEM_ID, (q) => q.query(
          'UPDATE payments SET provider_ref = $2, checkout_url = $3, status = $4 WHERE id = $1 RETURNING *',
          [id, checkout.providerRef, checkout.checkoutUrl, checkout.status],
        ))).rows[0]!
      }
      res.status(started.created ? 201 : 200).json(toPayment(row))
    } catch (error) {
      if (error instanceof Refusal) return void res.status(error.status).json(error.body)
      if (error instanceof ProviderUnavailable) return void res.status(503).set('Retry-After', '15').json({ error: 'payments_unavailable', message: 'Payments are not available right now. Try again soon' })
      if ((error as { constraint?: string }).constraint === 'payments_one_fee_per_visit') return void res.status(409).json({ error: 'already_paid', message: 'This visit has already been paid for, or a payment is in progress' })
      throw error
    }
  })

  app.get('/payments/mine', guard, async (_req: Request, res: Response) => {
    const actor = res.locals.actor as Actor
    await settleSimulated()
    const { rows } = actor.role === 'patient'
      ? await ctx.db.query('SELECT * FROM payments WHERE patient_id = $1 ORDER BY created_at DESC LIMIT 50', [actor.patientId])
      : await ctx.db.query('SELECT * FROM payments WHERE created_by = $1 ORDER BY created_at DESC LIMIT 50', [actor.id])
    res.json(rows.map(toPayment))
  })

  app.get('/payments/:id', guard, async (req: Request, res: Response) => {
    const actor = res.locals.actor as Actor
    const id = String(req.params.id)
    if (!UUID.test(id)) return void res.status(400).json({ error: 'invalid_request', field: 'id', message: 'The payment id must be a UUID' })
    await settleSimulated()
    const p = (await ctx.db.query('SELECT * FROM payments WHERE id = $1', [id])).rows[0]
    const allowed = p && (p.created_by === actor.id || (actor.role === 'patient' && p.patient_id === actor.patientId) || actor.role === 'admin')
    // The same answer whether it doesn't exist or isn't theirs, so nobody can probe for payments.
    if (!allowed) return void res.status(404).json({ error: 'not_found', message: 'Unknown payment' })
    res.json(toPayment(await refresh(p)))
  })

  /** votex365 tells us the outcome. Only a correct signature counts; the phone's word is never enough. */
  app.post('/webhooks/votex365', async (req: Request, res: Response) => {
    if (!ctx.checkout) return void res.status(404).json({ error: 'not_found', message: 'Not found' })
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)
    let event: Awaited<ReturnType<typeof ctx.checkout.verifyWebhook>>
    try {
      event = await ctx.checkout.verifyWebhook(raw, req.headers, Date.now())
    } catch (error) {
      if (!(error instanceof ProviderUnavailable)) throw error
      return void res.status(503).json({ error: 'payments_unavailable', message: 'Not ready' }) // they retry
    }
    if (event === null) return void res.status(401).json({ error: 'invalid_signature', message: 'Webhook signature or time is not valid' })
    if (event !== 'ignored') {
      const { providerRef, reference, status } = event
      const { rows } = await ctx.db.withTransaction(SYSTEM_ID, (q) => q.query(
        `UPDATE payments SET status = $3, provider_ref = coalesce(provider_ref, $1)
         WHERE provider = 'votex365' AND status = 'pending' AND (provider_ref = $1 OR id::text = $2) RETURNING id`,
        [providerRef, reference, status],
      ))
      logger.info({ paymentId: rows[0]?.id, status }, 'votex365 webhook')
    }
    res.json({ received: true })
  })
}

/** Mounted before the JSON parser: the signature is over the exact bytes they sent. */
export const webhookBodyParser = express.raw({ type: () => true, limit: '1mb' })
