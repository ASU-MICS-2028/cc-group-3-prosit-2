import type { Express, Request, Response } from 'express'
import type { Ctx } from '../app.js'
import { requireActor, type Actor } from '../auth.js'
import { appRole } from '../roles.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const OUTCOMES = new Set(['success', 'denied', 'not_found', 'error'])
const PAGE = 50

/**
 * The platform admin's view: who has access, who did what, and what came in. Nothing here shows a health record:
 * the audit view gives who, what kind of record, and the outcome, and a patient only as an id.
 */
export function adminRoutes(app: Express, ctx: Ctx) {
  const guard = requireActor(ctx.jwtKey, ctx.db)
  const onlyAdmin = (res: Response) => {
    const actor = res.locals.actor as Actor
    if (actor.role === 'admin') return actor
    res.status(403).json({ error: 'forbidden', message: `A ${actor.role} account cannot open the admin area` })
    return null
  }

  app.get('/admin/users', guard, async (_req: Request, res: Response) => {
    if (!onlyAdmin(res)) return
    const { rows } = await ctx.db.query(
      `SELECT p.id, p.full_name, p.role, p.active, COALESCE(f.name, p.facility) AS facility, c.username, c.locked_until > now() AS locked,
              (SELECT max(occurred_at) FROM login_events e WHERE e.practitioner_id = p.id AND e.outcome = 'success') AS last_sign_in
       FROM practitioners p
       LEFT JOIN facilities f ON f.id = p.facility_id
       LEFT JOIN practitioner_credentials c ON c.practitioner_id = p.id
       WHERE p.role <> 'system' ORDER BY p.full_name LIMIT 500`,
    )
    res.json(rows.map((r) => ({
      id: r.id, name: r.full_name, role: appRole(String(r.role)), databaseRole: r.role, active: r.active, facility: r.facility ?? null,
      username: r.username ?? null, locked: r.locked === true, lastSignIn: r.last_sign_in ? new Date(String(r.last_sign_in)).toISOString() : null,
    })))
  })

  /** Takes effect at once, because every request checks the account. Their refresh tokens end too. */
  const setActive = (active: boolean) => async (req: Request, res: Response) => {
    const actor = onlyAdmin(res)
    if (!actor) return
    const id = String(req.params.id)
    if (!UUID.test(id)) return void res.status(400).json({ error: 'invalid_request', field: 'id', message: 'The user id must be a UUID' })
    if (id === actor.id) return void res.status(409).json({ error: 'not_yourself', message: 'You cannot switch off your own account' })
    const found = await ctx.db.withTransaction(actor.id, async (q) => {
      const { rows } = await q.query(`UPDATE practitioners SET active = $2 WHERE id = $1 AND role <> 'system' RETURNING id`, [id, active])
      if (rows[0] && !active) await q.query('UPDATE refresh_tokens SET used_at = now() WHERE practitioner_id = $1 AND used_at IS NULL', [id])
      return rows.length > 0
    })
    if (!found) return void res.status(404).json({ error: 'not_found', message: 'Unknown user' })
    res.status(204).end()
  }
  app.post('/admin/users/:id/deactivate', guard, setActive(false))
  app.post('/admin/users/:id/activate', guard, setActive(true))

  /** Who touched what, newest first. `before` is the time of the last row on the previous page. */
  app.get('/admin/audit', guard, async (req: Request, res: Response) => {
    if (!onlyAdmin(res)) return
    const { outcome, before } = req.query
    if (outcome !== undefined && (typeof outcome !== 'string' || !OUTCOMES.has(outcome))) return void res.status(400).json({ error: 'invalid_request', field: 'outcome', message: 'outcome must be success, denied, not_found or error' })
    if (before !== undefined && (typeof before !== 'string' || Number.isNaN(Date.parse(before)))) return void res.status(400).json({ error: 'invalid_request', field: 'before', message: 'before must be a date-time' })
    const { rows } = await ctx.db.query(
      `SELECT a.id, a.accessed_at, a.resource_type, a.action, a.outcome, a.patient_id, a.source_ip, p.full_name, p.role
       FROM access_log a LEFT JOIN practitioners p ON p.id = a.accessed_by
       WHERE ($1::text IS NULL OR a.outcome = $1) AND ($2::timestamptz IS NULL OR a.accessed_at < $2)
       ORDER BY a.accessed_at DESC, a.id LIMIT $3`,
      [outcome ?? null, before ? new Date(String(before)).toISOString() : null, PAGE],
    )
    const signIns = await ctx.db.query(
      `SELECT outcome, count(*)::int AS n FROM login_events WHERE occurred_at > now() - interval '7 days' GROUP BY outcome ORDER BY outcome`,
    )
    res.json({
      items: rows.map((r) => ({
        id: r.id, at: new Date(String(r.accessed_at)).toISOString(), who: r.full_name ?? 'Not signed in', role: r.role ? appRole(String(r.role)) : null,
        resourceType: r.resource_type, action: r.action, outcome: r.outcome, patientId: r.patient_id ?? null, sourceIp: r.source_ip ?? null,
      })),
      signInsLast7Days: signIns.rows,
    })
  })

  /** Only payments that succeeded count. Simulated money is kept apart, so it can never pass as real income. */
  app.get('/admin/revenue', guard, async (_req: Request, res: Response) => {
    if (!onlyAdmin(res)) return
    const { rows } = await ctx.db.query(
      `SELECT purpose, provider, count(*)::int AS payments, sum(amount)::float AS total
       FROM payments WHERE status = 'successful' GROUP BY purpose, provider ORDER BY purpose, provider`,
    )
    const pending = (await ctx.db.query(`SELECT count(*)::int AS n FROM payments WHERE status = 'pending'`)).rows[0]!.n
    res.json({ currency: 'GHS', lines: rows.map((r) => ({ purpose: r.purpose, simulated: r.provider === 'simulated', payments: r.payments, total: r.total })), pending })
  })
}
