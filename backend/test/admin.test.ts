import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TEST_USERS, seedTestUsers } from '../scripts/seed-test-users.js'
import { createApp } from '../src/app.js'
import { signToken, signingKey } from '../src/auth.js'
import type { Db } from '../src/db.js'
import { SYSTEM_ID, TEST_DATABASE_URL, freshDatabase } from './pg.js'

const key = signingKey('test-secret-that-is-long-enough-32+chars')!
const PASSWORD = 'correct-horse-battery'
type J = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const id = (u: string) => TEST_USERS.find((x) => x.username === u)!.id

describe.skipIf(!TEST_DATABASE_URL)('platform admin', () => {
  let db: Db
  let drop: () => Promise<void>
  let url: string
  let close: () => void
  const tok: Record<string, string> = {}
  beforeAll(async () => {
    ;({ db, drop } = await freshDatabase())
    await seedTestUsers(db, PASSWORD)
    for (const u of TEST_USERS) tok[u.username] = await signToken(key, u.id)
    const server = createApp({ db, instanceId: 't', jwtKey: key, events: { publish: async () => {} }, authRatePerMinute: 10_000 }).listen(0)
    await new Promise((r) => server.once('listening', r))
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    close = () => server.close()
  })
  afterAll(async () => { close?.(); await drop?.() })

  const get = async (who: string, path: string) => {
    const res = await fetch(url + path, { headers: { authorization: `Bearer ${tok[who]}` } })
    return { http: res.status, body: await res.json().catch(() => null) as any } // eslint-disable-line @typescript-eslint/no-explicit-any
  }
  const post = async (who: string, path: string) => (await fetch(url + path, { method: 'POST', headers: { authorization: `Bearer ${tok[who]}` } })).status
  const login = (username: string) => fetch(`${url}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password: PASSWORD }) })

  it.each(['chv', 'patient', 'clinician', 'pharmacist', 'healer', 'ghs', 'facility_admin'])('refuses %s everywhere', async (who) => {
    for (const path of ['/admin/users', '/admin/audit', '/admin/revenue']) expect((await get(who, path)).http, path).toBe(403)
    expect(await post(who, `/admin/users/${id('chv')}/deactivate`)).toBe(403)
  })
  it('refuses no sign-in', async () => {
    expect((await fetch(`${url}/admin/users`)).status).toBe(401)
  })

  it('lists everyone with the app role, never the system account or a password hash', async () => {
    const { http, body } = await get('platform_admin', '/admin/users')
    expect(http).toBe(200)
    expect(body.map((u: J) => u.name)).not.toContain('HealthConnect system (migrations)')
    expect(body.find((u: J) => u.id === id('healer'))).toMatchObject({ role: 'healer', databaseRole: 'traditional_healer', active: true, username: 'healer', locked: false })
    expect(JSON.stringify(body)).not.toContain('scrypt')
    await login('chv')
    const again = await get('platform_admin', '/admin/users')
    expect(again.body.find((u: J) => u.id === id('chv')).lastSignIn).toEqual(expect.any(String))
  })

  it('switching an account off works at once: token, refresh and sign-in all stop; on again restores it', async () => {
    const signedIn = await (await login('ghs')).json() as { token: string; refreshToken: string }
    expect(await post('platform_admin', `/admin/users/${id('ghs')}/deactivate`)).toBe(204)
    expect((await fetch(`${url}/auth/me`, { headers: { authorization: `Bearer ${signedIn.token}` } })).status).toBe(401)
    expect((await fetch(`${url}/auth/refresh`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: signedIn.refreshToken }) })).status).toBe(401)
    expect((await login('ghs')).status).toBe(401)
    expect(await post('platform_admin', `/admin/users/${id('ghs')}/activate`)).toBe(204)
    expect((await login('ghs')).status).toBe(200)
    expect((await db.query('SELECT updated_by FROM practitioners WHERE id = $1', [id('ghs')])).rows[0]!.updated_by).toBe(id('platform_admin')) // who did it is on record
  })
  it('stops an admin locking themselves out, and answers cleanly to bad or unknown ids', async () => {
    expect(await post('platform_admin', `/admin/users/${id('platform_admin')}/deactivate`)).toBe(409)
    expect(await post('platform_admin', '/admin/users/nope/deactivate')).toBe(400)
    expect(await post('platform_admin', `/admin/users/${randomUUID()}/deactivate`)).toBe(404)
    expect(await post('platform_admin', `/admin/users/00000000-0000-0000-0000-000000000000/deactivate`)).toBe(404)
  })

  it('shows who did what, filters by outcome, pages, and holds no health data', async () => {
    const patient = TEST_USERS.find((u) => u.username === 'patient')!.patientId!
    await get('clinician', `/patients/${patient}`)
    await get('pharmacist', `/patients/${patient}`)
    const { body } = await get('platform_admin', '/admin/audit')
    expect(body.items.find((i: J) => i.who === 'Efua Darko')).toMatchObject({ role: 'pharmacist', resourceType: 'Patient', action: 'read', outcome: 'denied', patientId: patient })
    expect(JSON.stringify(body)).not.toContain('Akosua Boateng')
    expect(body.signInsLast7Days.find((s: J) => s.outcome === 'success').n).toBeGreaterThan(0)
    const denied = await get('platform_admin', '/admin/audit?outcome=denied')
    expect(denied.body.items.every((i: J) => i.outcome === 'denied')).toBe(true)
    const old = await get('platform_admin', '/admin/audit?before=2000-01-01T00:00:00Z')
    expect(old.body.items).toEqual([])
    expect((await get('platform_admin', '/admin/audit?outcome=nope')).http).toBe(400)
    expect((await get('platform_admin', '/admin/audit?before=nope')).http).toBe(400)
  })

  it('counts only successful payments, and keeps simulated money apart from real', async () => {
    expect((await get('platform_admin', '/admin/revenue')).body).toEqual({ currency: 'GHS', lines: [], pending: 0 })
    const patient = TEST_USERS.find((u) => u.username === 'patient')!.patientId!
    const insert = (provider: string, status: string, amount: number) => db.withTransaction(SYSTEM_ID, (q) => q.query(
      `INSERT INTO payments (id, patient_id, purpose, subject_id, amount, network, provider, status) VALUES ($1, $2, 'insurance_premium', $3, $4, 'mtn', $5, $6)`,
      [randomUUID(), patient, randomUUID(), amount, provider, status],
    ))
    await insert('simulated', 'successful', 10); await insert('simulated', 'successful', 10); await insert('votex365', 'successful', 7); await insert('votex365', 'failed', 100); await insert('votex365', 'pending', 100)
    const { body } = await get('platform_admin', '/admin/revenue')
    expect(body.lines).toEqual([
      { purpose: 'insurance_premium', simulated: true, payments: 2, total: 20 },
      { purpose: 'insurance_premium', simulated: false, payments: 1, total: 7 },
    ])
    expect(body.pending).toBe(1)
  })
})
