import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import express from 'express'
import { SignJWT } from 'jose'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { requireActor, signToken, signingKey } from '../src/auth.js'
import type { Db } from '../src/db.js'
import { SYSTEM_ID, TEST_DATABASE_URL, freshDatabase } from './pg.js'

const SECRET = 'test-secret-that-is-long-enough-32+chars'
const key = signingKey(SECRET)!

describe('signingKey', () => {
  it('refuses a short secret, and gives no key when none is set', () => {
    expect(() => signingKey('too-short')).toThrow(/at least 32/)
    expect(signingKey(null)).toBeNull()
  })
})

describe.skipIf(!TEST_DATABASE_URL)('requireActor', () => {
  let db: Db
  let drop: () => Promise<void>
  let url: string
  let close: () => void
  let nurse: string
  let retired: string

  beforeAll(async () => {
    ;({ db, drop } = await freshDatabase())
    nurse = randomUUID()
    retired = randomUUID()
    await db.withTransaction(SYSTEM_ID, async (q) => {
      await q.query(`INSERT INTO practitioners (id, full_name, role) VALUES ($1, 'Nurse Ama', 'nurse')`, [nurse])
      await q.query(`INSERT INTO practitioners (id, full_name, role, active) VALUES ($1, 'Retired CHV', 'chv', false)`, [retired])
    })
    const app = express()
    app.get('/who', requireActor(key, db), (_req, res) => void res.json(res.locals.actor))
    app.get('/nokey', requireActor(null, db), (_req, res) => void res.json(res.locals.actor))
    const server = app.listen(0)
    await new Promise((r) => server.once('listening', r))
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    close = () => server.close()
  })
  afterAll(async () => {
    close?.()
    await drop?.()
  })

  const call = (path: string, auth?: string) => fetch(url + path, auth ? { headers: { authorization: auth } } : {})
  const status = async (path: string, auth?: string) => (await call(path, auth)).status

  it('lets a valid token for an active practitioner through, as that practitioner', async () => {
    const res = await call('/who', `Bearer ${await signToken(key, nurse)}`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: nurse, role: 'nurse' })
  })

  it('refuses no header, or a header that is not a bearer token', async () => {
    expect(await status('/who')).toBe(401)
    expect(await status('/who', `Basic ${btoa('a:b')}`)).toBe(401)
    expect(await status('/who', 'Bearer ')).toBe(401)
  })

  it('refuses garbage, a wrong key, an expired token and the wrong issuer', async () => {
    expect(await status('/who', 'Bearer not.a.jwt')).toBe(401)
    const otherKey = signingKey('another-secret-that-is-also-long-enough!!')!
    expect(await status('/who', `Bearer ${await signToken(otherKey, nurse)}`)).toBe(401)
    const expired = await signToken(key, nurse, Math.floor(Date.now() / 1000) - 60)
    expect(await status('/who', `Bearer ${expired}`)).toBe(401)
    const wrongIssuer = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject(nurse).setIssuer('someone-else')
      .setExpirationTime('1h').sign(key)
    expect(await status('/who', `Bearer ${wrongIssuer}`)).toBe(401)
  })

  it('refuses an unsigned ("alg: none") token claiming to be the nurse', async () => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
    const unsigned = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: nurse, iss: 'healthconnect', exp: 9999999999 })}.`
    expect(await status('/who', `Bearer ${unsigned}`)).toBe(401)
  })

  it('refuses a subject that is not a UUID with 401, not a database error', async () => {
    expect(await status('/who', `Bearer ${await signToken(key, "x'; DROP TABLE patients;--")}`)).toBe(401)
  })

  it('refuses a practitioner who does not exist, or is no longer active', async () => {
    expect(await status('/who', `Bearer ${await signToken(key, randomUUID())}`)).toBe(401)
    expect(await status('/who', `Bearer ${await signToken(key, retired)}`)).toBe(401)
  })

  it('refuses everything when the server has no signing key (fails closed)', async () => {
    expect(await status('/nokey', `Bearer ${await signToken(key, nurse)}`)).toBe(401)
  })
})
