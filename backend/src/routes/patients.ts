import type { Express, Request, Response } from 'express'
import type { Ctx } from '../app.js'
import { logAccess, type AccessEntry } from '../audit.js'
import { requireActor, type Actor } from '../auth.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Roles that may open an individual patient's record. GHS officials work with anonymised totals only (D-018). */
const READERS = new Set(['chv', 'nurse', 'doctor', 'specialist', 'admin'])

/** Only what a clinician needs on screen; audit columns stay in the database. */
const PATIENT_COLUMNS = 'id, full_name, phone, date_of_birth, birth_date_estimated, gender, country_code, region, preferred_language'

export function patientRoutes(app: Express, ctx: Ctx) {
  const entry = (req: Request, accessedBy: string | null, outcome: AccessEntry['outcome']): AccessEntry => ({
    accessedBy, patientId: String(req.params.id ?? ''), resourceType: 'Patient', action: 'read', outcome, sourceIp: req.ip ?? null,
  })
  const record = (e: AccessEntry) => ctx.db.withTransaction(null, (q) => logAccess(q, e))

  /**
   * Read one patient (Lab 6 Part D). Every attempt leaves an access_log row, whatever the answer: not
   * signed in, not allowed, malformed id, unknown patient, or found. The read and its audit row share
   * one transaction, so a read that is shown was always recorded.
   */
  app.get(
    '/patients/:id',
    requireActor(ctx.jwtKey, ctx.db, (req) => record(entry(req, null, 'denied'))),
    async (req: Request, res: Response) => {
      const actor = res.locals.actor as Actor
      const id = String(req.params.id)
      if (!READERS.has(actor.role)) {
        await record(entry(req, actor.id, 'denied'))
        return void res.status(403).json({ error: 'forbidden', message: `A ${actor.role} account cannot open patient records` })
      }
      if (!UUID.test(id)) {
        await record(entry(req, actor.id, 'error'))
        return void res.status(400).json({ error: 'invalid_request', field: 'id', message: 'The patient id must be a UUID' })
      }
      const patient = await ctx.db.withTransaction(actor.id, async (q) => {
        const { rows } = await q.query(`SELECT ${PATIENT_COLUMNS} FROM patients WHERE id = $1`, [id])
        await logAccess(q, entry(req, actor.id, rows[0] ? 'success' : 'not_found'))
        return rows[0]
      })
      if (!patient) return void res.status(404).json({ error: 'not_found', message: 'Unknown patient' })
      res.json(patient)
    },
  )
}
