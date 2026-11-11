import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { signToken, signingKey } from '../src/auth.js'
import type { Db } from '../src/db.js'
import { SYSTEM_ID, TEST_DATABASE_URL, freshDatabase, sqlState } from './pg.js'

const key = signingKey('test-secret-that-is-long-enough-32+chars')!
type J = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

describe.skipIf(!TEST_DATABASE_URL)('call recordings and the QA list', () => {
  let db: Db, drop: () => Promise<void>, url: string, close: () => void
  const fac = randomUUID(), otherFac = randomUUID()
  const chv = randomUUID(), otherChv = randomUUID(), doctor = randomUUID(), otherDoctor = randomUUID(), admin = randomUUID(), otherAdmin = randomUUID(), patientLogin = randomUUID(), strangerLogin = randomUUID(), pharmacist = randomUUID()
  const patient = randomUUID(), stranger = randomUUID(), visit = randomUUID()
  const tok: Record<string, string> = {}

  beforeAll(async () => {
    ;({ db, drop } = await freshDatabase(8))
    await db.withTransaction(SYSTEM_ID, async (q) => {
      await q.query(`INSERT INTO facilities (id, name, type, region) VALUES ($1, 'Ho Clinic', 'clinic', 'Volta'), ($2, 'Tema Clinic', 'clinic', 'Greater Accra')`, [fac, otherFac])
      for (const [id, name] of [[patient, 'Test Patient'], [stranger, 'Other Patient']] as const) {
        await q.query(`INSERT INTO patients (id, full_name) VALUES ($1, $2)`, [id, name])
      }
      for (const [id, role, f, p] of [[doctor, 'doctor', fac, null], [otherDoctor, 'doctor', fac, null], [admin, 'health_centre_admin', fac, null], [otherAdmin, 'health_centre_admin', otherFac, null], [patientLogin, 'patient', null, patient], [strangerLogin, 'patient', null, stranger], [pharmacist, 'pharmacist', fac, null], [chv, 'chv', null, null], [otherChv, 'chv', null, null]] as const) {
        await q.query(`INSERT INTO practitioners (id, full_name, role, facility_id, patient_id) VALUES ($1, $2, $3, $4, $5)`, [id, `Test ${role}`, role, f, p])
        tok[id] = await signToken(key, id)
      }
      await q.query(`INSERT INTO consents (patient_id, purpose, given_by, recorded_by, given_at) VALUES ($1, 'clinical_care', 'patient', $2, now())`, [patient, SYSTEM_ID])
    })
    await db.withTransaction(SYSTEM_ID, async (q) => {
      await q.query(`INSERT INTO appointments (id, patient_id, specialist_id, starts_at, ends_at) VALUES ($1, $2, $3, now() + interval '1 hour', now() + interval '90 minutes')`, [visit, patient, doctor])
    })
    const server = createApp({ db, instanceId: 'test', jwtKey: key, events: { publish: async () => {} } }).listen(0)
    await new Promise((r) => server.once('listening', r))
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    close = () => server.close()
  })
  afterAll(async () => { close?.(); await drop?.() })

  const post = async (who: string, path: string, body: J = {}) => {
    const res = await fetch(url + path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${tok[who]}` }, body: JSON.stringify(body) })
    const raw = await res.text()
    return { http: res.status, ...(raw ? JSON.parse(raw) as J : {}) }
  }
  const list = async (who: string) => {
    const res = await fetch(`${url}/recordings`, { headers: { authorization: `Bearer ${tok[who]}` } })
    return { http: res.status, body: await res.json() as any } // eslint-disable-line @typescript-eslint/no-explicit-any
  }
  const agree = (who: string, id: string) => post(who, `/recordings/${id}/agree`, { appointment_id: visit })
  /** A recording both sides agreed to and the doctor's phone has finished. */
  const finished = async () => {
    const id = randomUUID()
    await agree(doctor, id); await agree(patientLogin, id)
    expect((await post(doctor, `/recordings/${id}/finish`, { seconds: 61 })).http).toBe(204)
    return id
  }

  it('only the two sides of the visit can agree, and the doctor asks first', async () => {
    const id = randomUUID()
    expect((await agree(patientLogin, id)).error).toBe('not_asked')
    expect((await agree(otherDoctor, id)).http).toBe(403)
    expect((await agree(strangerLogin, id)).http).toBe(403)
    expect(await agree(doctor, id)).toMatchObject({ http: 200, clinicianAgreed: true, patientAgreed: false })
    expect((await agree(strangerLogin, id)).http).toBe(403)
    expect(await agree(patientLogin, id)).toMatchObject({ http: 200, clinicianAgreed: true, patientAgreed: true })
    expect((await agree(doctor, id)).http).toBe(200) // a retry is harmless
  })

  it('the CHV who looks after the patient can answer for that side; another CHV cannot', async () => {
    const push = (resource: J) => post(chv, '/sync/push', { id: resource.id, resourceType: resource.resourceType, patientId: null, version: 1, baseVersion: null, resource })
    const p = randomUUID(), v = randomUUID(), start = new Date(Date.now() + 86_400_000)
    expect((await push({ resourceType: 'Patient', id: p, name: [{ text: 'Akua Test' }] })).http).toBeLessThan(300)
    await push({ resourceType: 'Consent', id: randomUUID(), status: 'active', scope: {}, category: [{ coding: [{ code: 'clinical_care' }] }], patient: { reference: `Patient/${p}` }, dateTime: '2026-11-01T08:00:00Z', performer: [{ display: 'patient' }] })
    expect((await push({ resourceType: 'Appointment', id: v, status: 'booked', start: start.toISOString(), end: new Date(start.getTime() + 1_800_000).toISOString(), participant: [{ actor: { reference: `Patient/${p}` } }, { actor: { reference: `Practitioner/${doctor}` } }] })).http).toBeLessThan(300)
    const id = randomUUID()
    expect((await post(doctor, `/recordings/${id}/agree`, { appointment_id: v })).http).toBe(200)
    expect((await post(otherChv, `/recordings/${id}/agree`, {})).http).toBe(403)
    expect(await post(chv, `/recordings/${id}/agree`, {})).toMatchObject({ http: 200, patientAgreed: true })
  })

  it('cannot finish until both have agreed; the database refuses it too', async () => {
    const id = randomUUID()
    await agree(doctor, id)
    expect((await post(doctor, `/recordings/${id}/finish`, { seconds: 5 })).error).toBe('consent_incomplete')
    await expect(db.withTransaction(SYSTEM_ID, (q) => q.query('UPDATE call_recordings SET ended_at = now() WHERE id = $1', [id])))
      .rejects.toSatisfy((e) => sqlState(e) === '23514')
    expect((await post(patientLogin, `/recordings/${id}/finish`, { seconds: 5 })).http).toBe(403)
  })

  it('either side can withdraw; nothing further can happen to it and it never reaches the QA list', async () => {
    const id = randomUUID()
    await agree(doctor, id); await agree(patientLogin, id)
    expect((await post(patientLogin, `/recordings/${id}/withdraw`)).http).toBe(204)
    expect((await post(doctor, `/recordings/${id}/withdraw`)).http).toBe(204) // both phones report it
    expect((await post(doctor, `/recordings/${id}/finish`, { seconds: 5 })).error).toBe('withdrawn')
    expect((await agree(patientLogin, id)).error).toBe('withdrawn')
    expect((await post(strangerLogin, `/recordings/${id}/withdraw`)).http).toBe(403)
    expect((await post(admin, `/recordings/${id}/review`, { outcome: 'meets_standard' })).error).toBe('not_reviewable')
    expect((await list(admin)).body.find((r: J) => r.id === id)).toBeUndefined()
    expect((await list(doctor)).body.find((r: J) => r.id === id).status).toBe('withdrawn')
  })

  it('a withdrawal that lands after finish still wins', async () => {
    const id = await finished()
    await post(doctor, `/recordings/${id}/withdraw`)
    expect((await list(admin)).body.find((r: J) => r.id === id)).toBeUndefined()
  })

  it('who may see the list and review what', async () => {
    const id = await finished()
    const seen = (await list(admin)).body.find((r: J) => r.id === id)
    expect(seen).toMatchObject({ status: 'finished', seconds: 61, mayReview: true, facility: 'Ho Clinic' })
    expect(JSON.stringify(seen)).not.toContain('Test Patient')
    expect((await list(otherAdmin)).body).toEqual([])
    expect((await list(patientLogin)).http).toBe(403)
    expect((await list(pharmacist)).http).toBe(403)
    expect((await list(otherDoctor)).body).toEqual([])
    expect((await list(doctor)).body.find((r: J) => r.id === id).mayReview).toBe(false)

    expect((await post(doctor, `/recordings/${id}/review`, { outcome: 'meets_standard' })).http).toBe(403)
    expect((await post(otherAdmin, `/recordings/${id}/review`, { outcome: 'meets_standard' })).http).toBe(403)
    expect((await post(admin, `/recordings/${id}/review`, { outcome: 'bad' })).http).toBe(400)
  })

  it('a review is recorded once, with who did it, and is on the audit log', async () => {
    const id = await finished()
    expect((await post(admin, `/recordings/${id}/review`, { outcome: 'needs_follow_up', note: 'Check the dose advice' })).http).toBe(201)
    expect((await post(admin, `/recordings/${id}/review`, { outcome: 'meets_standard' })).http).toBe(200) // no second opinion from a retry
    const seen = (await list(admin)).body.find((r: J) => r.id === id)
    expect(seen.reviews).toEqual([expect.objectContaining({ reviewer: 'Test health_centre_admin', outcome: 'needs_follow_up', note: 'Check the dose advice' })])
    expect(seen.mayReview).toBe(false)
    const denied = await db.query(`SELECT 1 FROM access_log WHERE accessed_by = $1 AND outcome = 'denied' AND resource_type = 'Media'`, [strangerLogin])
    expect(denied.rows.length).toBeGreaterThan(0)
    await expect(db.withTransaction(SYSTEM_ID, (q) => q.query('DELETE FROM recording_reviews WHERE recording_id = $1', [id]))).rejects.toThrow()
  })
})
