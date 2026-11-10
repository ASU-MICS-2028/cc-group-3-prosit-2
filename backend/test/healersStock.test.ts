import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { signToken, signingKey } from '../src/auth.js'
import type { Db } from '../src/db.js'
import { SYSTEM_ID, TEST_DATABASE_URL, freshDatabase } from './pg.js'

const key = signingKey('test-secret-that-is-long-enough-32+chars')!
type J = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

describe.skipIf(!TEST_DATABASE_URL)('healers and stock (FB-9b)', () => {
  let db: Db
  let drop: () => Promise<void>
  let url: string
  let close: () => void
  const chv = randomUUID(), otherChv = randomUUID(), healer = randomUUID(), pharmacist = randomUUID(), facilityAdmin = randomUUID(), noFacility = randomUUID(), patientLogin = randomUUID()
  const tok: Record<string, string> = {}
  const patient = randomUUID(), site1 = randomUUID(), site2 = randomUUID()

  const post = async (who: string, path: string, body: J = {}) => {
    const res = await fetch(url + path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${tok[who]}` }, body: JSON.stringify(body) })
    return { http: res.status, ...(await res.json() as J) }
  }
  const get = async (who: string, path: string) => {
    const res = await fetch(url + path, { headers: { authorization: `Bearer ${tok[who]}` } })
    return { http: res.status, ...(await res.json() as J) }
  }
  const consent = (id: string, purpose: string, extra: J = {}) => ({
    id, resourceType: 'Consent', patientId: null, version: extra.version ?? 1, baseVersion: extra.baseVersion ?? null,
    resource: { resourceType: 'Consent', id, status: extra.withdrawnAt ? 'inactive' : 'active', scope: {}, category: [{ coding: [{ code: purpose }] }], patient: { reference: `Patient/${patient}` }, dateTime: '2026-11-01T08:00:00Z', performer: [{ display: 'patient' }], ...(extra.withdrawnAt ? { extension: [{ url: 'https://healthconnect.example/consent-withdrawn-at', valueDateTime: extra.withdrawnAt }] } : {}) },
  })
  const list = async (who: string) => fetch(`${url}/healer-referrals/mine`, { headers: { authorization: `Bearer ${tok[who]}` } }).then((r) => r.json() as Promise<J[]>)
  const qty = async (facility: string, name: string) => (await db.query('SELECT quantity FROM stock_items WHERE facility_id = $1 AND name = $2', [facility, name])).rows[0]?.quantity

  beforeAll(async () => {
    ;({ db, drop } = await freshDatabase(8))
    await db.withTransaction(SYSTEM_ID, async (q) => {
      await q.query(`INSERT INTO patients (id, full_name) VALUES ($1, 'Test Patient')`, [patient])
      for (const f of [site1, site2]) await q.query(`INSERT INTO facilities (id, name, type, region) VALUES ($1, $2, 'clinic', 'Greater Accra')`, [f, `Site ${f.slice(0, 4)}`])
      for (const [id, role, p, f] of [[chv, 'chv', null, null], [otherChv, 'chv', null, null], [healer, 'traditional_healer', null, null], [pharmacist, 'pharmacist', null, site1], [facilityAdmin, 'health_centre_admin', null, site2], [noFacility, 'pharmacist', null, null], [patientLogin, 'patient', patient, null]] as const) {
        await q.query(`INSERT INTO practitioners (id, full_name, role, patient_id, facility_id, community) VALUES ($1, $2, $3, $4, $5, $6)`, [id, `Test ${role}`, role, p, f, role === 'traditional_healer' ? 'Kintampo' : null])
        tok[id] = await signToken(key, id)
      }
    })
    const server = createApp({ db, instanceId: 'test', jwtKey: key, events: { publish: async () => {} }, apiRatePerMinute: 100_000 }).listen(0)
    await new Promise((r) => server.once('listening', r))
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    close = () => server.close()
    await post(chv, '/sync/push', { id: patient, resourceType: 'Patient', patientId: null, version: 1, baseVersion: null, resource: { resourceType: 'Patient', id: patient, name: [{ text: 'Test Patient' }] } })
    expect((await post(chv, '/sync/push', consent(randomUUID(), 'clinical_care'))).status).toBe('ok')
  })
  afterAll(async () => { close?.(); await drop?.() })

  const body = (extra: J = {}) => ({ id: randomUUID(), patient_id: patient, healer_id: healer, reason: 'Back pain', ...extra })

  it('lists the synthetic directory, labelled, for carers only', async () => {
    const d = await get(chv, '/healers')
    expect(d).toMatchObject({ http: 200, synthetic: true })
    expect(d.healers).toHaveLength(1)
    expect((await get(pharmacist, '/healers')).http).toBe(403)
  })

  describe('referral', () => {
    const consentId = randomUUID()
    let referralId: string

    it('is refused on clinical-care consent alone', async () => {
      expect(await post(chv, '/healer-referrals', body())).toMatchObject({ http: 403, error: 'consent_missing' })
    })
    it('is refused for someone not your patient', async () => {
      expect((await post(otherChv, '/healer-referrals', body())).http).toBe(403)
    })
    it('is sent once consent is recorded, and a retry is the same referral', async () => {
      expect((await post(chv, '/sync/push', consent(consentId, 'healer_referral'))).status).toBe('ok')
      const req = body()
      const sent = await post(chv, '/healer-referrals', req)
      expect(sent).toMatchObject({ http: 201, status: 'pending', direction: 'to_healer' })
      expect(await post(chv, '/healer-referrals', req)).toMatchObject({ http: 200, id: req.id })
      referralId = req.id
    })
    it('refuses a recipient who is not a healer, and reasons that are missing', async () => {
      expect((await post(chv, '/healer-referrals', body({ healer_id: otherChv }))).http).toBe(404)
      expect((await post(chv, '/healer-referrals', body({ reason: '' }))).http).toBe(400)
    })
    it('reaches the healer, who accepts, notes remedies and refers back; the referrer sees both', async () => {
      expect((await list(healer)).map((r) => r.reason)).toEqual(['Back pain'])
      expect(await post(chv, `/healer-referrals/${referralId}/status`, { status: 'accepted' })).toMatchObject({ http: 403 })
      expect((await post(healer, `/healer-referrals/${referralId}/status`, { status: 'completed' })).http).toBe(409)
      expect(await post(healer, `/healer-referrals/${referralId}/status`, { status: 'accepted' })).toMatchObject({ http: 200, status: 'accepted' })
      const done = await post(healer, `/healer-referrals/${referralId}/status`, { status: 'completed', remedies: 'Neem leaf tea' })
      expect(done).toMatchObject({ http: 200, status: 'completed', remedies: 'Neem leaf tea' })
      const back = await post(healer, `/healer-referrals/${referralId}/refer-back`, { id: randomUUID(), reason: 'Needs a doctor' })
      expect(back).toMatchObject({ http: 201, direction: 'from_healer' })
      expect((await list(chv)).map((r) => r.direction).sort()).toEqual(['from_healer', 'to_healer'])
    })
    it('a withdrawal hides the referral from the healer and blocks a new one', async () => {
      expect((await post(chv, '/sync/push', consent(consentId, 'healer_referral', { baseVersion: 1, version: 2, withdrawnAt: '2026-11-05T08:00:00Z' }))).status).toBe('ok')
      expect(await list(healer)).toEqual([])
      expect(await post(chv, '/healer-referrals', body())).toMatchObject({ http: 403, error: 'consent_withdrawn' })
      expect((await post(healer, `/healer-referrals/${referralId}/refer-back`, { id: randomUUID(), reason: 'x' })).http).toBe(403)
    })
  })

  describe('stock', () => {
    let itemId: string

    it('only stock roles with a facility can reach it', async () => {
      expect((await get(chv, '/stock')).http).toBe(403)
      expect(await get(noFacility, '/stock')).toMatchObject({ http: 409, error: 'no_facility' })
    })
    it('records a level and flags it low at or below the reorder level', async () => {
      const it1 = await post(pharmacist, '/stock', { name: 'ORS sachets', unit: 'sachets', quantity: 10, reorder_level: 10 })
      expect(it1).toMatchObject({ http: 200, quantity: 10, low: true })
      itemId = it1.id
      expect((await post(pharmacist, '/stock', { name: 'ORS sachets', unit: 'sachets', quantity: 11, reorder_level: 10 })).low).toBe(false)
      expect((await post(pharmacist, '/stock', { name: 'x', unit: 'y', quantity: -1, reorder_level: 0 })).http).toBe(400)
    })
    it('a move shifts both levels and records who, what, from and to; a retry moves nothing', async () => {
      const id = randomUUID()
      const move = { id, item_id: itemId, to_facility_id: site2, quantity: 4 }
      expect(await post(pharmacist, '/stock/transfers', move)).toMatchObject({ http: 201, item: 'ORS sachets', quantity: 4, movedBy: 'Test pharmacist', from: { id: site1 }, to: { id: site2 } })
      expect(await post(pharmacist, '/stock/transfers', move)).toMatchObject({ http: 200, id })
      expect(await qty(site1, 'ORS sachets')).toBe(7)
      expect(await qty(site2, 'ORS sachets')).toBe(4)
      const view = await get(facilityAdmin, '/stock')
      expect(view.transfers).toHaveLength(1)
      expect(view.items[0]).toMatchObject({ name: 'ORS sachets', quantity: 4 })
    })
    it('refuses moving more than is there, leaving both levels alone', async () => {
      expect(await post(pharmacist, '/stock/transfers', { id: randomUUID(), item_id: itemId, to_facility_id: site2, quantity: 8 })).toMatchObject({ http: 409, error: 'insufficient_stock' })
      expect(await qty(site1, 'ORS sachets')).toBe(7)
      expect(await qty(site2, 'ORS sachets')).toBe(4)
    })
    it('two moves at once cannot drive the level below zero', async () => {
      const move = () => post(pharmacist, '/stock/transfers', { id: randomUUID(), item_id: itemId, to_facility_id: site2, quantity: 7 })
      const answers = await Promise.all([move(), move()])
      expect(answers.map((a) => a.http).sort()).toEqual([201, 409])
      expect(await qty(site1, 'ORS sachets')).toBe(0)
    })
    it('the database itself refuses a negative quantity', async () => {
      await expect(db.withTransaction(SYSTEM_ID, (q) => q.query(`UPDATE stock_items SET quantity = -1 WHERE facility_id = $1`, [site1]))).rejects.toMatchObject({ code: '23514' })
    })
    it('cannot move stock out of a facility that is not yours', async () => {
      expect((await post(facilityAdmin, '/stock/transfers', { id: randomUUID(), item_id: itemId, to_facility_id: site1, quantity: 1 })).http).toBe(404)
    })
    it('shows a facility what is short elsewhere', async () => {
      await post(facilityAdmin, '/stock', { name: 'ORS sachets', unit: 'sachets', quantity: 100, reorder_level: 10 })
      const view = await get(facilityAdmin, '/stock')
      expect(view.lowElsewhere).toEqual([expect.objectContaining({ facilityId: site1, item: 'ORS sachets', quantity: 0 })])
    })
  })
})
