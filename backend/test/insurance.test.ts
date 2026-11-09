import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { signToken, signingKey } from '../src/auth.js'
import type { Db } from '../src/db.js'
import { SYSTEM_ID, TEST_DATABASE_URL, freshDatabase, sqlState } from './pg.js'

const key = signingKey('test-secret-that-is-long-enough-32+chars')!
type J = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

describe.skipIf(!TEST_DATABASE_URL)('insurance', () => {
  let db: Db, drop: () => Promise<void>, server: Server, base: string
  const chv = randomUUID(), doctor = randomUUID(), annaLogin = randomUUID(), benLogin = randomUUID()
  const anna = randomUUID(), ben = randomUUID()
  const tok: Record<string, string> = {}

  beforeAll(async () => {
    ;({ db, drop } = await freshDatabase(8))
    server = createApp({ db, instanceId: 't', jwtKey: key, events: { publish: async () => {} }, checkout: null }).listen(0)
    await new Promise((r) => server.once('listening', r))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    await db.withTransaction(SYSTEM_ID, async (q) => {
      for (const [id, role] of [[chv, 'chv'], [doctor, 'doctor']] as const) await q.query('INSERT INTO practitioners (id, full_name, role) VALUES ($1, $2, $3)', [id, `T ${role}`, role])
    })
    tok[chv] = await signToken(key, chv); tok[doctor] = await signToken(key, doctor)
    for (const p of [anna, ben]) await call(chv, 'POST', '/sync/push', { id: p, resourceType: 'Patient', patientId: null, version: 1, baseVersion: null, resource: { resourceType: 'Patient', id: p, name: [{ text: 'Efe Test' }] } })
    await db.withTransaction(SYSTEM_ID, async (q) => {
      for (const [id, p] of [[annaLogin, anna], [benLogin, ben]] as const) await q.query(`INSERT INTO practitioners (id, full_name, role, patient_id) VALUES ($1, 'T patient', 'patient', $2)`, [id, p])
    })
    tok[annaLogin] = await signToken(key, annaLogin); tok[benLogin] = await signToken(key, benLogin)
  })
  afterAll(async () => { server?.close(); await drop?.() })

  async function call(who: string, method: string, path: string, body?: J) {
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${tok[who]}` }, ...(body ? { body: JSON.stringify(body) } : {}) })
    return { http: res.status, body: await res.json().catch(() => null) as any } // eslint-disable-line @typescript-eslint/no-explicit-any
  }
  const payPremium = (who: string, subject: string, extra: J = {}) => call(who, 'POST', '/payments', { id: randomUUID(), purpose: 'insurance_premium', subject_id: subject, network: 'mtn', phone: '+233241234567', ...extra })

  it('lists the plans in the shape the app reads', async () => {
    const r = await call(annaLogin, 'GET', '/insurance/plans')
    expect(r.body).toEqual([
      { id: 'community', name: 'Community plan', monthlyPremium: 10, covers: expect.any(String) },
      { id: 'family', name: 'Family plan', monthlyPremium: 25, covers: expect.any(String) },
    ])
  })
  it('joins, stays the same on a repeat, and keeps the enrolment when the plan changes', async () => {
    expect((await call(annaLogin, 'GET', '/insurance/mine')).body).toBeNull()
    const joined = await call(annaLogin, 'POST', '/insurance/enrol', { plan_id: 'community' })
    expect(joined.http).toBe(200)
    expect(joined.body).toMatchObject({ planId: 'community', since: expect.any(String) })
    const audit = async () => (await db.query(`SELECT count(*)::int AS n FROM audit_trail WHERE table_name = 'insurance_enrolments' AND row_id = $1`, [joined.body.id])).rows[0]!.n
    const before = await audit()
    expect((await call(annaLogin, 'POST', '/insurance/enrol', { plan_id: 'community' })).body).toEqual(joined.body)
    expect(await audit()).toBe(before)
    const changed = await call(annaLogin, 'POST', '/insurance/enrol', { plan_id: 'family' })
    expect(changed.body).toMatchObject({ id: joined.body.id, planId: 'family' })
    expect((await call(annaLogin, 'GET', '/insurance/mine')).body).toEqual(changed.body)
  })
  it('refuses an unknown or missing plan', async () => {
    expect((await call(annaLogin, 'POST', '/insurance/enrol', { plan_id: 'gold' })).http).toBe(404)
    expect((await call(annaLogin, 'POST', '/insurance/enrol', {})).http).toBe(400)
  })
  it('is for patients only, and a patient only ever gets their own', async () => {
    for (const [m, p, b] of [['GET', '/insurance/mine'], ['POST', '/insurance/enrol', { plan_id: 'family' }], ['POST', '/insurance/nhis-check', { member_number: '12345678' }]] as const) {
      expect((await call(doctor, m, p, b)).http).toBe(403)
    }
    expect((await call(benLogin, 'GET', '/insurance/mine')).body).toBeNull()
    expect((await fetch(`${base}/insurance/plans`)).status).toBe(401)
  })
  it('charges what the plan costs, ignoring the caller, and premiums can repeat', async () => {
    const mine = (await call(annaLogin, 'GET', '/insurance/mine')).body
    const first = await payPremium(annaLogin, mine.id, { amount: 0.01 })
    expect(first.http).toBe(201)
    expect(first.body).toMatchObject({ amount: 25, purpose: 'insurance_premium', patientId: anna, simulated: true })
    expect((await payPremium(annaLogin, mine.id)).http).toBe(201)
  })
  it("won't pay on someone else's enrolment, or on one that doesn't exist", async () => {
    const mine = (await call(annaLogin, 'GET', '/insurance/mine')).body
    expect((await payPremium(benLogin, mine.id)).http).toBe(403)
    expect((await payPremium(annaLogin, randomUUID())).http).toBe(404)
  })
  it.each([['1234 5678', 'active'], ['12345670', 'expired'], ['12345679', 'not_found']])('the sandbox NHIS says %s is %s', async (n, status) => {
    expect((await call(annaLogin, 'POST', '/insurance/nhis-check', { member_number: n })).body).toMatchObject({ status, mode: 'sandbox' })
  })
  it.each([['123'], [12345678], [undefined]])('refuses %j as a member number', async (n) => {
    expect((await call(annaLogin, 'POST', '/insurance/nhis-check', { member_number: n })).http).toBe(400)
  })
  it('never lets the database move or delete an enrolment', async () => {
    const mine = (await call(annaLogin, 'GET', '/insurance/mine')).body
    const attempt = (sql: string, args: unknown[]) => db.withTransaction(SYSTEM_ID, (q) => q.query(sql, args)).catch((e) => sqlState(e))
    expect(await attempt('UPDATE insurance_enrolments SET patient_id = $2 WHERE id = $1', [mine.id, ben])).toBe('23514')
    expect(typeof await attempt('DELETE FROM insurance_enrolments WHERE id = $1', [mine.id])).toBe('string')
  })
})
