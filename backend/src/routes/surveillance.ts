import type { Express, Request, Response } from 'express'
import type { Ctx } from '../app.js'
import { requireActor, type Actor } from '../auth.js'
import { logger } from '../logging.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Surveillance is for public health staff. It shows totals only, never a patient (D-018). */
const VIEWERS = new Set(['ghs_official', 'admin'])
/** Confirming an outbreak is a public health decision: GHS officials only (admins can view). */
const DECIDERS = new Set(['ghs_official'])

/**
 * Disease surveillance (FB-7a, SVC-8, as a route module per D-035). The rules live in the database
 * (db/migrations/005_surveillance.sql): the outbreak rule is the `outbreak_signals` view, and only a
 * GHS official can confirm or dismiss an alert. The data is synthetic, shaped by published DHS
 * regional figures (D-034), and every answer says so.
 */
export function surveillanceRoutes(app: Express, ctx: Ctx) {
  const signedIn = requireActor(ctx.jwtKey, ctx.db)

  /** The signed-in actor if they may see surveillance; otherwise answers 403 and returns null. */
  const viewer = (res: Response): Actor | null => {
    const actor = res.locals.actor as Actor
    if (VIEWERS.has(actor.role)) return actor
    res.status(403).json({ error: 'forbidden', message: `A ${actor.role} account cannot see surveillance data` })
    return null
  }

  /** This week's totals per district and condition (the dashboard and the map). `?region=` narrows it. */
  app.get('/surveillance/summary', signedIn, async (req: Request, res: Response) => {
    if (!viewer(res)) return
    const region = typeof req.query.region === 'string' && req.query.region ? req.query.region : null
    const { rows } = await ctx.db.query(
      `SELECT region, district, condition, case_count, source = 'synthetic' AS synthetic, week_start
       FROM weekly_case_counts
       WHERE week_start = (SELECT max(week_start) FROM weekly_case_counts)
         AND ($1::text IS NULL OR region = $1)
       ORDER BY region, district, condition`,
      [region],
    )
    res.json({
      week_start: rows[0] ? isoDate(rows[0].week_start) : null,
      synthetic: rows.some((r) => r.synthetic),
      totals: rows.map(({ week_start: _w, ...r }) => r),
    })
  })

  /**
   * The alerts list. New outbreak signals become `suggested` alerts first (once each: the database
   * refuses a second alert for the same district, condition and week), so the list is always current.
   */
  app.get('/surveillance/alerts', signedIn, async (_req: Request, res: Response) => {
    const actor = viewer(res)
    if (!actor) return
    const alerts = await ctx.db.withTransaction(actor.id, async (q) => {
      await q.query(
        `INSERT INTO outbreak_alerts (region, district, condition, week_start, case_count, baseline, reason)
         SELECT region, district, condition, week_start, case_count, baseline, reason FROM outbreak_signals
         ON CONFLICT (district, condition, week_start) DO NOTHING`,
      )
      return (await q.query(
        `SELECT id, region, district, condition, week_start, case_count, baseline, reason, status,
                decided_by, decided_at, decision_note, alert_sent_at
         FROM outbreak_alerts ORDER BY week_start DESC, case_count DESC`,
      )).rows
    })
    res.json({ synthetic: true, alerts: alerts.map((a) => ({ ...a, week_start: isoDate(a.week_start), baseline: Number(a.baseline) })) })
  })

  /** The official's decision. Confirming sends the community alert, in test mode: logged, not texted. */
  app.post('/surveillance/alerts/:id/decision', signedIn, async (req: Request, res: Response) => {
    const actor = viewer(res)
    if (!actor) return
    if (!DECIDERS.has(actor.role)) {
      return void res.status(403).json({ error: 'forbidden', message: 'Only a GHS official can confirm or dismiss an outbreak' })
    }
    const id = String(req.params.id)
    const decision = req.body?.decision
    const note = typeof req.body?.note === 'string' ? req.body.note.slice(0, 500) : null
    if (!UUID.test(id)) return void res.status(400).json({ error: 'invalid_request', field: 'id', message: 'The alert id must be a UUID' })
    if (decision !== 'confirmed' && decision !== 'dismissed') {
      return void res.status(400).json({ error: 'invalid_request', field: 'decision', message: 'decision must be "confirmed" or "dismissed"' })
    }

    let alert: Record<string, unknown> | undefined
    try {
      alert = await ctx.db.withTransaction(actor.id, async (q) => (await q.query(
        `UPDATE outbreak_alerts
         SET status = $2, decided_by = $3, decided_at = now(), decision_note = $4,
             alert_sent_at = CASE WHEN $2 = 'confirmed' THEN now() END
         WHERE id = $1 AND status = 'suggested'
         RETURNING id, district, condition, week_start, case_count, status, decided_at, alert_sent_at`,
        [id, decision, actor.id, note],
      )).rows[0] ?? (
        // Nothing updated: either it doesn't exist, or it was already decided (a repeat must not re-send the alert).
        (await q.query('SELECT status FROM outbreak_alerts WHERE id = $1', [id])).rows[0]?.status
          ? { alreadyDecided: true } : undefined
      ))
    } catch (error) {
      // The database's own rules (005): a decision stands once made.
      if ((error as { code?: string }).code === '23514') {
        return void res.status(409).json({ error: 'already_decided', message: (error as Error).message })
      }
      throw error
    }
    if (!alert) return void res.status(404).json({ error: 'not_found', message: 'Unknown alert' })
    if (alert.alreadyDecided) {
      return void res.status(409).json({ error: 'already_decided', message: 'This alert was already decided and that decision stands.' })
    }

    if (alert.status === 'confirmed') {
      // Test mode: no SMS provider is connected (D-029). The log line is the evidence.
      logger.info({ alertId: alert.id, district: alert.district, condition: alert.condition, testMode: true },
        'community outbreak alert sent (test mode: logged, not texted)')
    }
    res.json({ ...alert, week_start: isoDate(alert.week_start), test_mode: true })
  })
}

/** Postgres DATE comes back as a JS Date at local midnight; send it as plain YYYY-MM-DD. */
function isoDate(value: unknown): string {
  const d = value as Date
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
