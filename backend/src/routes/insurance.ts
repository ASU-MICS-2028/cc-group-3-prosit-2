import type { Express, Request, Response } from 'express'
import { rateLimit } from 'express-rate-limit'
import type { Ctx } from '../app.js'
import { requireActor, type Actor } from '../auth.js'
import { Refusal, type PaymentPurpose } from './payments.js'

type Row = Record<string, unknown>

/** A premium costs what the enrolment's plan costs now; the caller has no say in it. */
export const insurancePremium: PaymentPurpose = async (q, _actor, subjectId) => {
  const e = (await q.query(
    `SELECT e.patient_id, p.monthly_premium, p.name FROM insurance_enrolments e JOIN insurance_plans p ON p.id = e.plan_id WHERE e.id = $1`, [subjectId],
  )).rows[0]
  if (!e) throw new Refusal(404, { error: 'not_found', field: 'subject_id', message: 'Unknown enrolment' })
  return { patientId: String(e.patient_id), amount: Number(e.monthly_premium), description: `HealthConnect premium: ${String(e.name)}` }
}

/** A pretend NHIS: we have no access to the real one. Same rule as the app's Test mode. */
export function sandboxNhis(memberNumber: string): 'active' | 'expired' | 'not_found' | null {
  const digits = memberNumber.replace(/\s/g, '')
  if (!/^\d{8}$/.test(digits)) return null
  return digits.endsWith('0') ? 'expired' : digits.endsWith('9') ? 'not_found' : 'active'
}

const toPlan = (p: Row) => ({ id: p.id, name: p.name, monthlyPremium: Number(p.monthly_premium), covers: p.covers })
const toEnrolment = (e: Row) => ({ id: e.id, planId: e.plan_id, since: new Date(String(e.since)).toISOString() })

export function insuranceRoutes(app: Express, ctx: Ctx) {
  const limit = rateLimit({
    windowMs: 60_000, limit: ctx.authRatePerMinute ?? 60, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'too_many_requests', message: 'Too many tries. Wait a minute and try again' },
  })
  const guard = [limit, requireActor(ctx.jwtKey, ctx.db)]
  /** Insurance is the patient's own: the id comes from their login, never from the request. */
  const ownPatient = (res: Response) => {
    const actor = res.locals.actor as Actor
    if (actor.role === 'patient' && actor.patientId) return { actor, patientId: actor.patientId }
    res.status(403).json({ error: 'forbidden', message: 'Only a patient can manage their own insurance' })
    return null
  }

  app.get('/insurance/plans', guard, async (_req: Request, res: Response) => {
    const { rows } = await ctx.db.query('SELECT * FROM insurance_plans ORDER BY monthly_premium')
    res.json(rows.map(toPlan))
  })

  app.get('/insurance/mine', guard, async (_req: Request, res: Response) => {
    const me = ownPatient(res)
    if (!me) return
    const e = (await ctx.db.query('SELECT * FROM insurance_enrolments WHERE patient_id = $1', [me.patientId])).rows[0]
    res.json(e ? toEnrolment(e) : null)
  })

  /** Joins a plan, or changes to it. Joining the plan you're already on changes nothing. */
  app.post('/insurance/enrol', guard, async (req: Request, res: Response) => {
    const me = ownPatient(res)
    if (!me) return
    const planId = (req.body as Row | undefined)?.plan_id
    if (typeof planId !== 'string') return void res.status(400).json({ error: 'invalid_request', field: 'plan_id', message: 'plan_id is required' })
    const row = await ctx.db.withTransaction(me.actor.id, async (q) => {
      if (!(await q.query('SELECT 1 FROM insurance_plans WHERE id = $1', [planId])).rows[0]) return null
      const { rows } = await q.query(
        `INSERT INTO insurance_enrolments (id, patient_id, plan_id) VALUES (gen_random_uuid(), $1, $2)
         ON CONFLICT (patient_id) DO UPDATE SET plan_id = EXCLUDED.plan_id WHERE insurance_enrolments.plan_id <> EXCLUDED.plan_id
         RETURNING *`, [me.patientId, planId],
      )
      return rows[0] ?? (await q.query('SELECT * FROM insurance_enrolments WHERE patient_id = $1', [me.patientId])).rows[0]!
    })
    if (!row) return void res.status(404).json({ error: 'not_found', field: 'plan_id', message: "That plan isn't available." })
    res.json(toEnrolment(row))
  })

  /** The number is checked and forgotten: nothing here needs it stored (Act 843, data minimisation). */
  app.post('/insurance/nhis-check', guard, (req: Request, res: Response) => {
    if (!ownPatient(res)) return
    const number = (req.body as Row | undefined)?.member_number
    const status = typeof number === 'string' ? sandboxNhis(number) : null
    if (!status) return void res.status(400).json({ error: 'invalid_request', field: 'member_number', message: 'An NHIS test number has 8 digits.' })
    res.json({ status, checkedAt: new Date().toISOString(), mode: 'sandbox' })
  })
}
