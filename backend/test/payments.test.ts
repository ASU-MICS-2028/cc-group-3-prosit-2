import { createHmac, randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app.js'
import { signToken, signingKey } from '../src/auth.js'
import type { Db } from '../src/db.js'
import { CONSULTATION_FEE } from '../src/routes/payments.js'
import { ProviderUnavailable, votexProvider, type CheckoutProvider } from '../src/votex.js'
import { SYSTEM_ID, TEST_DATABASE_URL, freshDatabase } from './pg.js'

const key = signingKey('test-secret-that-is-long-enough-32+chars')!
const WEBHOOK_SECRET = 'whsec_test_only'
type J = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const signed = (raw: string, atMs = Date.now()) => {
  const timestamp = String(Math.floor(atMs / 1000))
  return { 'x-votex-webhook-timestamp': timestamp, 'x-votex-webhook-signature': createHmac('sha256', WEBHOOK_SECRET).update(`${timestamp}.`).update(raw).digest('hex') }
}

describe('the votex365 client', () => {
  const provider = votexProvider('https://votex.test', 'https://app/', async () => ({ api_key: 'k', webhook_secret: WEBHOOK_SECRET }))
  const raw = JSON.stringify({ event: 'payment.succeeded', data: { id: 'vx1', reference: 'r1', status: 'paid' } })

  it('accepts a correct signature, and tells success from failure', async () => {
    expect(await provider.verifyWebhook(Buffer.from(raw), signed(raw), Date.now())).toEqual({ providerRef: 'vx1', reference: 'r1', status: 'successful' })
    const failed = JSON.stringify({ event: 'payment.failed', data: { id: 'vx1', reference: 'r1' } })
    expect(await provider.verifyWebhook(Buffer.from(failed), signed(failed), Date.now())).toMatchObject({ status: 'failed' })
  })
  it('refuses a wrong signature, changed bytes, a missing signature, and an old replay', async () => {
    const h = signed(raw)
    expect(await provider.verifyWebhook(Buffer.from(raw), { ...h, 'x-votex-webhook-signature': 'ab'.repeat(32) }, Date.now())).toBeNull()
    expect(await provider.verifyWebhook(Buffer.from(raw.replace('succeeded', 'failed')), h, Date.now())).toBeNull()
    expect(await provider.verifyWebhook(Buffer.from(raw), {}, Date.now())).toBeNull()
    expect(await provider.verifyWebhook(Buffer.from(raw), signed(raw, Date.now() - 6 * 60_000), Date.now())).toBeNull()
  })
  it('ignores a genuine event it has no use for, and a body that is not JSON', async () => {
    const other = JSON.stringify({ event: 'something.else', data: { id: 'x' } })
    expect(await provider.verifyWebhook(Buffer.from(other), signed(other), Date.now())).toBe('ignored')
    expect(await provider.verifyWebhook(Buffer.from('nope'), signed('nope'), Date.now())).toBe('ignored')
  })
  it('sends the key, reads the reply, and treats any failure as unavailable', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ id: 'vx1', reference: 'r', status: 'pending', checkout_url: 'https://pay/1' }), { status: 201 }))
    vi.stubGlobal('fetch', f)
    expect(await provider.create({ reference: 'r', amount: 25, description: 'd', customer: { phone: '+233241234567' }, metadata: {} })).toEqual({ providerRef: 'vx1', checkoutUrl: 'https://pay/1', status: 'pending' })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://votex.test/payments')
    expect((init.headers as J).Authorization).toBe('Bearer k')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })))
    await expect(provider.status('vx1')).rejects.toBeInstanceOf(ProviderUnavailable)
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down') }))
    await expect(provider.status('vx1')).rejects.toBeInstanceOf(ProviderUnavailable)
    vi.unstubAllGlobals()
    const noKey = votexProvider('https://votex.test', 'https://app/', async () => null)
    await expect(noKey.status('x')).rejects.toBeInstanceOf(ProviderUnavailable)
  })
})

