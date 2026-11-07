import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { decodeJwt } from 'jose'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TEST_USERS, seedTestUsers } from '../scripts/seed-test-users.js'
import { createApp } from '../src/app.js'
import { signingKey } from '../src/auth.js'
import type { Db } from '../src/db.js'
import { hashPassword, verifyPassword } from '../src/passwords.js'
import { appRole } from '../src/roles.js'
import { SYSTEM_ID, TEST_DATABASE_URL, freshDatabase } from './pg.js'

const key = signingKey('test-secret-that-is-long-enough-32+chars')!
const PASSWORD = 'correct-horse-battery'
const APP = 'https://app-hc.agroconnect.space'

describe('passwords and role names', () => {
  it('checks a password against its hash, never storing it', async () => {
    const hash = await hashPassword('secret-one')
    expect(hash).not.toContain('secret-one')
    expect(await verifyPassword('secret-one', hash)).toBe(true)
    expect(await verifyPassword('secret-two', hash)).toBe(false)
    expect(await verifyPassword('secret-one', 'not-a-hash')).toBe(false)
  })
  it('translates every database role to the app name, and gives system none', () => {
    expect(['nurse', 'doctor', 'specialist'].map(appRole)).toEqual(['clinician', 'clinician', 'clinician'])
    expect(appRole('traditional_healer')).toBe('healer')
    expect(appRole('health_centre_admin')).toBe('facility_admin')
    expect(appRole('ghs_official')).toBe('ghs')
    expect(appRole('admin')).toBe('platform_admin')
    expect(appRole('system')).toBeNull()
  })
  it('refuses a short seed password', async () => {
    await expect(seedTestUsers({} as Db, 'short')).rejects.toThrow(/12 characters/)
  })
})

