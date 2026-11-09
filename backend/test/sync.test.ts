import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { signToken, signingKey } from '../src/auth.js'
import type { Db } from '../src/db.js'
import { SYSTEM_ID, TEST_DATABASE_URL, freshDatabase } from './pg.js'

const key = signingKey('test-secret-that-is-long-enough-32+chars')!
type J = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const patient = (id: string, name = 'Ama Test'): J => ({ resourceType: 'Patient', id, name: [{ text: name }], gender: 'female', birthDate: '1990-01-01', address: [{ city: 'Sokode' }], telecom: [{ system: 'phone', value: '+233200000001' }] })
const consent = (id: string, p: string, purpose = 'clinical_care', withdrawn?: string): J => ({
  resourceType: 'Consent', id, status: withdrawn ? 'inactive' : 'active', scope: { coding: [{ system: 's', code: 'patient-privacy' }] }, category: [{ coding: [{ system: 'p', code: purpose }] }],
  patient: { reference: `Patient/${p}` }, dateTime: '2026-11-01T08:00:00.000Z', performer: [{ display: 'patient' }],
  ...(withdrawn ? { extension: [{ url: 'https://healthconnect.example/consent-withdrawn-at', valueDateTime: withdrawn }] } : {}),
})
const reading = (id: string, p: string, c: string, value = 37.2): J => ({
  resourceType: 'Observation', id, status: 'final', category: [{ coding: [{ system: 's', code: 'vital-signs' }] }], code: { coding: [{ system: 'http://loinc.org', code: '8310-5' }] },
  subject: { reference: `Patient/${p}` }, effectiveDateTime: '2026-11-02T08:00:00.000Z', valueQuantity: { value, unit: '°C', system: 'u', code: 'Cel' },
  extension: [{ url: 'https://healthconnect.example/observation-consent', valueReference: { reference: `Consent/${c}` } }],
})
const visit = (id: string, p: string, doc: string, start: string, status = 'booked'): J => ({
  resourceType: 'Appointment', id, status, start, end: new Date(Date.parse(start) + 1_800_000).toISOString(),
  participant: [{ actor: { reference: `Patient/${p}` }, status: 'accepted' }, { actor: { reference: `Practitioner/${doc}` }, status: 'accepted' }],
})
const photo = (id: string, p: string, size: number): J => ({ resourceType: 'Media', id, status: 'completed', type: { coding: [{ system: 's', code: 'image' }] }, subject: { reference: `Patient/${p}` }, createdDateTime: '2026-11-02T08:00:00.000Z', content: { contentType: 'image/jpeg', size, data: 'A'.repeat(size) } })

