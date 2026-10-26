import type { Express, Request, Response } from 'express'
import type { Ctx } from '../app.js'
import { logAccess, type AccessEntry } from '../audit.js'
import { requireActor, type Actor } from '../auth.js'
import { logger } from '../logging.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Roles that may book. GHS officials see aggregates only; the system account never books. */
const BOOKERS = new Set(['chv', 'nurse', 'doctor', 'specialist', 'admin'])

class Refusal extends Error {
  constructor(readonly status: number, readonly body: Record<string, unknown>, readonly outcome: AccessEntry['outcome']) {
    super(String(body.message))
  }
}
const invalid = (field: string, message: string) => new Refusal(400, { error: 'invalid_request', field, message }, 'error')

interface Booking {
  id: string
  patient_id: string
  specialist_id: string
  starts_at: string
  ends_at: string | null
}

function readBooking(body: unknown): Booking {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  for (const field of ['id', 'patient_id', 'specialist_id'] as const) {
    if (typeof b[field] !== 'string' || !UUID.test(b[field] as string)) throw invalid(field, `${field} must be a UUID`)
  }
  const when = (field: 'starts_at' | 'ends_at') => {
    const v = b[field]
    if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) throw invalid(field, `${field} must be a date-time, e.g. 2026-11-02T10:00:00Z`)
    return new Date(v).toISOString()
  }
  const starts_at = when('starts_at')
  const ends_at = b.ends_at === undefined || b.ends_at === null ? null : when('ends_at')
  if (ends_at && ends_at <= starts_at) throw invalid('ends_at', 'ends_at must be after starts_at')
  return { id: b.id as string, patient_id: b.patient_id as string, specialist_id: b.specialist_id as string, starts_at, ends_at }
}

/** Turns the database's refusals into answers the caller can act on (never a bare 500). */
function fromDatabase(error: unknown): Refusal | null {
  const { code, constraint } = error as { code?: string; constraint?: string }
  if (code === '23P01') return new Refusal(409, { error: 'double_booked', message: 'The specialist already has a booked appointment at that time' }, 'error')
  if (code === '23503' && constraint?.includes('patient')) return new Refusal(404, { error: 'not_found', field: 'patient_id', message: 'Unknown patient' }, 'not_found')
  if (code === '23503' && constraint?.includes('specialist')) return new Refusal(400, { error: 'invalid_request', field: 'specialist_id', message: 'Unknown specialist' }, 'error')
  if (code === '23514') return new Refusal(400, { error: 'invalid_request', message: 'The appointment times are not valid' }, 'error')
  return null
}

const toJson = (r: Record<string, unknown>) => ({
  id: r.id, patient_id: r.patient_id, specialist_id: r.specialist_id, status: r.status,
  starts_at: new Date(r.starts_at as string).toISOString(), ends_at: new Date(r.ends_at as string).toISOString(),
})

export function appointmentRoutes(app: Express, ctx: Ctx) {
  /**
   * Book an appointment (Lab 7 Part A). Saves it and its audit row in one transaction as the signed-in
   * practitioner, then publishes `appointment.created`. The id comes from the client (offline phones
   * retry), so repeating the same request returns the same appointment instead of a duplicate.
   */
  app.post('/appointments', requireActor(ctx.jwtKey, ctx.db), async (req: Request, res: Response) => {
    const actor = res.locals.actor as Actor
    const audit = (outcome: AccessEntry['outcome'], patientId: string | null): AccessEntry => ({
      accessedBy: actor.id, patientId, resourceType: 'Appointment', action: 'create', outcome, sourceIp: req.ip ?? null,
    })
    const patientGuess = typeof req.body?.patient_id === 'string' ? req.body.patient_id : null

    let booking: Booking
    let saved: { row: Record<string, unknown>; replay: boolean; phone: string | null }
    try {
      if (!BOOKERS.has(actor.role)) throw new Refusal(403, { error: 'forbidden', message: `A ${actor.role} account cannot book appointments` }, 'denied')
      booking = readBooking(req.body)
      saved = await ctx.db.withTransaction(actor.id, async (q) => {
        const spec = await q.query('SELECT role FROM practitioners WHERE id = $1 AND active', [booking.specialist_id])
        const role = spec.rows[0]?.role
        if (role !== 'specialist' && role !== 'doctor') throw invalid('specialist_id', 'specialist_id is not an active specialist or doctor')

        const inserted = await q.query(
          `INSERT INTO appointments (id, patient_id, specialist_id, starts_at, ends_at)
           VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING RETURNING *`,
          [booking.id, booking.patient_id, booking.specialist_id, booking.starts_at, booking.ends_at],
        )
        let row = inserted.rows[0]
        const replay = !row
        if (replay) {
          row = (await q.query('SELECT * FROM appointments WHERE id = $1', [booking.id])).rows[0]!
          const same = row.patient_id === booking.patient_id && row.specialist_id === booking.specialist_id &&
            new Date(row.starts_at as string).toISOString() === booking.starts_at
          if (!same) throw new Refusal(409, { error: 'id_conflict', message: 'This id is already used by a different appointment' }, 'error')
        }

        // Reminders go by SMS only with consent for that purpose (D-014): no consent, no phone in the event.
        const phone = await q.query(
          `SELECT p.phone FROM patients p WHERE p.id = $1 AND p.phone IS NOT NULL AND EXISTS (
             SELECT 1 FROM consents c WHERE c.patient_id = p.id AND c.purpose = 'appointment_reminders' AND c.withdrawn_at IS NULL)`,
          [booking.patient_id],
        )
        await logAccess(q, audit('success', booking.patient_id))
        return { row: row!, replay, phone: (phone.rows[0]?.phone as string | undefined) ?? null }
      })
    } catch (error) {
      const refusal = error instanceof Refusal ? error : fromDatabase(error)
      if (!refusal) throw error // a real fault: the error handler answers 500
      await ctx.db.withTransaction(null, (q) => logAccess(q, audit(refusal.outcome, patientGuess)))
      return void res.status(refusal.status).json(refusal.body)
    }

    // Published after COMMIT, so listeners never hear about an appointment that was rolled back. If SNS
    // fails, the appointment is still booked; the caller is told, and can retry (it's idempotent).
    const appointment = toJson(saved.row)
    let event: 'published' | 'not_published' = 'published'
    try {
      await ctx.events.publish('appointment.created', {
        appointmentId: appointment.id, patientId: appointment.patient_id, specialistId: appointment.specialist_id,
        startsAt: appointment.starts_at, endsAt: appointment.ends_at, patientPhone: saved.phone,
      })
    } catch (error) {
      event = 'not_published'
      logger.error({ err: error, appointmentId: appointment.id }, 'appointment saved but appointment.created was not published')
    }
    res.status(saved.replay ? 200 : 201).json({ ...appointment, event })
  })
}