describe.skipIf(!TEST_DATABASE_URL)('payments', () => {
  let db: Db
  let drop: () => Promise<void>
  const chv = randomUUID(), other = randomUUID(), doctor = randomUUID(), patientLogin = randomUUID(), admin = randomUUID(), ghs = randomUUID()
  const tok: Record<string, string> = {}
  const servers: (() => void)[] = []
  let simulated: string, live: string
  let down = false
  const fake: CheckoutProvider = {
    create: vi.fn(async (r) => { if (down) throw new ProviderUnavailable('down'); return { providerRef: `vx-${r.reference}`, checkoutUrl: `https://pay.test/${r.reference}`, status: 'pending' as const } }),
    status: vi.fn(async () => 'successful' as const),
    verifyWebhook: votexProvider('x', 'x', async () => ({ api_key: 'k', webhook_secret: WEBHOOK_SECRET })).verifyWebhook,
  }
  const start = async (checkout: CheckoutProvider | null) => {
    const server = createApp({ db, instanceId: 't', jwtKey: key, events: { publish: async () => {} }, checkout }).listen(0)
    await new Promise((r) => server.once('listening', r))
    servers.push(() => server.close())
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  }
  beforeAll(async () => {
    ;({ db, drop } = await freshDatabase(12))
    await db.withTransaction(SYSTEM_ID, async (q) => {
      for (const [id, role] of [[chv, 'chv'], [other, 'chv'], [doctor, 'doctor'], [admin, 'admin'], [ghs, 'ghs_official']] as const) {
        await q.query('INSERT INTO practitioners (id, full_name, role) VALUES ($1, $2, $3)', [id, `T ${role}`, role]); tok[id] = await signToken(key, id)
      }
    })
    simulated = await start(null); live = await start(fake)
  })
  afterAll(async () => { servers.forEach((s) => s()); await drop?.() })

  const call = async (base: string, who: string, method: string, path: string, body?: J) => {
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${tok[who]}` }, ...(body ? { body: JSON.stringify(body) } : {}) })
    return { http: res.status, body: await res.json().catch(() => null) as any } // eslint-disable-line @typescript-eslint/no-explicit-any
  }
  let slot = 0
  const visit = async () => {
    const p = randomUUID(), a = randomUUID()
    const t = new Date(Date.UTC(2027, 2, 1, 8) + (slot++) * 3_600_000)
    const send = (r: J) => call(simulated, chv, 'POST', '/sync/push', { id: r.id, resourceType: r.resourceType, patientId: null, version: 1, baseVersion: null, resource: r })
    await send({ resourceType: 'Patient', id: p, name: [{ text: 'Efe Test' }] })
    await send({ resourceType: 'Appointment', id: a, status: 'booked', start: t.toISOString(), end: new Date(t.getTime() + 1_800_000).toISOString(), participant: [{ actor: { reference: `Patient/${p}` } }, { actor: { reference: `Practitioner/${doctor}` } }] })
    return { p, a }
  }
  const pay = (base: string, who: string, a: string, extra: J = {}) => call(base, who, 'POST', '/payments', { id: randomUUID(), purpose: 'consultation_fee', subject_id: a, network: 'mtn', phone: '+233241234567', ...extra })

  it('takes the amount from the server, ignoring what the caller sends, and never stores the phone', async () => {
    const { a } = await visit()
    const r = await pay(simulated, chv, a, { amount: 0.01 })
    expect(r.http).toBe(201)
    expect(r.body).toMatchObject({ amount: CONSULTATION_FEE, currency: 'GHS', status: 'pending', simulated: true, testMode: true })
    const row = (await db.query('SELECT * FROM payments WHERE id = $1', [r.body.id])).rows[0]!
    expect(JSON.stringify(row)).not.toContain('233241234567')
  })
  it('simulates success after a moment, and a failure for a phone ending in 0000, with a retry allowed', async () => {
    const { a } = await visit()
    const failed = await pay(simulated, chv, a, { phone: '+233240000000' })
    expect(failed.body.status).toBe('failed')
    const ok = await pay(simulated, chv, a)
    await db.withTransaction(SYSTEM_ID, (q) => q.query(`ALTER TABLE payments DISABLE TRIGGER payments_audit_trg`).then(() => q.query(`UPDATE payments SET created_at = now() - interval '10 seconds' WHERE id = $1`, [ok.body.id])).then(() => q.query(`ALTER TABLE payments ENABLE TRIGGER payments_audit_trg`)))
    expect((await call(simulated, chv, 'GET', `/payments/${ok.body.id}`)).body.status).toBe('successful')
  })
  it('gives the same payment for the same id, with no second charge', async () => {
    const { a } = await visit()
    const id = randomUUID()
    const one = await pay(live, chv, a, { id }), two = await pay(live, chv, a, { id })
    expect([one.http, two.http]).toEqual([201, 200])
    expect(two.body.checkoutUrl).toBe(one.body.checkoutUrl)
    expect((await db.query('SELECT count(*)::int AS n FROM payments WHERE id = $1', [id])).rows[0]!.n).toBe(1)
  })
  it('refuses a second fee for one visit through a new id, and when two arrive at once', async () => {
    const { a } = await visit()
    expect((await pay(simulated, chv, a)).http).toBe(201)
    expect(await pay(simulated, chv, a)).toMatchObject({ http: 409, body: { error: 'already_paid' } })
    const b = await visit()
    const both = await Promise.all([pay(simulated, chv, b.a), pay(simulated, chv, b.a)])
    expect(both.map((r) => r.http).sort()).toEqual([201, 409])
  })
  it('keeps the payment when votex365 is down, answers 503, and a retry opens the checkout', async () => {
    const { a } = await visit()
    const id = randomUUID()
    down = true
    const first = await pay(live, chv, a, { id })
    down = false
    expect(first.http).toBe(503)
    expect((await db.query('SELECT status, checkout_url FROM payments WHERE id = $1', [id])).rows[0]).toEqual({ status: 'pending', checkout_url: null })
    const retry = await pay(live, chv, a, { id })
    expect(retry.http).toBe(200)
    expect(retry.body.checkoutUrl).toBe(`https://pay.test/${id}`)
  })
  it('settles through a signed webhook only, and a finished payment stays finished', async () => {
    const { a } = await visit()
    const r = await pay(live, chv, a)
    const send = (raw: string, headers: J) => fetch(`${live}/webhooks/votex365`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: raw })
    const paid = JSON.stringify({ event: 'payment.succeeded', data: { id: `vx-${r.body.id}`, reference: r.body.id, status: 'paid' } })
    expect((await send(paid, { 'x-votex-webhook-signature': 'ab'.repeat(32), 'x-votex-webhook-timestamp': String(Math.floor(Date.now() / 1000)) })).status).toBe(401)
    expect((await db.query('SELECT status FROM payments WHERE id = $1', [r.body.id])).rows[0]!.status).toBe('pending')
    expect((await send(paid, signed(paid))).status).toBe(200)
    expect((await send(paid, signed(paid))).status).toBe(200) // they repeat webhooks
    const failedLater = JSON.stringify({ event: 'payment.failed', data: { id: `vx-${r.body.id}`, reference: r.body.id } })
    expect((await send(failedLater, signed(failedLater))).status).toBe(200)
    const after = await call(live, chv, 'GET', `/payments/${r.body.id}`)
    expect(after.body.status).toBe('successful')
    expect(after.body.checkoutUrl).toBeNull()
    await expect(db.withTransaction(SYSTEM_ID, (q) => q.query(`UPDATE payments SET amount = 1 WHERE id = $1`, [r.body.id]))).rejects.toThrow(/cannot be edited/)
    await expect(db.withTransaction(SYSTEM_ID, (q) => q.query(`DELETE FROM payments WHERE id = $1`, [r.body.id]))).rejects.toThrow(/cannot be deleted/)
  })
  it('asks votex365 when the webhook has not come, for a payment past the recheck time', async () => {
    const { a } = await visit()
    const r = await pay(live, chv, a)
    await db.withTransaction(SYSTEM_ID, async (q) => {
      await q.query('ALTER TABLE payments DISABLE TRIGGER payments_audit_trg')
      await q.query(`UPDATE payments SET updated_at = now() - interval '1 minute' WHERE id = $1`, [r.body.id])
      await q.query('ALTER TABLE payments ENABLE TRIGGER payments_audit_trg')
    })
    expect((await call(live, chv, 'GET', `/payments/${r.body.id}`)).body.status).toBe('successful')
  })
  it('answers 404 to a webhook when no provider is set, whatever it says', async () => {
    expect((await fetch(`${simulated}/webhooks/votex365`, { method: 'POST', body: '{}' })).status).toBe(404)
  })

  describe('who may pay and see', () => {
    it('refuses another CHV, a doctor and a GHS official', async () => {
      const { a } = await visit()
      for (const who of [other, doctor, ghs]) expect((await pay(simulated, who, a)).http).toBe(403)
    })
    it('lets a patient pay their own fee and see it; not someone else\'s', async () => {
      const mine = await visit(), theirs = await visit()
      await db.withTransaction(SYSTEM_ID, (q) => q.query(`INSERT INTO practitioners (id, full_name, role, patient_id) VALUES ($1, 'Efe', 'patient', $2)`, [patientLogin, mine.p]))
      tok[patientLogin] = await signToken(key, patientLogin)
      const r = await pay(simulated, patientLogin, mine.a)
      expect(r.http).toBe(201)
      expect((await pay(simulated, patientLogin, theirs.a)).http).toBe(403)
      const list = await call(simulated, patientLogin, 'GET', '/payments/mine')
      expect(list.body.map((p: J) => p.id)).toEqual([r.body.id])
    })
    it('answers 404, not 403, when it is someone else\'s, so nobody can probe', async () => {
      const { a } = await visit()
      const r = await pay(simulated, chv, a)
      expect((await call(simulated, other, 'GET', `/payments/${r.body.id}`)).http).toBe(404)
      expect((await call(simulated, other, 'GET', `/payments/${randomUUID()}`)).http).toBe(404)
      expect((await call(simulated, admin, 'GET', `/payments/${r.body.id}`)).http).toBe(200)
    })
    it.each([
      [{ id: 'nope' }], [{ purpose: 'gift' }], [{ purpose: 'constructor' }], [{ subject_id: 'nope' }], [{ network: 'cash' }], [{ phone: '0241234567' }], [{ phone: 5 }],
    ])('answers 400 to %j', async (extra) => {
      const { a } = await visit()
      expect((await pay(simulated, chv, a, extra)).http).toBe(400)
    })
    it('answers 404 to an unknown visit and 409 to a cancelled one', async () => {
      expect((await pay(simulated, chv, randomUUID())).http).toBe(404)
      const { a } = await visit()
      await db.withTransaction(SYSTEM_ID, (q) => q.query(`UPDATE appointments SET status = 'cancelled' WHERE id = $1`, [a]))
      expect(await pay(simulated, chv, a)).toMatchObject({ http: 409, body: { error: 'visit_cancelled' } })
    })
    it('refuses no sign-in', async () => {
      expect((await fetch(`${simulated}/payments/mine`)).status).toBe(401)
    })
  })
})
