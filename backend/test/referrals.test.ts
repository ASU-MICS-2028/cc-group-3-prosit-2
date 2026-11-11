import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { signToken, signingKey } from '../src/auth.js'
import type { Db } from '../src/db.js'
import { SYSTEM_ID, TEST_DATABASE_URL, freshDatabase, sqlState } from './pg.js'

const key = signingKey('test-secret-that-is-long-enough-32+chars')!
type J = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

describe.skipIf(!TEST_DATABASE_URL)('referrals and emergencies', () => {
  let db: Db, drop: () => Promise<void>, url: string, close: () => void
  const here = randomUUID(), there = randomUUID()
  const chv = randomUUID(), chv2 = randomUUID(), nurse = randomUUID(), farNurse = randomUUID(), doctor = randomUUID(), doctor2 = randomUUID(), admin = randomUUID(), ghs = randomUUID(), pharmacist = randomUUID()
  const tok: Record<string, string> = {}

  beforeAll(async () => {
    ;({ db, drop } = await freshDatabase(12))
    await db.withTransaction(SYSTEM_ID, async (q) => {
      await q.query(`INSERT INTO facilities (id, name, type, region) VALUES ($1, 'Here', 'clinic', 'Volta'), ($2, 'There', 'clinic', 'Volta')`, [here, there])
      for (const [id, role, f, n] of [[chv, 'chv', here, 'Ama'], [chv2, 'chv', there, 'Abena'], [nurse, 'nurse', here, 'Nurse Here'], [farNurse, 'nurse', there, 'Nurse There'], [doctor, 'doctor', here, 'Dr Here'], [doctor2, 'doctor', there, 'Dr There'], [admin, 'health_centre_admin', here, 'Admin Here'], [ghs, 'ghs_official', null, 'GHS'], [pharmacist, 'pharmacist', null, 'Pharm']] as const) {
        await q.query(`INSERT INTO practitioners (id, full_name, role, facility_id) VALUES ($1, $2, $3, $4)`, [id, n, role, f])
        tok[id] = await signToken(key, id)
      }
    })
    const server = createApp({ db, instanceId: 'test', jwtKey: key, events: { publish: async () => {} }, authRatePerMinute: 100_000, apiRatePerMinute: 100_000 }).listen(0)
    await new Promise((r) => server.once('listening', r))
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    close = () => server.close()
  })
  afterAll(async () => { close?.(); await drop?.() })

  const post = async (who: string, path: string, body: J = {}) => {
    const res = await fetch(url + path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${tok[who]}` }, body: JSON.stringify(body) })
    return { http: res.status, ...(await res.json() as J) }
  }
  const get = async (who: string, path: string) => {
    const res = await fetch(url + path, { headers: { authorization: `Bearer ${tok[who]}` } })
    return { http: res.status, body: await res.json() as any } // eslint-disable-line @typescript-eslint/no-explicit-any
  }
  const push = (who: string, resource: J) => post(who, '/sync/push', { id: resource.id, resourceType: resource.resourceType, patientId: null, version: 1, baseVersion: null, resource })
  const patient = async (consent = true) => {
    const p = randomUUID()
    await push(chv, { resourceType: 'Patient', id: p, name: [{ text: 'Akua Test' }] })
    if (consent) await push(chv, { resourceType: 'Consent', id: randomUUID(), status: 'active', scope: {}, category: [{ coding: [{ code: 'clinical_care' }] }], patient: { reference: `Patient/${p}` }, dateTime: '2026-11-01T08:00:00Z', performer: [{ display: 'patient' }] })
    return p
  }
  const refer = (who: string, p: string, extra: J = {}) => post(who, '/referrals', { id: randomUUID(), patient_id: p, to_practitioner_id: doctor, reason: 'Fever three days', ...extra })
  const raise = (who = chv, extra: J = {}) => post(who, '/emergencies', { id: randomUUID(), description: 'Struggling to breathe', ...extra })
  /** Moves an emergency into the past, as if it was raised this long ago. Only the stamping trigger stops this. */
  const age = async (id: string, minutes: number) => db.withTransaction(SYSTEM_ID, async (q) => {
    await q.query('ALTER TABLE emergencies DISABLE TRIGGER emergencies_audit_trg')
    await q.query(`UPDATE emergencies SET created_at = created_at - make_interval(mins => $2), escalated_at = escalated_at - make_interval(mins => $2) WHERE id = $1`, [id, minutes])
    await q.query('ALTER TABLE emergencies ENABLE TRIGGER emergencies_audit_trg')
    await q.query('ALTER TABLE care_events DISABLE TRIGGER care_events_append_only_trg')
    await q.query(`UPDATE care_events SET at = at - make_interval(mins => $2) WHERE emergency_id = $1`, [id, minutes])
    await q.query('ALTER TABLE care_events ENABLE TRIGGER care_events_append_only_trg')
  })
  const row = async (id: string) => (await db.query('SELECT * FROM emergencies WHERE id = $1', [id])).rows[0]!

  describe('priority', () => {
    const suggest = (body: J) => post(chv, '/referrals/suggest', body)
    it('comes from danger signs and vitals, says why, and is labelled a suggestion', async () => {
      const e = await suggest({ danger_signs: ['convulsions'], vitals: { temperature: 38 } })
      expect(e.priority).toBe('emergency')
      expect(e.reason).toContain('convulsions')
      expect(e.reason).not.toContain('38')
      expect(e.note).toContain('not a diagnosis')
      expect((await suggest({ vitals: { temperature: 39.8 } })).priority).toBe('urgent')
      expect((await suggest({ vitals: { systolic: 75 } })).priority).toBe('urgent')
      expect((await suggest({ vitals: { systolic: 230 } })).priority).toBe('emergency')
      expect((await suggest({ vitals: { systolic: 150 } })).priority).toBe('soon')
      expect((await suggest({ danger_signs: ['not_eating'] })).priority).toBe('soon')
      expect((await suggest({ vitals: { systolic: 118, temperature: 36.8 } })).priority).toBe('routine')
    })
    it('refuses signs and readings it does not know', async () => {
      expect((await suggest({ danger_signs: ['bad_vibes'] })).http).toBe(400)
      expect((await suggest({ vitals: { temperature: 'hot' } })).http).toBe(400)
      expect((await post(pharmacist, '/referrals/suggest', {})).http).toBe(403)
    })
  })

  describe('referrals', () => {
    it('needs the patient to be yours, and consent', async () => {
      const p = await patient(false)
      expect((await refer(chv, p)).error).toBe('consent_missing')
      expect((await refer(chv2, await patient())).http).toBe(403)
      expect((await refer(pharmacist, p)).http).toBe(403)
      expect((await refer(chv, p, { to_practitioner_id: nurse })).field).toBe('to_practitioner_id')
    })
    it('stores the server\'s own priority and reason, once per id, with a logged message', async () => {
      const p = await patient(), id = randomUUID()
      const r = await refer(chv, p, { id, danger_signs: ['fever_with_rash'], priority: undefined })
      expect(r.http).toBe(201)
      expect(r.priority).toBe('urgent')
      expect(r.priorityReason).toContain('fever with rash')
      expect((await refer(chv, p, { id })).http).toBe(200)
      const seen = await get(chv, `/referrals/${id}`)
      expect(seen.body.events).toHaveLength(1)
      expect(seen.body.events[0]).toMatchObject({ kind: 'sent', notified: 'Dr Here', delivery: 'logged_only' })
    })
    it('lets a person change the suggestion, says so, and never lowers an emergency', async () => {
      const p = await patient()
      const down = await refer(chv, p, { danger_signs: ['not_eating'], priority: 'routine' })
      expect(down.priority).toBe('routine')
      expect(down.priorityReason).toContain('Changed to routine')
      expect((await refer(chv, p, { danger_signs: ['not_eating'], priority: 'urgent' })).priority).toBe('urgent')
      expect((await refer(chv, p, { danger_signs: ['convulsions'], priority: 'urgent' })).error).toBe('cannot_lower_emergency')
    })
    it('fills the inbox most urgent first, then longest waiting, for the receiver only', async () => {
      const p = await patient()
      const routine = await refer(chv, p, { to_practitioner_id: doctor2 })
      const urgent1 = await refer(chv, p, { to_practitioner_id: doctor2, vitals: { temperature: 40 } })
      const emergency = await refer(chv, p, { to_practitioner_id: doctor2, danger_signs: ['unconscious'] })
      const urgent2 = await refer(chv, p, { to_practitioner_id: doctor2, vitals: { temperature: 40 } })
      const inbox = (await get(doctor2, '/referrals/mine')).body as J[]
      expect(inbox.map((r) => r.id)).toEqual([emergency.id, urgent1.id, urgent2.id, routine.id])
      expect(inbox.every((r) => r.relation === 'received')).toBe(true)
      expect(((await get(nurse, '/referrals/mine')).body as J[])).toHaveLength(0)
    })
    it('only the receiver acts, only the sender cancels, and accepting opens the record', async () => {
      const p = await patient()
      const r = await refer(chv, p)
      const before = await db.query('SELECT max(seq) AS m FROM sync_records')
      expect((await post(doctor2, `/referrals/${r.id}/accept`)).http).toBe(403)
      expect((await post(chv, `/referrals/${r.id}/accept`)).http).toBe(403)
      expect((await post(doctor, `/referrals/${r.id}/cancel`)).http).toBe(403)
      expect((await get(doctor2, `/referrals/${r.id}`)).http).toBe(403)
      expect((await get(doctor, `/sync/pull?since=${before.rows[0]!.m}`)).body.items).toHaveLength(0)
      const accepted = await post(doctor, `/referrals/${r.id}/accept`)
      expect(accepted).toMatchObject({ http: 200, status: 'accepted', actions: ['complete'] })
      expect((await get(doctor, `/sync/pull?since=${before.rows[0]!.m}`)).body.items.map((i: J) => i.patientId ?? i.patient_id)).toContain(p)
      expect((await post(chv, `/referrals/${r.id}/cancel`)).http).toBe(409)
      expect((await post(doctor, `/referrals/${r.id}/accept`)).http).toBe(409)
      expect((await post(doctor, `/referrals/${r.id}/complete`)).status).toBe('completed')
    })
  })

  describe('emergencies', () => {
    it('reaches nurses here first, and not nurses elsewhere or doctors yet', async () => {
      const e = await raise()
      expect(e.http).toBe(201)
      expect(e.status).toBe('raised')
      expect(e.events[0]).toMatchObject({ kind: 'raised', notified: 'Nurse Here', delivery: 'logged_only' })
      expect((await get(nurse, `/emergencies/${e.id}`)).http).toBe(200)
      expect((await get(farNurse, `/emergencies/${e.id}`)).http).toBe(403)
      expect((await get(doctor, `/emergencies/${e.id}`)).http).toBe(403)
      expect((await get(ghs, `/emergencies/${e.id}`)).http).toBe(403)
      expect((await post(pharmacist, '/emergencies', { id: randomUUID(), description: 'x' })).http).toBe(403)
    })
    it('escalates by the clock, one recorded step per level, at the time each fell due', async () => {
      const e = await raise()
      await age(e.id, 11)
      const seen = await get(doctor, `/emergencies/${e.id}`)
      expect(seen.http).toBe(200)
      expect(seen.body.level).toBe(2)
      expect(seen.body.events.map((s: J) => [s.kind, s.level])).toEqual([['raised', 0], ['escalated', 1], ['escalated', 2]])
      expect(seen.body.events[1].notified).toBe('Dr Here')
      expect(seen.body.events[2].notified).toBe('Admin Here')
      const raised = Date.parse(seen.body.raisedAt)
      expect(Date.parse(seen.body.events[1].at) - raised).toBe(5 * 60_000)
      expect(Date.parse(seen.body.events[2].at) - raised).toBe(10 * 60_000)
      expect(Date.parse(seen.body.nextEscalationAt) - raised).toBe(15 * 60_000)
      expect((await row(e.id)).updated_by).toBe(SYSTEM_ID)
      expect((await get(ghs, `/emergencies/${e.id}`)).http).toBe(403)
      expect((await get(admin, `/emergencies/${e.id}`)).http).toBe(200)
      await age(e.id, 5)
      expect((await get(ghs, `/emergencies/${e.id}`)).body.level).toBe(3)
      expect((await get(ghs, '/emergencies/mine')).body.map((x: J) => x.id)).toContain(e.id)
    })
    it('stops at the last level, and two readers record each step once', async () => {
      const e = await raise()
      await age(e.id, 60)
      await Promise.all([get(nurse, `/emergencies/${e.id}`), get(nurse, `/emergencies/${e.id}`), get(chv, '/emergencies/mine')])
      const seen = await get(chv, `/emergencies/${e.id}`)
      expect(seen.body.level).toBe(3)
      expect(seen.body.nextEscalationAt).toBeNull()
      expect(seen.body.events.filter((s: J) => s.kind === 'escalated')).toHaveLength(3)
    })
    it('stops escalating once someone acknowledges, and records who', async () => {
      const e = await raise()
      expect((await post(chv, `/emergencies/${e.id}/acknowledge`)).http).toBe(403)
      expect((await post(doctor2, `/emergencies/${e.id}/acknowledge`)).http).toBe(403)
      const ack = await post(nurse, `/emergencies/${e.id}/acknowledge`)
      expect(ack).toMatchObject({ http: 200, status: 'acknowledged', acknowledgedBy: 'Nurse Here', nextEscalationAt: null })
      await age(e.id, 30)
      const after = await get(chv, `/emergencies/${e.id}`)
      expect(after.body.level).toBe(0)
      expect(after.body.events.map((s: J) => s.kind)).toEqual(['raised', 'acknowledged'])
      expect((await post(nurse, `/emergencies/${e.id}/acknowledge`)).http).toBe(409)
      expect((await post(nurse, `/emergencies/${e.id}/resolve`)).status).toBe('resolved')
      expect((await post(chv, `/emergencies/${e.id}/cancel`)).http).toBe(409)
    })
    it('catches up before an acknowledgement, so a late answer still shows the steps that happened', async () => {
      const e = await raise()
      await age(e.id, 6)
      const ack = await post(doctor, `/emergencies/${e.id}/acknowledge`)
      expect(ack.level).toBe(1)
      expect(ack.events.map((s: J) => s.kind)).toEqual(['raised', 'escalated', 'acknowledged'])
    })
    it('only the person who raised it can cancel it', async () => {
      const e = await raise()
      expect((await post(nurse, `/emergencies/${e.id}/cancel`)).http).toBe(403)
      expect((await post(chv, `/emergencies/${e.id}/cancel`)).status).toBe('cancelled')
    })
    it('takes a patient who is the raiser\'s, refuses someone else\'s, and is not held up by one not synced yet', async () => {
      const p = await patient(false)
      expect((await raise(chv, { patient_id: p })).patient.id).toBe(p)
      expect((await raise(chv2, { patient_id: p })).http).toBe(403)
      const unsynced = await raise(chv, { patient_id: randomUUID() })
      expect(unsynced.http).toBe(201)
      expect(unsynced.patient).toBeNull()
    })
    it('keeps its record append-only, and logs each access', async () => {
      const e = await raise()
      const err = await db.withTransaction(SYSTEM_ID, (q) => q.query(`UPDATE care_events SET message = 'x' WHERE emergency_id = $1`, [e.id])).catch((x: unknown) => x)
      expect(sqlState(err)).toBeTruthy()
      await post(farNurse, `/emergencies/${e.id}/acknowledge`)
      const log = (await db.query(`SELECT outcome FROM access_log WHERE resource_type = 'Emergency' AND accessed_by = $1`, [farNurse])).rows
      expect(log.map((l) => l.outcome)).toContain('denied')
    })
  })
})