describe.skipIf(!TEST_DATABASE_URL)('sign-in', () => {
  let db: Db
  let drop: () => Promise<void>
  let url: string
  let close: () => void

  beforeAll(async () => {
    ;({ db, drop } = await freshDatabase())
    await seedTestUsers(db, PASSWORD)
    await seedTestUsers(db, PASSWORD) // running it twice is safe
    const server = createApp({ db, instanceId: 'test', jwtKey: key, events: { publish: async () => {} } }).listen(0)
    await new Promise((r) => server.once('listening', r))
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    close = () => server.close()
  })
  afterAll(async () => {
    close?.()
    await drop?.()
  })

  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(url + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
  const login = (username: string, password = PASSWORD) => post('/auth/login', { username, password })
  const tokens = async (username: string) => (await (await login(username)).json()) as { token: string; refreshToken: string; user: Record<string, unknown> }
  const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } })
  const lastEvent = async () => (await db.query('SELECT practitioner_id, outcome FROM login_events ORDER BY id DESC LIMIT 1')).rows[0]

  it('signs in all eight roles, with the app role in the reply and the token', async () => {
    const seen = new Set<unknown>()
    for (const u of TEST_USERS) {
      const res = await login(u.username)
      expect(res.status, u.username).toBe(200)
      expect(res.headers.get('cache-control')).toBe('no-store')
      const body = await res.json() as { token: string; user: { id: string; role: string }; mode: string }
      expect(body.user).toMatchObject({ id: u.id, name: u.name, role: u.username })
      expect(body.mode).toBe('live')
      expect(decodeJwt(body.token)).toMatchObject({ sub: u.id, role: u.username, iss: 'healthconnect' })
      seen.add(body.user.role)
      expect(await lastEvent()).toEqual({ practitioner_id: u.id, outcome: 'success' })
    }
    expect([...seen].sort()).toEqual(['chv', 'clinician', 'facility_admin', 'ghs', 'healer', 'patient', 'pharmacist', 'platform_admin'])
  })

  it('never returns the password or its hash', async () => {
    const text = await (await login('chv')).text()
    expect(text).not.toContain(PASSWORD)
    expect(text).not.toContain('scrypt')
  })

  it('refuses a wrong password and an unknown user the same way, and records both', async () => {
    const wrong = await login('ghs', 'not-the-password')
    const unknown = await login('nobody-here', 'not-the-password')
    expect(wrong.status).toBe(401)
    expect(unknown.status).toBe(401)
    expect(await wrong.json()).toEqual(await unknown.json())
    expect(await lastEvent()).toEqual({ practitioner_id: null, outcome: 'unknown_user' })
  })

  it.each([
    [{}], [{ username: 'chv' }], [{ password: 'x' }], [{ username: '', password: 'x' }],
    [{ username: 123, password: 'x' }], [{ username: 'chv', password: 'x'.repeat(201) }],
  ])('answers 400 to bad input %#', async (body) => {
    expect((await post('/auth/login', body)).status).toBe(400)
  })

  it('locks after five wrong passwords, even for the right one, and a reseed unlocks', async () => {
    for (let i = 0; i < 5; i++) expect((await login('healer', 'wrong-password-here')).status).toBe(401)
    const locked = await login('healer')
    expect(locked.status).toBe(429)
    expect((await locked.json() as { error: string }).error).toBe('locked')
    expect(await lastEvent()).toMatchObject({ outcome: 'locked' })
    await seedTestUsers(db, PASSWORD)
    expect((await login('healer')).status).toBe(200)
  })

  it('a good password clears the count of wrong ones', async () => {
    for (let round = 0; round < 2; round++) {
      for (let i = 0; i < 4; i++) await login('pharmacist', 'wrong-password-here')
      expect((await login('pharmacist')).status).toBe(200)
    }
  })

  it('refuses a deactivated account, and its open refresh token', async () => {
    const id = randomUUID()
    await db.withTransaction(SYSTEM_ID, async (q) => {
      await q.query(`INSERT INTO practitioners (id, full_name, role) VALUES ($1, 'Leaving Nurse', 'nurse')`, [id])
      await q.query(`INSERT INTO practitioner_credentials (practitioner_id, username, password_hash) VALUES ($1, 'leaving', $2)`, [id, await hashPassword(PASSWORD)])
    })
    const { refreshToken, user } = await tokens('leaving')
    expect(user.role).toBe('clinician')
    await db.withTransaction(SYSTEM_ID, (q) => q.query('UPDATE practitioners SET active = false WHERE id = $1', [id]))
    expect((await login('leaving')).status).toBe(401)
    expect(await lastEvent()).toEqual({ practitioner_id: id, outcome: 'inactive' })
    expect((await post('/auth/refresh', { refreshToken })).status).toBe(401)
  })

  it('swaps a refresh token for a new sign-in, and stores only its hash', async () => {
    const first = await tokens('chv')
    const res = await post('/auth/refresh', { refreshToken: first.refreshToken })
    expect(res.status).toBe(200)
    const next = await res.json() as { token: string; refreshToken: string; user: { role: string } }
    expect(next.user.role).toBe('chv')
    expect(next.refreshToken).not.toBe(first.refreshToken)
    expect((await fetch(`${url}/auth/me`, bearer(next.token))).status).toBe(200)
    const stored = await db.query('SELECT 1 FROM refresh_tokens WHERE token_hash = $1', [first.refreshToken])
    expect(stored.rows).toHaveLength(0)
  })

  it('treats a reused refresh token as theft: every open sign-in for that person ends', async () => {
    const first = await tokens('clinician')
    const other = await tokens('clinician')
    expect((await post('/auth/refresh', { refreshToken: first.refreshToken })).status).toBe(200)
    expect((await post('/auth/refresh', { refreshToken: first.refreshToken })).status).toBe(401)
    expect((await post('/auth/refresh', { refreshToken: other.refreshToken })).status).toBe(401)
  })

  it('refuses a made-up, missing or expired refresh token', async () => {
    expect((await post('/auth/refresh', { refreshToken: 'made-up' })).status).toBe(401)
    expect((await post('/auth/refresh', {})).status).toBe(400)
    const { refreshToken } = await tokens('ghs')
    await db.query(`UPDATE refresh_tokens SET expires_at = now() - interval '1 minute' WHERE practitioner_id = $1 AND used_at IS NULL`, [TEST_USERS.find((u) => u.username === 'ghs')!.id])
    expect((await post('/auth/refresh', { refreshToken })).status).toBe(401)
  })

  it('signing out ends the refresh token; it says nothing about made-up ones', async () => {
    const { refreshToken } = await tokens('facility_admin')
    expect((await post('/auth/logout', { refreshToken })).status).toBe(204)
    expect((await post('/auth/refresh', { refreshToken })).status).toBe(401)
    expect((await post('/auth/logout', { refreshToken: 'made-up' })).status).toBe(204)
  })

  it('answers 503 to sign-in when no signing key is set, instead of crashing', async () => {
    const server = createApp({ db, instanceId: 'test', jwtKey: null, events: { publish: async () => {} } }).listen(0)
    await new Promise((r) => server.once('listening', r))
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const res = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'chv', password: PASSWORD }) })
    server.close()
    expect(res.status).toBe(503)
  })

  describe('wrong role, enforced on the server', () => {
    const patientRecord = TEST_USERS.find((u) => u.username === 'patient')!.patientId!
    const open = async (username: string, id = patientRecord) => (await fetch(`${url}/patients/${id}`, bearer((await tokens(username)).token))).status

    it('lets a clinician and the CHV open a record', async () => {
      expect(await open('clinician')).toBe(200)
      expect(await open('chv')).toBe(200)
    })
    it('refuses a pharmacist, healer, GHS official and health centre admin with 403', async () => {
      for (const role of ['pharmacist', 'healer', 'ghs', 'facility_admin']) expect(await open(role), role).toBe(403)
    })
    it('lets a patient open only their own record', async () => {
      expect(await open('patient')).toBe(200)
      const someoneElse = randomUUID()
      await db.withTransaction(SYSTEM_ID, (q) => q.query(`INSERT INTO patients (id, full_name) VALUES ($1, 'Other Patient')`, [someoneElse]))
      expect(await open('patient', someoneElse)).toBe(403)
      const log = await db.query(`SELECT outcome FROM access_log WHERE patient_id = $1`, [someoneElse])
      expect(log.rows).toEqual([{ outcome: 'denied' }])
    })
  })

  describe('CORS', () => {
    it('allows the live app, including the browser preflight', async () => {
      const pre = await fetch(`${url}/auth/login`, { method: 'OPTIONS', headers: { origin: APP, 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,content-type' } })
      expect(pre.status).toBe(204)
      expect(pre.headers.get('access-control-allow-origin')).toBe(APP)
      expect(pre.headers.get('access-control-allow-headers')).toMatch(/Authorization/)
      expect((await fetch(`${url}/health`, { headers: { origin: APP } })).headers.get('access-control-allow-origin')).toBe(APP)
    })
    it('gives another website nothing, and never a wildcard', async () => {
      const res = await fetch(`${url}/health`, { headers: { origin: 'https://evil.example' } })
      expect(res.headers.get('access-control-allow-origin')).toBeNull()
      const pre = await fetch(`${url}/auth/login`, { method: 'OPTIONS', headers: { origin: 'https://evil.example' } })
      expect(pre.headers.get('access-control-allow-origin')).toBeNull()
    })
    it('takes extra origins from settings, e.g. a laptop dev server', async () => {
      const server = createApp({ db, instanceId: 'test', jwtKey: key, events: { publish: async () => {} }, corsOrigins: ['http://localhost:5173'] }).listen(0)
      await new Promise((r) => server.once('listening', r))
      const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/health`, { headers: { origin: 'http://localhost:5173' } })
      server.close()
      expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
    })
  })
})
