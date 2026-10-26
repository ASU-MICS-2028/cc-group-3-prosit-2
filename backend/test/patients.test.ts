import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { signToken, signingKey } from '../src/auth.js'
import type { Db } from '../src/db.js'
import { SYSTEM_ID, TEST_DATABASE_URL, freshDatabase } from './pg.js'

const key = signingKey('test-secret-that-is-long-enough-32+chars')!

describe.skipIf(!TEST_DATABASE_URL)('GET /patients/:id, audited', () => {
  let db: Db
  let drop: () => Promise<void>
  let url: string
  let close: () => void
  const doctor = randomUUID()
  const official = randomUUID()
  const patient = randomUUID()

  beforeAll(async () => {
    ;({ db, drop } = await freshDatabase())
    await db.withTransaction(SYSTEM_ID, async (q) => {
      await q.query(`INSERT INTO practitioners (id, full_name, role) VALUES ($1, 'Dr Eshun', 'doctor'), ($2, 'GHS Officer', 'ghs_official')`, [doctor, official])
      await q.query(`INSERT INTO patients (id, full_name, phone, gender, region) VALUES ($1, 'Ama Test', '+233200000001', 'female', 'Volta')`, [patient])
    })
    const server = createApp({ db, instanceId: 'test', jwtKey: key, events: { publish: async () => {} } }).listen(0)
    await new Promise((r) => server.once('listening', r))
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    close = () => server.close()
  })
  afterAll(async () => {
    close?.()
    await drop?.()
  })

  const read = (id: string, token?: string) => fetch(`${url}/patients/${id}`, token ? { headers: { authorization: `Bearer ${token}` } } : {})
  const lastLog = async () =>
    (await db.query(`SELECT accessed_by, patient_id, action, outcome FROM access_log WHERE resource_type = 'Patient' ORDER BY accessed_at DESC, id LIMIT 1`)).rows[0]

  it('returns the patient to a doctor and records the read', async () => {
    const res = await read(patient, await signToken(key, doctor))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ id: patient, full_name: 'Ama Test', region: 'Volta' })
    expect(body).not.toHaveProperty('created_by') // audit columns stay in the database
    expect(await lastLog()).toEqual({ accessed_by: doctor, patient_id: patient, action: 'read', outcome: 'success' })
  })

  it('records a read of an unknown patient as not_found, and answers 404', async () => {
    const ghost = randomUUID()
    expect((await read(ghost, await signToken(key, doctor))).status).toBe(404)
    expect(await lastLog()).toMatchObject({ patient_id: ghost, outcome: 'not_found' })
  })

  it('refuses and records a role that may not open records', async () => {
    expect((await read(patient, await signToken(key, official))).status).toBe(403)
    expect(await lastLog()).toMatchObject({ accessed_by: official, outcome: 'denied' })
  })

  it('refuses and records a caller who is not signed in', async () => {
    expect((await read(patient)).status).toBe(401)
    expect(await lastLog()).toMatchObject({ accessed_by: null, patient_id: patient, outcome: 'denied' })
  })

  it('answers 400 for a malformed id, and records it without breaking the audit row', async () => {
    expect((await read('42', await signToken(key, doctor))).status).toBe(400)
    expect(await lastLog()).toMatchObject({ patient_id: null, outcome: 'error' })
  })

  it('keeps the log append-only: the API\'s connection cannot erase it', async () => {
    const error = await db.query('DELETE FROM access_log').catch((e) => e)
    expect(String(error.message)).toMatch(/append-only/)
  })
})
