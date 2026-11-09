import type { AddressInfo } from 'node:net'
import pg from 'pg'
import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { signToken, signingKey } from '../src/auth.js'
import { OUTAGE_LIMITS, dbFromPool, isDatabaseOutage } from '../src/db.js'

const key = signingKey('test-secret-that-is-long-enough-32+chars')!

describe('the database is unreachable', () => {
  it('answers 503 quickly from a protected route, and /health stays up', async () => {
    // Port 1 refuses every connection, standing in for RDS being down.
    const pool = new pg.Pool({ host: '127.0.0.1', port: 1, user: 'x', database: 'x', max: 2, ...OUTAGE_LIMITS })
    const server = createApp({ db: dbFromPool(pool), instanceId: 'test', jwtKey: key, events: { publish: async () => {} } }).listen(0)
    await new Promise((r) => server.once('listening', r))
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const token = await signToken(key, '00000000-0000-4000-8000-000000000001')

    const started = Date.now()
    const res = await fetch(`${url}/patients/00000000-0000-4000-8000-000000000002`, { headers: { authorization: `Bearer ${token}` } })
    expect(res.status).toBe(503)
    expect(res.headers.get('retry-after')).toBe('15')
    expect(await res.json()).toMatchObject({ error: 'unavailable' })
    expect(Date.now() - started).toBeLessThan(6_000)

    expect((await fetch(`${url}/ready`)).status).toBe(503)
    expect((await fetch(`${url}/health`)).status).toBe(200) // the load balancer must not pull a healthy server
    server.close()
    await pool.end()
  })

  it('tells an outage from a real bug', () => {
    expect(isDatabaseOutage({ code: 'ECONNREFUSED' })).toBe(true)
    expect(isDatabaseOutage({ code: '57014' })).toBe(true) // statement took too long
    expect(isDatabaseOutage(new Error('timeout exceeded when trying to connect'))).toBe(true)
    expect(isDatabaseOutage({ code: '23505' })).toBe(false)
    expect(isDatabaseOutage(new TypeError('x is not a function'))).toBe(false)
  })
})
