import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { signToken, signingKey } from '../src/auth.js'
import type { Db } from '../src/db.js'
import { SYSTEM_ID, TEST_DATABASE_URL, freshDatabase } from './pg.js'

const key = signingKey('test-secret-that-is-long-enough-32+chars')!

describe.skipIf(!TEST_DATABASE_URL)('POST /appointments', () => {
  let db: Db
  let drop: () => Promise<void>
  let url: string
  let close: () => void
  const sent: { type: string; payload: Record<string, unknown> }[] = []
  let snsDown = false
  const ids = { chv: randomUUID(), specialist: randomUUID(), other: randomUUID(), official: randomUUID(), consenting: randomUUID(), silent: randomUUID() }
  let chvToken: string

  beforeAll(async () => {
    ;({ db, drop } = await freshDatabase())
    await db.withTransaction(SYSTEM_ID, async (q) => {
      const staff = (id: string, name: string, role: string) => q.query('INSERT INTO practitioners (id, full_name, role) VALUES ($1, $2, $3)', [id, name, role])
      await staff(ids.chv, 'CHV Kofi', 'chv')
      await staff(ids.specialist, 'Dr Eshun', 'specialist')
      await staff(ids.other, 'Dr Owusu', 'specialist')
      await staff(ids.official, 'GHS Officer', 'ghs_official')
      await q.query(`INSERT INTO patients (id, full_name, phone) VALUES ($1, 'Ama Test', '+233200000001'), ($2, 'Yaw Test', '+233200000002')`, [ids.consenting, ids.silent])
      await q.query(`INSERT INTO consents (patient_id, purpose, given_by, recorded_by, given_at) VALUES ($1, 'appointment_reminders', 'patient', $2, now())`, [ids.consenting, SYSTEM_ID])
    })
    chvToken = await signToken(key, ids.chv)
    const events = { publish: async (type: string, payload: Record<string, unknown>) => {
      if (snsDown) throw new Error('SNS unavailable')
      sent.push({ type, payload })
    } }
    const server = createApp({ db, instanceId: 'test', jwtKey: key, events }).listen(0)
    await new Promise((r) => server.once('listening', r))
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    close = () => server.close()
  })
  afterAll(async () => {
    close?.()
    await drop?.()
  })
  beforeEach(() => {
    sent.length = 0
    snsDown = false
  })

  let hour = 8
  /** A fresh, non-overlapping slot for each booking. */
  const slot = () => `2026-11-${String(2 + Math.floor(hour / 24)).padStart(2, '0')}T${String(hour++ % 24).padStart(2, '0')}:00:00Z`
  const book = (body: unknown, token: string | null = chvToken, raw?: string) =>
    fetch(`${url}/appointments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: raw ?? JSON.stringify(body),
    })
  const booking = (over: Record<string, unknown> = {}) => ({ id: randomUUID(), patient_id: ids.consenting, specialist_id: ids.specialist, starts_at: slot(), ...over })
  const auditRows = (outcome: string) =>
    db.query(`SELECT count(*)::int AS n FROM access_log WHERE resource_type = 'Appointment' AND outcome = $1`, [outcome]).then((r) => r.rows[0]?.n as number)

  it('books it as the signed-in CHV, audits it, and publishes one event with the phone (consent given)', async () => {
    const before = await auditRows('success')
    const b = booking()
    const res = await book(b)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body).toMatchObject({ id: b.id, status: 'booked', event: 'published' })
    expect(Date.parse(body.ends_at) - Date.parse(body.starts_at)).toBe(30 * 60_000) // default length (D-017)
    const { rows } = await db.query('SELECT created_by FROM appointments WHERE id = $1', [b.id])
    expect(rows[0]?.created_by).toBe(ids.chv)
    expect(await auditRows('success')).toBe(before + 1)
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ type: 'appointment.created', payload: { appointmentId: b.id, patientPhone: '+233200000001' } })
    // Contract with the Lambda functions: the published message has exactly the fields they are tested against.
    const contract = JSON.parse(readFileSync(new URL('../../functions/fixtures/appointment-created.json', import.meta.url), 'utf8'))
    expect(Object.keys({ type: sent[0]!.type, ...sent[0]!.payload }).sort()).toEqual(Object.keys(contract).sort())
  })

  it('leaves the phone out of the event when the patient has not consented to reminders', async () => {
    expect((await book(booking({ patient_id: ids.silent }))).status).toBe(201)
    expect(sent[0]?.payload.patientPhone).toBeNull()
  })

  it('treats the same request sent twice as one booking (offline retry)', async () => {
    const b = booking()
    expect((await book(b)).status).toBe(201)
    const again = await book(b)
    expect(again.status).toBe(200)
    expect((await again.json()).id).toBe(b.id)
    const { rows } = await db.query('SELECT count(*)::int AS n FROM appointments WHERE id = $1', [b.id])
    expect(rows[0]?.n).toBe(1)
  })

  it('refuses the same id reused for a different appointment', async () => {
    const b = booking()
    await book(b)
    const res = await book({ ...b, starts_at: slot() })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('id_conflict')
  })

  it('refuses a double-booking of the same specialist, but allows another specialist at that time', async () => {
    const when = slot()
    expect((await book(booking({ starts_at: when }))).status).toBe(201)
    const clash = await book(booking({ starts_at: when }))
    expect(clash.status).toBe(409)
    expect((await clash.json()).error).toBe('double_booked')
    expect((await book(booking({ starts_at: when, specialist_id: ids.other }))).status).toBe(201)
    expect(sent.filter((e) => e.payload.startsAt === new Date(when).toISOString())).toHaveLength(2) // no event for the refused one
  })

  it('keeps the booking when publishing fails, and says so', async () => {
    snsDown = true
    const b = booking()
    const res = await book(b)
    expect(res.status).toBe(201)
    expect((await res.json()).event).toBe('not_published')
    const { rows } = await db.query('SELECT 1 FROM appointments WHERE id = $1', [b.id])
    expect(rows).toHaveLength(1)
  })

  it('refuses callers who are not signed in, or not allowed to book', async () => {
    expect((await book(booking(), null)).status).toBe(401)
    const before = await auditRows('denied')
    const res = await book(booking(), await signToken(key, ids.official))
    expect(res.status).toBe(403)
    expect(await auditRows('denied')).toBe(before + 1) // the refused attempt is on record
  })

  it('rejects bad input with 400 and names the field', async () => {
    const field = async (over: Record<string, unknown>) => (await (await book(booking(over))).json()).field
    expect(await field({ id: '42' })).toBe('id')
    expect(await field({ patient_id: 'not-a-uuid' })).toBe('patient_id')
    expect(await field({ starts_at: 'next tuesday' })).toBe('starts_at')
    expect(await field({ ends_at: '2020-01-01T00:00:00Z' })).toBe('ends_at')
    expect(await field({ specialist_id: ids.chv })).toBe('specialist_id') // a CHV is not a specialist
    expect((await book(null, chvToken, '{"id": ')).status).toBe(400) // malformed JSON
  })

  it('answers 404 for an unknown patient and logs it as not_found', async () => {
    const before = await auditRows('not_found')
    const res = await book(booking({ patient_id: randomUUID() }))
    expect(res.status).toBe(404)
    expect(await auditRows('not_found')).toBe(before + 1)
  })
})
