import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { signToken, signingKey } from '../src/auth.js'
import type { Db } from '../src/db.js'
import { SYSTEM_ID, TEST_DATABASE_URL, freshDatabase } from './pg.js'

const key = signingKey('test-secret-that-is-long-enough-32+chars')!
// The real demo seed: 16 regions x 8 weeks of synthetic totals, plus the planted Ga East cholera outbreak.
const SEED = readFileSync(join(import.meta.dirname, '../../db/seed/surveillance_synthetic.sql'), 'utf8')

describe.skipIf(!TEST_DATABASE_URL)('surveillance (FB-7a)', () => {
  let db: Db
  let drop: () => Promise<void>
  let url: string
  let close: () => void
  const official = randomUUID()
  const doctor = randomUUID()
  let officialToken: string
  let doctorToken: string

  beforeAll(async () => {
    ;({ db, drop } = await freshDatabase())
    await db.withTransaction(SYSTEM_ID, async (q) => {
      await q.query(`INSERT INTO practitioners (id, full_name, role) VALUES ($1, 'Adwoa GHS', 'ghs_official'), ($2, 'Dr Eshun', 'doctor')`, [official, doctor])
    })
    await db.query(SEED)
    officialToken = await signToken(key, official)
    doctorToken = await signToken(key, doctor)
    const server = createApp({ db, instanceId: 'test', jwtKey: key, events: { publish: async () => {} } }).listen(0)
    await new Promise((r) => server.once('listening', r))
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    close = () => server.close()
  })
  afterAll(async () => {
    close?.()
    await drop?.()
  })

  const get = (path: string, token?: string) => fetch(`${url}${path}`, token ? { headers: { authorization: `Bearer ${token}` } } : {})
  const decide = (id: string, body: unknown, token = officialToken) =>
    fetch(`${url}/surveillance/alerts/${id}/decision`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
    })

  it('gives an official this week\'s totals, labelled synthetic, with no patient in sight', async () => {
    const res = await get('/surveillance/summary', officialToken)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.week_start).toBe('2026-11-02')
    expect(body.synthetic).toBe(true)
    expect(new Set(body.totals.map((t: { region: string }) => t.region)).size).toBe(16)
    expect(JSON.stringify(body)).not.toMatch(/patient/i)
  })

  it('narrows the totals to one region', async () => {
    const body = await (await get('/surveillance/summary?region=Greater%20Accra', officialToken)).json()
    expect(new Set(body.totals.map((t: { district: string }) => t.district))).toEqual(new Set(['Ga East', 'Ga West', 'Adenta', 'Shai-Osudoku']))
    expect(body.totals).toContainEqual(expect.objectContaining({ district: 'Ga East', condition: 'cholera', case_count: 12 }))
  })

  it('refuses a doctor (403) and someone not signed in (401)', async () => {
    expect((await get('/surveillance/summary', doctorToken)).status).toBe(403)
    expect((await get('/surveillance/alerts', doctorToken)).status).toBe(403)
    expect((await get('/surveillance/summary')).status).toBe(401)
  })

  it('turns the Ga East signal into exactly one suggested alert, however often the list is opened', async () => {
    const first = await (await get('/surveillance/alerts', officialToken)).json()
    const second = await (await get('/surveillance/alerts', officialToken)).json()
    expect(second.alerts).toHaveLength(1)
    expect(second.alerts[0]).toMatchObject({ district: 'Ga East', condition: 'cholera', case_count: 12, baseline: 3, status: 'suggested' })
    expect(second.alerts[0].reason).toMatch(/12 cases of cholera in Ga East/)
    expect(second.alerts[0].id).toBe(first.alerts[0].id)
  })

  it('rejects a bad decision (400), a malformed id (400) and an unknown alert (404)', async () => {
    const [alert] = (await (await get('/surveillance/alerts', officialToken)).json()).alerts
    expect((await decide(alert.id, { decision: 'maybe' })).status).toBe(400)
    expect((await decide('42', { decision: 'confirmed' })).status).toBe(400)
    expect((await decide(randomUUID(), { decision: 'confirmed' })).status).toBe(404)
  })

  it('does not let a doctor decide', async () => {
    const [alert] = (await (await get('/surveillance/alerts', officialToken)).json()).alerts
    expect((await decide(alert.id, { decision: 'confirmed' }, doctorToken)).status).toBe(403)
  })

  it('lets the official confirm: the community alert goes out in test mode, and the decision then stands', async () => {
    const [alert] = (await (await get('/surveillance/alerts', officialToken)).json()).alerts
    const res = await decide(alert.id, { decision: 'confirmed', note: 'Matches two CHPS reports' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ status: 'confirmed', test_mode: true })
    expect(body.alert_sent_at).not.toBeNull()

    const again = await decide(alert.id, { decision: 'dismissed' })
    expect(again.status).toBe(409)
    expect((await again.json()).error).toBe('already_decided')

    const row = (await db.query('SELECT decided_by FROM outbreak_alerts WHERE id = $1', [alert.id])).rows[0]
    expect(row.decided_by).toBe(official) // from the verified login, not the request
  })
})
