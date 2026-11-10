import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TEST_USERS, seedTestUsers } from '../scripts/seed-test-users.js'
import { createApp } from '../src/app.js'
import { signToken, signingKey } from '../src/auth.js'
import type { Db } from '../src/db.js'
import { SYSTEM_ID, TEST_DATABASE_URL, freshDatabase } from './pg.js'

const key = signingKey('test-secret-that-is-long-enough-32+chars')!
type J = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const id = (u: string) => TEST_USERS.find((x) => x.username === u)!.id
const OWN = '00000000-0000-4000-8000-000000000022'
const PATIENT = '00000000-0000-4000-8000-000000000002'
const OTHER = randomUUID()
const OTHER_NURSE = randomUUID()
const OTHER_ADMIN = randomUUID()
const NO_FACILITY_ADMIN = randomUUID()
const FORMATS = ['fhir', 'dhis2', 'who']

describe.skipIf(!TEST_DATABASE_URL)('SDG 3 figures, exports and facility limits', () => {
  let db: Db
  let drop: () => Promise<void>
  let url: string
  let close: () => void
  const tok: Record<string, string> = {}
  const get = async (who: string, path: string) => {
    const res = await fetch(url + path, { headers: { authorization: `Bearer ${tok[who]}` } })
    return { http: res.status, body: await res.json().catch(() => null) as any } // eslint-disable-line @typescript-eslint/no-explicit-any
  }
  const figure = (body: J, code: string) => body.figures.find((f: J) => f.code === code)

  beforeAll(async () => {
    ;({ db, drop } = await freshDatabase())
    await seedTestUsers(db, 'correct-horse-battery')
    for (const u of TEST_USERS) tok[u.username] = await signToken(key, u.id)
    await db.withTransaction(SYSTEM_ID, async (q) => {
      await q.query(`INSERT INTO facilities (id, name, type, region, district) VALUES ($1, 'Second clinic', 'clinic', 'Volta', 'Ho Municipal')`, [OTHER])
      await q.query(`INSERT INTO practitioners (id, full_name, role, facility_id) VALUES ($1, 'Second Nurse', 'nurse', $3), ($2, 'Second Admin', 'health_centre_admin', $3), ($4, 'Unlinked Admin', 'health_centre_admin', NULL)`, [OTHER_NURSE, OTHER_ADMIN, OTHER, NO_FACILITY_ADMIN])
      const consent = (await q.query(`INSERT INTO consents (patient_id, purpose, given_by, recorded_by, given_at) VALUES ($1, 'clinical_care', 'patient', $2, now()) RETURNING id`, [PATIENT, id('chv')])).rows[0]!.id
      // Two referrals to the second facility, one to ours; two emergencies there, one here, one acknowledged after 10 minutes.
      for (const f of [OTHER, OTHER, OWN]) await q.query(`INSERT INTO referrals (patient_id, consent_id, to_facility_id, reason, priority) VALUES ($1, $2, $3, 'test', 'routine')`, [PATIENT, consent, f])
      for (const f of [OTHER, OTHER]) await q.query(`INSERT INTO emergencies (facility_id, description) VALUES ($1, 'test')`, [f])
      await q.query(`INSERT INTO emergencies (facility_id, description, status, acknowledged_by, acknowledged_at) VALUES ($1, 'test', 'acknowledged', $2, now() + interval '10 minutes')`, [OWN, id('chv')])
      await q.query(`INSERT INTO weekly_case_counts (week_start, region, district, condition, case_count, source) VALUES (date_trunc('week', date_trunc('quarter', now()) + interval '6 days')::date, 'Volta', 'Ho Municipal', 'malaria', 7, 'synthetic')`)
    })
    for (const u of [OTHER_ADMIN, NO_FACILITY_ADMIN]) tok[u] = await signToken(key, u)
    const server = createApp({ db, instanceId: 't', jwtKey: key, events: { publish: async () => {} } }).listen(0)
    await new Promise((r) => server.once('listening', r))
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    close = () => server.close()
  })
  afterAll(async () => { close?.(); await drop?.() })

  describe('a health centre admin', () => {
    const ROUTES = ['/reporting/sdg3', '/reporting/export/dhis2', '/facility/people']

    it('is refused a second facility on every route, even by asking for it', async () => {
      for (const route of ROUTES) {
        const { http, body } = await get('facility_admin', `${route}?facilityId=${OTHER}`)
        expect(http, route).toBe(403)
        expect(body.error, route).toBe('other_facility')
        expect(JSON.stringify(body), route).not.toContain('Second')
      }
    })
    it('sees only their own numbers by default, and a national figure not at all', async () => {
      const { http, body } = await get('facility_admin', '/reporting/sdg3')
      expect(http).toBe(200)
      expect(body.scope).toBe('Dodowa clinic area')
      expect(figure(body, 'referrals_received').value).toBe(1)
      expect(figure(body, 'emergencies_raised').value).toBe(1)
      expect(figure(body, 'patients_registered')).toBeUndefined()
      expect(body.figures.some((f: J) => f.code.startsWith('cases_'))).toBe(false)
    })
    it('the other facility\'s admin sees that facility, so the limit is the account and not a fixed id', async () => {
      const { body } = await get(OTHER_ADMIN, '/reporting/sdg3')
      expect(body.scope).toBe('Second clinic')
      expect(figure(body, 'referrals_received').value).toBe(2)
    })
    it('lists their own people with no sign of the other facility', async () => {
      const { body } = await get('facility_admin', '/facility/people')
      expect(body.people.map((p: J) => p.name).sort()).toEqual(['Ama Serwaa', 'Kwabena Ofori'])
      expect(body.people.find((p: J) => p.name === 'Ama Serwaa').role).toBe('chv')
    })
    it('exports only their own facility', async () => {
      const { body } = await get('facility_admin', '/reporting/export/who')
      expect(body.payload.indicators.find((i: J) => i.code === 'referrals_received').value).toBe(1)
      expect(body.payload.weeklyDiseaseCases).toEqual([])
      expect(JSON.stringify(body)).not.toContain('Ho Municipal')
    })
    it('is refused when the account has no facility: never the whole country', async () => {
      for (const route of ROUTES) expect((await get(NO_FACILITY_ADMIN, route)).body.error, route).toBe('no_facility')
    })
    it('still cannot open a patient record or the platform admin area', async () => {
      expect((await get('facility_admin', `/patients/${PATIENT}`)).http).toBe(403)
      expect((await get('facility_admin', '/admin/users')).http).toBe(403)
    })
  })

  it('other roles are refused, and an unknown format or bad id is answered cleanly', async () => {
    for (const who of ['chv', 'patient', 'clinician', 'pharmacist', 'healer']) {
      expect((await get(who, '/reporting/sdg3')).http, who).toBe(403)
      expect((await get(who, '/reporting/export/fhir')).http, who).toBe(403)
    }
    expect((await get('ghs', '/facility/people')).http).toBe(403)
    expect((await fetch(`${url}/reporting/sdg3`)).status).toBe(401)
    expect((await get('ghs', '/reporting/export/csv')).http).toBe(404)
    expect((await get('ghs', '/reporting/sdg3?facilityId=nope')).http).toBe(400)
    expect((await get('ghs', `/reporting/sdg3?facilityId=${randomUUID()}`)).http).toBe(404)
  })

  it('GHS and platform admin see every facility, each figure says what it counts, and what cannot be computed is omitted', async () => {
    const { http, body } = await get('ghs', '/reporting/sdg3')
    expect(http).toBe(200)
    expect(body).toMatchObject({ sandbox: true, synthetic: true, scope: 'All facilities' })
    expect(figure(body, 'referrals_received').value).toBe(3)
    expect(figure(body, 'patients_registered').value).toBeGreaterThan(0)
    expect(figure(body, 'cases_malaria_synthetic')).toMatchObject({ value: 7, label: 'Malaria cases (synthetic)' })
    expect(figure(body, 'emergency_ack_minutes_median')).toMatchObject({ value: 10, unit: 'min' })
    for (const f of body.figures) expect(f.counts, f.code).toEqual(expect.stringMatching(/\S/))
    expect(body.omitted.map((o: J) => o.label)).toEqual(expect.arrayContaining(['Maternal mortality ratio (3.1.1)', 'Disease incidence per 1,000 people (3.3)', 'Rural and urban gap']))
    expect(body.omitted.every((o: J) => o.why)).toBe(true)
    const narrowed = await get('platform_admin', `/reporting/sdg3?facilityId=${OTHER}`)
    expect(figure(narrowed.body, 'referrals_received').value).toBe(2)
  })

  it('a figure with nothing to measure is omitted, not shown as zero', async () => {
    const { body } = await get('platform_admin', `/reporting/sdg3?facilityId=${OTHER}`)
    expect(figure(body, 'emergency_ack_minutes_median')).toBeUndefined()
    expect(body.omitted.map((o: J) => o.label)).toContain('Median time to acknowledge an emergency')
  })

  it.each(FORMATS)('the %s export is labelled, honest about conformance, and holds no patient', async (format) => {
    const { http, body } = await get('ghs', `/reporting/export/${format}`)
    expect(http).toBe(200)
    expect(body.notice).toMatchObject({ sandbox: true, synthetic: true })
    expect(body.notice.label).toMatch(/SANDBOX.*synthetic.*sent to no external system/)
    const text = JSON.stringify(body)
    expect(text).not.toContain(PATIENT)
    expect(text).not.toContain('Akosua')
    expect(body.notice.conformance).toMatch(format === 'fhir' ? /FHIR-shaped, not FHIR-compatible/ : /[Nn]ot .*validated/)
  })

  it('the exports carry the figures in each shape', async () => {
    const f = (await get('ghs', '/reporting/export/fhir')).body.payload
    expect(f).toMatchObject({ resourceType: 'Bundle', type: 'collection' })
    expect(f.meta.tag[0].code).toBe('HTEST')
    expect(f.entry[0].resource.group.find((g: J) => g.code.coding[0].code === 'referrals_received').population[0].count).toBe(3)
    const ho = f.entry.find((e: J) => e.resource.subject?.display === 'Ho Municipal, Volta').resource
    expect(ho.group[0]).toMatchObject({ code: { text: 'malaria' }, population: [{ count: 7 }] })
    expect(ho.meta.tag[1].code).toBe('synthetic')

    const d = (await get('ghs', '/reporting/export/dhis2')).body.payload
    expect(d.dataSet).toMatch(/^SANDBOX_/)
    expect(d.dataValues.find((v: J) => v.dataElement === 'SANDBOX_CASES_MALARIA')).toMatchObject({ period: expect.stringMatching(/^\d{4}W[1-9]\d?$/), orgUnit: 'SANDBOX_HO_MUNICIPAL', value: '7' })

    const w = (await get('ghs', '/reporting/export/who')).body.payload
    expect(w.weeklyDiseaseCases[0]).toMatchObject({ disease: 'malaria', cases: 7, source: 'synthetic' })
  })
})