describe.skipIf(!TEST_DATABASE_URL)('sync', () => {
  let db: Db
  let drop: () => Promise<void>
  let url: string
  let close: () => void
  const events: J[] = []
  let failEvents = false
  const racer = randomUUID(), raceDoctor = randomUUID() // their own accounts: the race test's records would fill other tests' download pages
  const chv = randomUUID(), chv2 = randomUUID(), doctor = randomUUID(), doctor2 = randomUUID(), pharmacist = randomUUID(), ghs = randomUUID()
  const tok: Record<string, string> = {}

  beforeAll(async () => {
    ;({ db, drop } = await freshDatabase(12))
    await db.withTransaction(SYSTEM_ID, async (q) => {
      for (const [id, role] of [[racer, 'chv'], [raceDoctor, 'doctor'], [chv, 'chv'], [chv2, 'chv'], [doctor, 'doctor'], [doctor2, 'specialist'], [pharmacist, 'pharmacist'], [ghs, 'ghs_official']] as const) {
        await q.query(`INSERT INTO practitioners (id, full_name, role) VALUES ($1, $2, $3)`, [id, `Test ${role}`, role])
        tok[id] = await signToken(key, id)
      }
    })
    const server = createApp({ db, instanceId: 'test', jwtKey: key, events: { publish: async (t: string, p: unknown) => { if (failEvents) throw new Error('SNS down'); events.push({ t, p }) } } }).listen(0)
    await new Promise((r) => server.once('listening', r))
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    close = () => server.close()
  })
  afterAll(async () => {
    close?.()
    await drop?.()
  })

  const push = async (who: string | null, resource: J, baseVersion: number | null = null, extra: J = {}) => {
    const res = await fetch(`${url}/sync/push`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...(who ? { authorization: `Bearer ${tok[who]}` } : {}) },
      body: JSON.stringify({ id: resource.id, resourceType: resource.resourceType, patientId: null, version: 1, baseVersion, resource, ...extra }),
    })
    return { http: res.status, ...(await res.json() as J) }
  }
  const pull = async (who: string, since = 0) => {
    const res = await fetch(`${url}/sync/pull?since=${since}`, { headers: { authorization: `Bearer ${tok[who]}` } })
    return await res.json() as { items: J[]; cursor: number; more: boolean }
  }
  const setup = async (owner = chv) => {
    const p = randomUUID(), c = randomUUID()
    expect((await push(owner, patient(p))).status).toBe('ok')
    expect((await push(owner, consent(c, p))).status).toBe('ok')
    return { p, c }
  }
  let slot = 0
  const nextSlot = () => new Date(Date.UTC(2027, 0, 1, 8) + (slot++) * 3_600_000).toISOString()

  it('stores a new patient, in sync_records and in the patients table', async () => {
    const p = randomUUID()
    expect(await push(chv, patient(p))).toEqual({ http: 201, status: 'ok', serverVersion: 1 })
    const row = (await db.query('SELECT full_name, region, created_by FROM patients WHERE id = $1', [p])).rows[0]
    expect(row).toEqual({ full_name: 'Ama Test', region: 'Sokode', created_by: chv })
    expect((await db.query(`SELECT outcome, action FROM access_log WHERE patient_id = $1`, [p])).rows).toEqual([{ outcome: 'success', action: 'create' }])
  })

  it('treats the same record sent twice as already stored (a lost reply), with one row', async () => {
    const { p } = await setup()
    const r = reading(randomUUID(), p, (await db.query('SELECT id FROM consents WHERE patient_id = $1', [p])).rows[0]!.id as string)
    expect((await push(chv, r)).status).toBe('ok')
    expect(await push(chv, r)).toEqual({ http: 200, status: 'duplicate', serverVersion: 1 })
    expect((await db.query('SELECT count(*)::int AS n FROM observations WHERE id = $1', [r.id])).rows[0]!.n).toBe(1)
  })

  it('ignores key order when deciding two copies are the same', async () => {
    const p = randomUUID()
    const r = patient(p)
    await push(chv, r)
    const shuffled = Object.fromEntries(Object.entries(r).reverse())
    expect((await push(chv, shuffled)).status).toBe('duplicate')
  })

  it('accepts a change on the current version; on an old version it answers 409 with the server copy', async () => {
    const p = randomUUID()
    await push(chv, patient(p, 'First'))
    expect(await push(chv, patient(p, 'Second'), 1)).toEqual({ http: 200, status: 'ok', serverVersion: 2 })
    const clash = await push(chv, patient(p, 'Third'), 1)
    expect(clash).toMatchObject({ http: 409, status: 'conflict', serverVersion: 2 })
    expect(clash.resource.name[0].text).toBe('Second')
    expect((await db.query('SELECT full_name FROM patients WHERE id = $1', [p])).rows[0]!.full_name).toBe('Second')
  })

  it('lets only one of two different copies win when they arrive together', async () => {
    const p = randomUUID()
    await push(chv, patient(p, 'Base'))
    const results = await Promise.all(['A', 'B'].map((n) => push(chv, patient(p, n), 1)))
    expect(results.map((r) => r.status).sort()).toEqual(['conflict', 'ok'])
  })

  it('asks the phone to retry when the patient has not arrived yet, without storing anything', async () => {
    const p = randomUUID(), c = randomUUID()
    expect(await push(chv, consent(c, p))).toEqual({ http: 424, status: 'retry', reason: 'patient-not-here-yet' })
    expect((await db.query('SELECT 1 FROM sync_records WHERE id = $1', [c])).rows).toHaveLength(0)
    await push(chv, patient(p))
    expect((await push(chv, consent(c, p))).status).toBe('ok')
  })

  it('asks the phone to retry when a reading comes before its consent', async () => {
    const p = randomUUID()
    await push(chv, patient(p))
    expect(await push(chv, reading(randomUUID(), p, randomUUID()))).toMatchObject({ http: 424, status: 'retry' })
  })

  describe('the database rules still decide', () => {
    it('refuses a reading on withdrawn consent, a reading on a reminders-only consent, and a typing error', async () => {
      const { p, c } = await setup()
      expect((await push(chv, consent(c, p, 'clinical_care', '2026-11-03T08:00:00.000Z'), 1)).status).toBe('ok')
      expect(await push(chv, reading(randomUUID(), p, c))).toMatchObject({ http: 403, status: 'rejected', reason: 'consent-withdrawn' })
      const sms = randomUUID()
      await push(chv, consent(sms, p, 'appointment_reminders'))
      expect(await push(chv, reading(randomUUID(), p, sms))).toMatchObject({ http: 422, status: 'rejected', reason: 'refused-by-rules' })
      const q = await setup()
      expect(await push(chv, reading(randomUUID(), q.p, q.c, 99))).toMatchObject({ http: 422, status: 'rejected' })
    })
    it('refuses a bad phone number, leaving nothing behind', async () => {
      const p = randomUUID()
      const r = { ...patient(p), telecom: [{ system: 'phone', value: 'not-a-phone' }] }
      expect(await push(chv, r)).toMatchObject({ http: 422, status: 'rejected' })
      expect((await db.query('SELECT 1 FROM sync_records WHERE id = $1', [p])).rows).toHaveLength(0)
      expect((await db.query('SELECT 1 FROM patients WHERE id = $1', [p])).rows).toHaveLength(0)
    })
  })

  describe('double booking', () => {
    it('refuses the second visit at the same time with 409 double_booked, and the phone sees slot-taken', async () => {
      const a = await setup(), b = await setup()
      const start = nextSlot()
      expect((await push(chv, visit(randomUUID(), a.p, doctor, start))).status).toBe('ok')
      const second = randomUUID()
      expect(await push(chv, visit(second, b.p, doctor, start))).toMatchObject({ http: 409, status: 'rejected', reason: 'slot-taken', error: 'double_booked' })
      expect((await db.query('SELECT 1 FROM appointments WHERE id = $1', [second])).rows).toHaveLength(0)
    })
    it('lets exactly one win when two phones book the same time at once', async () => {
      // Many rounds: the two inserts used to deadlock only about one time in ten.
      for (let round = 0; round < 30; round++) {
        const a = await setup(racer), b = await setup(racer)
        const start = nextSlot()
        const results = await Promise.all([a, b].map((x) => push(racer, visit(randomUUID(), x.p, raceDoctor, start))))
        expect(results.map((r) => r.status).sort()).toEqual(['ok', 'rejected'])
      }
    }, 30_000)
    it('frees the time when a visit is cancelled', async () => {
      const a = await setup(), b = await setup()
      const start = nextSlot(), id = randomUUID()
      await push(chv, visit(id, a.p, doctor, start))
      expect((await push(chv, visit(id, a.p, doctor, start, 'cancelled'), 1)).status).toBe('ok')
      expect((await push(chv, visit(randomUUID(), b.p, doctor, start))).status).toBe('ok')
    })
    it('refuses a visit with someone who is not a doctor or specialist', async () => {
      const a = await setup()
      expect(await push(chv, visit(randomUUID(), a.p, pharmacist, nextSlot()))).toMatchObject({ http: 422, reason: 'unknown-specialist' })
    })
    it('announces a new booking once, with no phone unless they agreed to reminders, and survives SNS being down', async () => {
      const a = await setup()
      const id = randomUUID(), start = nextSlot()
      events.length = 0
      await push(chv, visit(id, a.p, doctor, start))
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({ t: 'appointment.created', p: { appointmentId: id, patientId: a.p, specialistId: doctor, patientPhone: null } })
      await push(chv, visit(id, a.p, doctor, start)) // a retry doesn't announce again
      expect(events).toHaveLength(1)
      failEvents = true
      const r = await push(chv, visit(randomUUID(), a.p, doctor, nextSlot()))
      failEvents = false
      expect(r.status).toBe('ok')
    })
    it('shows taken times with no patient details', async () => {
      const a = await setup()
      const start = nextSlot()
      await push(chv, visit(randomUUID(), a.p, doctor2, start))
      const from = new Date(Date.parse(start) - 3_600_000).toISOString(), to = new Date(Date.parse(start) + 3_600_000).toISOString()
      const res = await fetch(`${url}/sync/taken?specialist=${doctor2}&from=${from}&to=${to}`, { headers: { authorization: `Bearer ${tok[chv]}` } })
      expect(await res.json()).toEqual([{ start, end: new Date(Date.parse(start) + 1_800_000).toISOString() }])
      expect((await fetch(`${url}/sync/taken?specialist=x`, { headers: { authorization: `Bearer ${tok[chv]}` } })).status).toBe(400)
      expect((await fetch(`${url}/sync/taken?specialist=${doctor2}&from=${from}&to=${to}`, { headers: { authorization: `Bearer ${tok[ghs]}` } })).status).toBe(403)
    })
  })

  describe('who may send what', () => {
    it('refuses no sign-in with 401', async () => {
      const res = await fetch(`${url}/sync/push`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      expect(res.status).toBe(401)
      expect((await fetch(`${url}/sync/pull`)).status).toBe(401)
    })
    it('refuses a pharmacist and a GHS official, and records it', async () => {
      for (const who of [pharmacist, ghs]) {
        const p = randomUUID()
        expect(await push(who, patient(p))).toMatchObject({ http: 403, status: 'rejected', reason: 'forbidden' })
        expect((await db.query(`SELECT outcome FROM access_log WHERE patient_id = $1`, [p])).rows).toEqual([{ outcome: 'denied' }])
      }
    })
    it('refuses a CHV touching, or seeing through a conflict, another CHV\'s patient', async () => {
      const { p, c } = await setup(chv)
      expect(await push(chv2, patient(p, 'Hijacked'), 1)).toMatchObject({ http: 403, reason: 'forbidden' })
      const stale = await push(chv2, patient(p, 'Hijacked'), 0)
      expect(stale.http).toBe(403)
      expect(stale.resource).toBeUndefined()
      expect(await push(chv2, reading(randomUUID(), p, c))).toMatchObject({ http: 403 })
      expect((await db.query('SELECT full_name FROM patients WHERE id = $1', [p])).rows[0]!.full_name).toBe('Ama Test')
    })
    it('refuses a record reusing an id to move to another patient', async () => {
      const a = await setup(), b = await setup()
      const r = randomUUID()
      await push(chv, reading(r, a.p, a.c))
      expect(await push(chv, reading(r, b.p, b.c), 1)).toMatchObject({ http: 400, reason: 'invalid' })
    })
    it.each([
      ['a bad id', { id: 'nope' }],
      ['an unknown type', { resourceType: 'Prescription' }],
      ['a resource for a different id', { resource: patient(randomUUID()) }],
      ['a non-number baseVersion', { baseVersion: 'x' }],
      ['a patientId that does not match', { patientId: randomUUID() }],
    ])('answers 400 to %s', async (_label, extra) => {
      const r = await push(chv, patient(randomUUID()), null, extra)
      expect(r).toMatchObject({ http: 400, status: 'rejected' })
    })
    it('answers 400 when fields are missing or the wrong shape, never 500', async () => {
      const p = randomUUID()
      await push(chv, patient(p))
      for (const broken of [
        { resourceType: 'Patient', id: randomUUID() },
        { resourceType: 'Consent', id: randomUUID(), patient: { reference: `Patient/${p}` } },
        { resourceType: 'Observation', id: randomUUID(), subject: { reference: `Patient/${p}` } },
        { resourceType: 'Appointment', id: randomUUID(), participant: 'nope' },
        { resourceType: 'Observation', id: randomUUID(), subject: 7 },
        { ...reading(randomUUID(), p, randomUUID()), extension: 'nope' },
        { ...visit(randomUUID(), p, doctor, nextSlot()), start: 'infinity' },
      ]) expect((await push(chv, broken)).http, JSON.stringify(broken)).toBe(400)
    })
  })

  describe('download', () => {
    it('gives a CHV their own patients\' records, and nothing of another CHV\'s', async () => {
      const mine = await setup(chv), theirs = await setup(chv2)
      const ids = (await pull(chv)).items.map((i) => i.id)
      expect(ids).toContain(mine.p)
      expect(ids).not.toContain(theirs.p)
    })
    it('gives a pharmacist and a GHS official nothing', async () => {
      await setup(chv)
      expect((await pull(pharmacist)).items).toEqual([])
      expect((await pull(ghs)).items).toEqual([])
    })
    it('gives a doctor a patient\'s older records once a visit is booked with them, past their bookmark', async () => {
      const fresh = randomUUID()
      await db.withTransaction(SYSTEM_ID, (q) => q.query(`INSERT INTO practitioners (id, full_name, role) VALUES ($1, 'New Doctor', 'doctor')`, [fresh]))
      tok[fresh] = await signToken(key, fresh)
      const { p, c } = await setup(chv)
      const bookmark = (await pull(fresh)).cursor
      expect(bookmark).toBeGreaterThan(0)
      const v = randomUUID()
      await push(chv, visit(v, p, fresh, nextSlot()))
      const ids = (await pull(fresh, bookmark)).items.map((i) => i.id)
      expect(ids).toEqual(expect.arrayContaining([p, c, v]))
    })
    it('a bookmark means nothing is sent twice, and a change comes round again', async () => {
      const p = randomUUID()
      await push(chv, patient(p, 'One'))
      const first = await pull(chv)
      expect((await pull(chv, first.cursor)).items).toEqual([])
      await push(chv, patient(p, 'Two'), 1)
      const again = await pull(chv, first.cursor)
      expect(again.items.map((i) => i.id)).toEqual([p])
      expect(again.items[0]).toMatchObject({ version: 2, patientId: p, resourceType: 'Patient' })
    })
    it('pages, without losing anything across the pages', async () => {
      const lots = randomUUID()
      await db.withTransaction(SYSTEM_ID, (q) => q.query(`INSERT INTO practitioners (id, full_name, role) VALUES ($1, 'Busy CHV', 'chv')`, [lots]))
      tok[lots] = await signToken(key, lots)
      const sent = new Set<string>()
      for (let i = 0; i < 105; i++) { const p = randomUUID(); await push(lots, patient(p)); sent.add(p) }
      const one = await pull(lots)
      expect(one.items).toHaveLength(100)
      expect(one.more).toBe(true)
      const two = await pull(lots, one.cursor)
      expect(two.items).toHaveLength(5)
      expect(two.more).toBe(false)
      expect(new Set([...one.items, ...two.items].map((i) => i.id))).toEqual(sent)
    })
    it('records the read, and answers 400 to a bad bookmark', async () => {
      const { p } = await setup()
      await pull(chv)
      expect((await db.query(`SELECT 1 FROM access_log WHERE patient_id = $1 AND action = 'read'`, [p])).rows.length).toBeGreaterThan(0)
      for (const since of ['-1', 'abc', '1;DROP']) {
        expect((await fetch(`${url}/sync/pull?since=${since}`, { headers: { authorization: `Bearer ${tok[chv]}` } })).status).toBe(400)
      }
    })
  })

  describe('patients', () => {
    const me = randomUUID(), other = randomUUID(), login = randomUUID()
    beforeAll(async () => {
      await db.withTransaction(SYSTEM_ID, async (q) => {
        await q.query(`INSERT INTO patients (id, full_name) VALUES ($1, 'Me'), ($2, 'Other')`, [me, other])
        await q.query(`INSERT INTO practitioners (id, full_name, role, patient_id) VALUES ($1, 'Me', 'patient', $2)`, [login, me])
      })
      tok[login] = await signToken(key, login)
    })
    it('lets a patient book their own visit, and download it', async () => {
      const id = randomUUID()
      expect((await push(login, visit(id, me, doctor, nextSlot()))).status).toBe('ok')
      expect((await pull(login)).items.map((i) => i.id)).toContain(id)
    })
    it('refuses a patient booking for someone else, or sending any other record', async () => {
      expect(await push(login, visit(randomUUID(), other, doctor, nextSlot()))).toMatchObject({ http: 403, reason: 'forbidden' })
      expect(await push(login, patient(me, 'Changed'))).toMatchObject({ http: 403 })
    })
  })

  describe('photos and voice notes', () => {
    it('takes a 2.7 MB voice note on /sync/push, but the 100 kB limit stays elsewhere', async () => {
      const { p } = await setup()
      expect((await push(chv, photo(randomUUID(), p, 2_700_000))).status).toBe('ok')
      const big = await fetch(`${url}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'x', password: 'y'.repeat(200_000) }) })
      expect(big.status).toBe(413)
    })
    it('refuses over 4 MB', async () => {
      const { p } = await setup()
      const res = await fetch(`${url}/sync/push`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${tok[chv]}` }, body: JSON.stringify({ resource: photo(randomUUID(), p, 4_300_000) }) })
      expect(res.status).toBe(413)
    })
  })
})
