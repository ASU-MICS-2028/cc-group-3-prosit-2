import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { signToken, signingKey } from '../src/auth.js'
import type { Db } from '../src/db.js'
import { SYSTEM_ID, TEST_DATABASE_URL, freshDatabase } from './pg.js'

const key = signingKey('test-secret-that-is-long-enough-32+chars')!
type J = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

describe.skipIf(!TEST_DATABASE_URL)('prescriptions', () => {
  let db: Db
  let drop: () => Promise<void>
  let url: string
  let close: () => void
  const chv = randomUUID(), doctor = randomUUID(), unlicensed = randomUUID(), nurse = randomUUID(), pharmacist = randomUUID(), pharmacist2 = randomUUID(), ghs = randomUUID(), facility = randomUUID()
  const tok: Record<string, string> = {}
  let slot = 0

  beforeAll(async () => {
    ;({ db, drop } = await freshDatabase(12))
    await db.withTransaction(SYSTEM_ID, async (q) => {
      await q.query(`INSERT INTO facilities (id, name, type, region) VALUES ($1, 'Ho Pharmacy', 'pharmacy', 'Volta')`, [facility])
      for (const [id, role, f] of [[chv, 'chv', null], [doctor, 'doctor', null], [unlicensed, 'specialist', null], [nurse, 'nurse', null], [pharmacist, 'pharmacist', facility], [pharmacist2, 'pharmacist', facility], [ghs, 'ghs_official', null]] as const) {
        await q.query(`INSERT INTO practitioners (id, full_name, role, facility_id) VALUES ($1, $2, $3, $4)`, [id, `Test ${role}`, role, f])
        tok[id] = await signToken(key, id)
      }
      await q.query(`INSERT INTO prescriber_licences (practitioner_id, licence_number, valid_until) VALUES ($1, 'MDC-TEST-1', '2030-01-01')`, [doctor])
    })
    const server = createApp({ db, instanceId: 'test', jwtKey: key, events: { publish: async () => {} }, authRatePerMinute: 100_000 }).listen(0)
    await new Promise((r) => server.once('listening', r))
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    close = () => server.close()
  })
  afterAll(async () => {
    close?.()
    await drop?.()
  })

  const post = async (who: string, path: string, body: J = {}) => {
    const res = await fetch(url + path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${tok[who]}` }, body: JSON.stringify(body) })
    const raw = await res.text()
    return { http: res.status, ...(raw ? JSON.parse(raw) as J : {}) }
  }
  const get = async (who: string, path: string) => {
    const res = await fetch(url + path, { headers: { authorization: `Bearer ${tok[who]}` } })
    return { http: res.status, body: await res.json() as any } // eslint-disable-line @typescript-eslint/no-explicit-any
  }
  const push = (who: string, resource: J) => post(who, '/sync/push', { id: resource.id, resourceType: resource.resourceType, patientId: null, version: 1, baseVersion: null, resource })

  /** A patient registered by the CHV, with consent, and a visit with the given doctor. */
  const patientWithVisit = async (prescriber = doctor, withConsent = true) => {
    const p = randomUUID()
    await push(chv, { resourceType: 'Patient', id: p, name: [{ text: 'Akua Test' }] })
    if (withConsent) await push(chv, { resourceType: 'Consent', id: randomUUID(), status: 'active', scope: {}, category: [{ coding: [{ code: 'clinical_care' }] }], patient: { reference: `Patient/${p}` }, dateTime: '2026-11-01T08:00:00Z', performer: [{ display: 'patient' }] })
    const start = new Date(Date.UTC(2027, 1, 1, 8) + (slot++) * 3_600_000)
    const v = await push(chv, { resourceType: 'Appointment', id: randomUUID(), status: 'booked', start: start.toISOString(), end: new Date(start.getTime() + 1_800_000).toISOString(), participant: [{ actor: { reference: `Patient/${p}` } }, { actor: { reference: `Practitioner/${prescriber}` } }] })
    expect(v.status).toBe('ok')
    return p
  }
  const write = (who: string, patient: string, medication = 'Amlodipine 5 mg', extra: J = {}) =>
    post(who, '/prescriptions', { id: randomUUID(), patient_id: patient, medication, dose: '1 tablet', frequency: 'each morning', duration_days: 30, quantity: 30, ...extra })
  const lastLog = async (patient: string) => (await db.query(`SELECT action, outcome FROM access_log WHERE patient_id = $1 AND resource_type = 'Prescription' ORDER BY accessed_at DESC, id LIMIT 1`, [patient])).rows[0]

  describe('writing', () => {
    it('issues a prescription with a code, a signed QR and the prescriber\'s licence, and records it', async () => {
      const p = await patientWithVisit()
      const rx = await write(doctor, p)
      expect(rx.http).toBe(201)
      expect(rx.code).toMatch(/^\d{8}$/)
      expect(rx.qr).toContain(`hc-rx:1:${rx.id}:${rx.code}:`)
      expect(rx.prescriber).toEqual({ name: 'Test doctor', licence: 'MDC-TEST-1' })
      expect(rx.status).toBe('active')
      expect(rx.flags).toEqual([])
      expect(await lastLog(p)).toEqual({ action: 'create', outcome: 'success' })
    })
    it('gives back the same prescription when sent twice, with no second row or flag', async () => {
      const p = await patientWithVisit()
      const id = randomUUID()
      const a = await write(doctor, p, 'Metformin 500 mg', { id })
      const b = await write(doctor, p, 'Metformin 500 mg', { id })
      expect(b.http).toBe(200)
      expect(b.code).toBe(a.code)
      expect(b.flags).toEqual([])
      const clash = await write(doctor, p, 'Something else', { id })
      expect(clash).toMatchObject({ http: 409, error: 'id_conflict' })
    })
    it('takes the same request twice at once', async () => {
      const p = await patientWithVisit()
      const id = randomUUID()
      const [a, b] = await Promise.all([write(doctor, p, 'ORS', { id }), write(doctor, p, 'ORS', { id })])
      expect([a.http, b.http].sort()).toEqual([200, 201])
      expect(a.code).toBe(b.code)
    })
    it.each([['a CHV', () => chv], ['a nurse', () => nurse], ['a pharmacist', () => pharmacist], ['a GHS official', () => ghs]])('refuses %s', async (_label, who) => {
      const p = await patientWithVisit()
      expect(await write(who(), p)).toMatchObject({ http: 403, error: 'forbidden' })
    })
    it('refuses a doctor with no visit with this patient, and records it', async () => {
      const p = await patientWithVisit(unlicensed)
      expect(await write(doctor, p)).toMatchObject({ http: 403, error: 'forbidden' })
      expect(await lastLog(p)).toEqual({ action: 'create', outcome: 'denied' })
    })
    it('refuses without consent', async () => {
      const p = await patientWithVisit(doctor, false)
      expect(await write(doctor, p)).toMatchObject({ http: 403, error: 'consent_missing' })
    })
    it.each([
      [{ medication: '' }], [{ medication: 'x'.repeat(201) }], [{ dose: 5 }], [{ duration_days: 0 }], [{ duration_days: 400 }],
      [{ quantity: -1 }], [{ quantity: 1.5 }], [{ id: 'nope' }], [{ patient_id: 'nope' }], [{ instructions: 'x'.repeat(501) }],
    ])('answers 400 to %j', async (extra) => {
      const p = await patientWithVisit()
      expect((await write(doctor, p, 'Amoxicillin', extra)).http).toBe(400)
    })
    it('refuses no sign-in', async () => {
      expect((await fetch(`${url}/prescriptions/mine`)).status).toBe(401)
    })
  })

  describe('fraud checks', () => {
    it('flags the same medicine twice, ignoring capitals, and a third in 30 days as repeated', async () => {
      const p = await patientWithVisit()
      await write(doctor, p, 'Tramadol 50 mg')
      const second = await write(doctor, p, 'TRAMADOL 50 MG')
      expect(second.flags.map((f: J) => f.kind)).toEqual(['duplicate'])
      const third = await write(doctor, p, 'tramadol 50 mg')
      expect(third.flags.map((f: J) => f.kind).sort()).toEqual(['duplicate', 'repeated'])
    })
    it('does not flag a different medicine, or another patient', async () => {
      const p = await patientWithVisit(), q = await patientWithVisit()
      await write(doctor, p, 'Paracetamol')
      expect((await write(doctor, p, 'Ibuprofen')).flags).toEqual([])
      expect((await write(doctor, q, 'Paracetamol')).flags).toEqual([])
    })
    it('does not flag a duplicate once the first has been dispensed or cancelled', async () => {
      const p = await patientWithVisit()
      const a = await write(doctor, p, 'Zinc')
      expect((await post(pharmacist, `/prescriptions/${a.id}/dispense`, { code: a.code })).http).toBe(200)
      expect((await write(doctor, p, 'Zinc')).flags.map((f: J) => f.kind)).toEqual([])
    })
    it('flags an unlicensed prescriber, and an expired licence too', async () => {
      const p = await patientWithVisit(unlicensed)
      expect((await write(unlicensed, p)).flags.map((f: J) => f.kind)).toContain('unlicensed')
      await db.withTransaction(SYSTEM_ID, (q) => q.query(`INSERT INTO prescriber_licences (practitioner_id, licence_number, valid_until) VALUES ($1, 'OLD', '2020-01-01')`, [unlicensed]))
      const r = await write(unlicensed, p, 'Vitamin C')
      expect(r.flags.map((f: J) => f.kind)).toContain('unlicensed')
      expect(r.prescriber.licence).toBeNull()
    })
    it('flags a prescriber writing too many in an hour', async () => {
      const busy = randomUUID()
      await db.withTransaction(SYSTEM_ID, async (q) => {
        await q.query(`INSERT INTO practitioners (id, full_name, role) VALUES ($1, 'Busy Doctor', 'doctor')`, [busy])
        await q.query(`INSERT INTO prescriber_licences (practitioner_id, licence_number, valid_until) VALUES ($1, 'MDC-BUSY', '2030-01-01')`, [busy])
      })
      tok[busy] = await signToken(key, busy)
      const p = await patientWithVisit(busy)
      let last: J = {}
      for (let i = 0; i < 21; i++) last = await write(busy, p, `Medicine ${i}`)
      expect(last.flags.map((f: J) => f.kind)).toEqual(['prescriber_rate'])
    })
  })

  describe('pharmacist', () => {
    it('verifies by code, with spaces, showing what to hand over but no code', async () => {
      const p = await patientWithVisit()
      const rx = await write(doctor, p)
      const spaced = `${rx.code.slice(0, 4)} ${rx.code.slice(4)}`
      const seen = await post(pharmacist, '/prescriptions/verify', { code: spaced })
      expect(seen).toMatchObject({ http: 200, id: rx.id, medication: 'Amlodipine 5 mg', status: 'active', patient: { name: 'Akua Test' } })
      expect(seen.code).toBeUndefined()
      expect(await lastLog(p)).toEqual({ action: 'read', outcome: 'success' })
    })
    it('verifies by scanned QR, and refuses an altered one', async () => {
      const p = await patientWithVisit()
      const rx = await write(doctor, p)
      expect((await post(pharmacist, '/prescriptions/verify', { qr: rx.qr })).id).toBe(rx.id)
      const parts = rx.qr.split(':')
      parts[3] = parts[3] === '11111111' ? '22222222' : '11111111'
      expect(await post(pharmacist, '/prescriptions/verify', { qr: parts.join(':') })).toMatchObject({ http: 400, error: 'bad_signature' })
      expect(await post(pharmacist, '/prescriptions/verify', { qr: 'hello' })).toMatchObject({ http: 400, error: 'invalid_request' })
    })
    it('answers 404 to a wrong code, 400 to no code, and refuses other roles', async () => {
      expect(await post(pharmacist, '/prescriptions/verify', { code: '00000001' })).toMatchObject({ http: 404, error: 'not_found' })
      expect((await post(pharmacist, '/prescriptions/verify', {})).http).toBe(400)
      for (const who of [chv, doctor, nurse, ghs]) expect((await post(who, '/prescriptions/verify', { code: '12345678' })).http).toBe(403)
    })
    it('dispenses once; the second try is refused and recorded', async () => {
      const p = await patientWithVisit()
      const rx = await write(doctor, p)
      const first = await post(pharmacist, `/prescriptions/${rx.id}/dispense`, { code: rx.code })
      expect(first).toMatchObject({ http: 200, status: 'dispensed', dispensedAtPlace: 'Ho Pharmacy' })
      const second = await post(pharmacist2, `/prescriptions/${rx.id}/dispense`, { code: rx.code })
      expect(second).toMatchObject({ http: 409, error: 'already_dispensed' })
      expect(await lastLog(p)).toEqual({ action: 'update', outcome: 'denied' })
      const row = (await db.query('SELECT dispensed_by FROM prescriptions WHERE id = $1', [rx.id])).rows[0]!
      expect(row.dispensed_by).toBe(pharmacist)
      const seen = await post(pharmacist2, '/prescriptions/verify', { code: rx.code })
      expect(seen).toMatchObject({ status: 'dispensed', dispensedAtPlace: 'Ho Pharmacy' })
    })
    it('lets exactly one win when two pharmacists dispense at the same moment', async () => {
      const p = await patientWithVisit()
      const rx = await write(doctor, p)
      const results = await Promise.all([pharmacist, pharmacist2].map((who) => post(who, `/prescriptions/${rx.id}/dispense`, { code: rx.code })))
      expect(results.map((r) => r.http).sort()).toEqual([200, 409])
    })
    it('needs the patient\'s code: an id alone dispenses nothing', async () => {
      const p = await patientWithVisit()
      const rx = await write(doctor, p)
      expect((await post(pharmacist, `/prescriptions/${rx.id}/dispense`, { code: '00000001' })).http).toBe(404)
      expect((await post(pharmacist, `/prescriptions/${rx.id}/dispense`, {})).http).toBe(404)
      expect((await post(doctor, `/prescriptions/${rx.id}/dispense`, { code: rx.code })).http).toBe(403)
      expect((await post(pharmacist, '/prescriptions/nope/dispense', { code: rx.code })).http).toBe(400)
    })
    it('makes the pharmacist acknowledge flags first, and records who did', async () => {
      const p = await patientWithVisit()
      await write(doctor, p, 'Codeine')
      const rx = await write(doctor, p, 'Codeine')
      const held = await post(pharmacist, `/prescriptions/${rx.id}/dispense`, { code: rx.code })
      expect(held).toMatchObject({ http: 409, error: 'flags_need_review' })
      expect(held.flags[0].kind).toBe('duplicate')
      expect(held.patientId).toBeUndefined()
      expect((await db.query('SELECT status FROM prescriptions WHERE id = $1', [rx.id])).rows[0]!.status).toBe('active')
      const done = await post(pharmacist, `/prescriptions/${rx.id}/dispense`, { code: rx.code, acknowledgeFlags: true })
      expect(done.http).toBe(200)
      expect(done.flags[0].reviewed).toBe(true)
      expect((await db.query('SELECT reviewed_by FROM prescription_flags WHERE prescription_id = $1', [rx.id])).rows[0]!.reviewed_by).toBe(pharmacist)
    })
    it('refuses an expired prescription, and shows it as expired, and its date cannot be moved', async () => {
      const p = await patientWithVisit()
      const rx = await write(doctor, p)
      await expect(db.withTransaction(SYSTEM_ID, (q) => q.query(`UPDATE prescriptions SET expires_at = now() + interval '1 year' WHERE id = $1`, [rx.id]))).rejects.toThrow(/cannot be edited/)
      // Time passing, without rewriting the rule: a prescription issued with a date already due.
      const old = randomUUID()
      const c = (await db.query(`SELECT id FROM consents WHERE patient_id = $1`, [p])).rows[0]!.id
      await db.withTransaction(doctor, async (q) => {
        await q.query(`INSERT INTO prescriptions (id, patient_id, consent_id, medication, dose, frequency, duration_days, quantity, verification_code, expires_at)
          VALUES ($1, $2, $3, 'Old', '1', '1', 1, 1, '99887766', clock_timestamp() + interval '50 milliseconds')`, [old, p, c])
      })
      await new Promise((r) => setTimeout(r, 120))
      expect(await post(pharmacist, '/prescriptions/verify', { code: '99887766' })).toMatchObject({ status: 'expired' })
      expect(await post(pharmacist, `/prescriptions/${old}/dispense`, { code: '99887766' })).toMatchObject({ http: 409, error: 'expired' })
    })
  })

  describe('cancelling and lists', () => {
    it('lets only the prescriber cancel; a cancelled one cannot be dispensed or cancelled again', async () => {
      const p = await patientWithVisit()
      const rx = await write(doctor, p)
      expect((await post(chv, `/prescriptions/${rx.id}/cancel`)).http).toBe(403)
      expect((await post(doctor, `/prescriptions/${rx.id}/cancel`)).http).toBe(204)
      expect((await post(doctor, `/prescriptions/${rx.id}/cancel`)).http).toBe(409)
      // acknowledgeFlags: by now this shared doctor has passed the hourly limit, which rightly flags their prescriptions
      expect(await post(pharmacist, `/prescriptions/${rx.id}/dispense`, { code: rx.code, acknowledgeFlags: true })).toMatchObject({ http: 409, error: 'cancelled' })
      expect((await post(doctor, `/prescriptions/${randomUUID()}/cancel`)).http).toBe(404)
    })
    it('shows a patient only their own, with the code; a pharmacist only what they dispensed, with none', async () => {
      const mine = await patientWithVisit(), other = await patientWithVisit()
      const login = randomUUID()
      await db.withTransaction(SYSTEM_ID, (q) => q.query(`INSERT INTO practitioners (id, full_name, role, patient_id) VALUES ($1, 'Akua', 'patient', $2)`, [login, mine]))
      tok[login] = await signToken(key, login)
      const a = await write(doctor, mine, 'For me')
      const b = await write(doctor, other, 'For someone else')
      const list = (await get(login, '/prescriptions/mine')).body as J[]
      expect(list.map((r) => r.id)).toEqual([a.id])
      expect(list[0]!.code).toBe(a.code)
      await post(pharmacist2, `/prescriptions/${b.id}/dispense`, { code: b.code, acknowledgeFlags: true })
      const handed = (await get(pharmacist2, '/prescriptions/mine')).body as J[]
      expect(handed.map((r) => r.id)).toContain(b.id)
      expect(handed[0]!.code).toBeUndefined()
      expect((await get(ghs, '/prescriptions/mine')).http).toBe(403)
    })
    it('lists test pharmacies, labelled as test', async () => {
      const { body } = await get(chv, '/pharmacies')
      expect(body.mode).toBe('test')
      expect(body.pharmacies.map((f: J) => f.name)).toContain('Ho Pharmacy')
    })
  })
})
