import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { signToken, signingKey } from '../src/auth.js'
import type { Db } from '../src/db.js'
import { checkSymptoms } from '../src/symptomRules.js'
import { SYSTEM_ID, TEST_DATABASE_URL, freshDatabase } from './pg.js'

const key = signingKey('test-secret-that-is-long-enough-32+chars')!
type J = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)

it('the test-mode rule table is the same file as the server one', () => {
  const read = (p: string) => readFileSync(join(import.meta.dirname, p), 'utf8')
  expect(read('../src/symptomRules.ts')).toBe(read('../../frontend/src/data/symptomRules.ts'))
})

describe('symptom rules', () => {
  it('ranks the most urgent first, and shows the rule that fired', () => {
    const m = checkSymptoms(['fever', 'stiff_neck'])
    expect(m[0]).toMatchObject({ priority: 'emergency', possibility: 'Possible meningitis' })
    expect(m[0].rule).toContain('Fever + Stiff neck')
    expect(m.at(-1)?.possibility).toBe('Possible malaria')
  })
  it('only fires when every symptom in a rule is there', () => {
    expect(checkSymptoms(['vaginal_bleeding'])).toEqual([])
  })
})

describe.skipIf(!TEST_DATABASE_URL)('community programmes (FB-7b)', () => {
  let db: Db
  let drop: () => Promise<void>
  let url: string
  let close: () => void
  const chv = randomUUID(), otherChv = randomUUID(), doctor = randomUUID(), ghs = randomUUID(), admin = randomUUID(), patientLogin = randomUUID(), pharmacist = randomUUID()
  const tok: Record<string, string> = {}
  const mother = randomUUID(), strange = randomUUID()

  beforeAll(async () => {
    ;({ db, drop } = await freshDatabase(8))
    await db.withTransaction(SYSTEM_ID, async (q) => {
      for (const p of [mother, strange]) await q.query(`INSERT INTO patients (id, full_name) VALUES ($1, 'Test Mother')`, [p])
      for (const [id, role, patient] of [[chv, 'chv', null], [otherChv, 'chv', null], [doctor, 'doctor', null], [ghs, 'ghs_official', null], [admin, 'admin', null], [pharmacist, 'pharmacist', null], [patientLogin, 'patient', mother]] as const) {
        await q.query(`INSERT INTO practitioners (id, full_name, role, patient_id) VALUES ($1, $2, $3, $4)`, [id, `Test ${role}`, role, patient])
        tok[id] = await signToken(key, id)
      }
    })
    const server = createApp({ db, instanceId: 'test', jwtKey: key, events: { publish: async () => {} }, apiRatePerMinute: 100_000 }).listen(0)
    await new Promise((r) => server.once('listening', r))
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    close = () => server.close()
    for (const [p, owner] of [[mother, chv], [strange, otherChv]]) {
      await post(owner, '/sync/push', { id: p, resourceType: 'Patient', patientId: null, version: 1, baseVersion: null, resource: { resourceType: 'Patient', id: p, name: [{ text: 'Test Mother' }] } })
    }
    const consent = randomUUID()
    expect((await post(chv, '/sync/push', { id: consent, resourceType: 'Consent', patientId: null, version: 1, baseVersion: null, resource: { resourceType: 'Consent', id: consent, status: 'active', scope: {}, category: [{ coding: [{ code: 'clinical_care' }] }], patient: { reference: `Patient/${mother}` }, dateTime: '2026-11-01T08:00:00Z', performer: [{ display: 'patient' }] } })).status).toBe('ok')
  })
  afterAll(async () => { close?.(); await drop?.() })

  const post = async (who: string, path: string, body: J = {}) => {
    const res = await fetch(url + path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${tok[who]}` }, body: JSON.stringify(body) })
    return { http: res.status, ...(await res.json() as J) }
  }
  const get = async (who: string, path: string) => {
    const res = await fetch(url + path, { headers: { authorization: `Bearer ${tok[who]}` } })
    return { http: res.status, ...(await res.json() as J) }
  }
  const survey = { id: randomUUID(), title: 'Fever at home', questions: [{ text: 'Any fever?', options: ['Yes', 'No'] }] }

  it('every route refuses someone with no token', async () => {
    tok.nobody = 'x'
    for (const path of ['/surveys', '/maternal/pregnancies', '/decision-support/symptoms']) expect((await post('nobody', path)).http).toBe(401)
    expect((await get('nobody', '/maternal')).http).toBe(401)
  })

  it('only a GHS official builds a survey; only collectors answer; results are totals with no people in them', async () => {
    expect((await post(chv, '/surveys', survey)).http).toBe(403)
    expect((await post(ghs, '/surveys', { ...survey, id: randomUUID(), questions: [] })).http).toBe(400)
    expect((await post(ghs, '/surveys', survey)).http).toBe(201)
    expect((await post(ghs, '/surveys', survey)).http).toBe(201) // retry: same one
    expect((await get(admin, '/surveys')).http).toBe(403)
    const answer = { id: randomUUID(), answers: { q1: 'Yes' } }
    expect((await post(ghs, `/surveys/${survey.id}/answers`, answer)).http).toBe(403)
    expect((await post(chv, `/surveys/${survey.id}/answers`, answer)).http).toBe(201)
    expect((await post(chv, `/surveys/${survey.id}/answers`, answer)).http).toBe(201) // retry counts once
    expect((await post(chv, `/surveys/${survey.id}/answers`, { id: randomUUID(), answers: { q1: 'Blue' } })).http).toBe(422)
    expect((await get(chv, `/surveys/${survey.id}/results`)).http).toBe(403)
    const results = await get(ghs, `/surveys/${survey.id}/results`)
    expect(results.total).toBe(1)
    expect(results.questions[0].counts).toEqual([{ option: 'Yes', count: 1 }, { option: 'No', count: 0 }])
    expect((await get(chv, '/surveys')).surveys.length).toBe(1)
    await post(ghs, `/surveys/${survey.id}/close`)
    expect((await get(chv, '/surveys')).surveys.length).toBe(0)
    expect((await post(chv, `/surveys/${survey.id}/answers`, { id: randomUUID(), answers: { q1: 'No' } })).http).toBe(422)
  })

  it('a pregnancy needs the relationship and consent, and gets only the visits still ahead', async () => {
    const preg = { id: randomUUID(), patient_id: mother, expected_due_date: daysFromNow(70) } // 30 weeks along: 4 contacts left at least
    expect((await post(otherChv, '/maternal/pregnancies', preg)).http).toBe(403)
    expect((await post(pharmacist, '/maternal/pregnancies', preg)).http).toBe(403)
    expect((await post(chv, '/maternal/pregnancies', { ...preg, patient_id: strange })).http).toBe(403)
    expect((await post(otherChv, '/maternal/pregnancies', { ...preg, patient_id: strange })).error).toBe('consent_missing')
    expect((await post(chv, '/maternal/pregnancies', { ...preg, id: randomUUID(), expected_due_date: daysFromNow(900) })).http).toBe(422)
    expect((await post(chv, '/maternal/pregnancies', preg)).http).toBe(201)
    expect((await post(chv, '/maternal/pregnancies', preg)).http).toBe(201) // retry
    const seen = await get(chv, '/maternal')
    expect(seen.pregnancies.length).toBe(1)
    expect(seen.pregnancies[0].visits.map((v: J) => v.label)).toEqual(['30-week antenatal visit', '34-week antenatal visit', '36-week antenatal visit', '38-week antenatal visit', '40-week antenatal visit'])
    expect((await get(otherChv, '/maternal')).pregnancies).toEqual([])
    expect((await get(patientLogin, '/maternal')).pregnancies.length).toBe(1)
    expect((await get(admin, '/maternal')).http).toBe(403)
    const log = await db.query(`SELECT count(*)::int AS n FROM access_log WHERE patient_id = $1 AND outcome = 'denied'`, [mother])
    expect(log.rows[0].n).toBeGreaterThanOrEqual(1) // the refused attempt is on record
  })

  it('a child under the mother, its visits, and marking one done; another carer cannot', async () => {
    const child = { id: randomUUID(), mother_id: mother, given_name: 'Kwesi', date_of_birth: daysFromNow(-50) }
    expect((await post(otherChv, '/maternal/children', child)).http).toBe(403)
    expect((await post(chv, '/maternal/children', child)).http).toBe(201)
    const c = (await get(chv, '/maternal')).children[0]
    expect(c.visits.map((v: J) => v.label)).toEqual(['10-week visit', '14-week visit', '6-month visit', '9-month visit', '18-month visit'])
    const visit = c.visits[0].id
    expect((await post(otherChv, `/maternal/visits/${visit}/done`)).http).toBe(403)
    expect((await post(chv, `/maternal/visits/${visit}/done`)).http).toBe(200)
    expect((await post(chv, `/maternal/visits/${visit}/done`)).http).toBe(200) // a retry is harmless
    expect((await get(chv, '/maternal')).children[0].visits[0].done).toBe(true)
    expect((await post(chv, `/maternal/children/${child.id}/close`, { outcome: 'ended' })).http).toBe(400)
    expect((await post(chv, `/maternal/children/${child.id}/close`, { outcome: 'entered_in_error' })).http).toBe(200)
    expect((await get(chv, '/maternal')).children).toEqual([])
  })

  it('after consent is withdrawn the carer stops seeing the record and the mother still can', async () => {
    await db.withTransaction(chv, (q) => q.query(`UPDATE consents SET withdrawn_at = now() WHERE patient_id = $1`, [mother]))
    expect((await get(chv, '/maternal')).pregnancies).toEqual([])
    expect((await get(patientLogin, '/maternal')).pregnancies.length).toBe(1)
  })

  it('decision support is for carers, says it is not a diagnosis, and stores nothing', async () => {
    expect((await post(pharmacist, '/decision-support/symptoms', { symptoms: ['fever'] })).http).toBe(403)
    expect((await post(chv, '/decision-support/symptoms', { symptoms: ['nonsense'] })).http).toBe(400)
    const r = await post(chv, '/decision-support/symptoms', { symptoms: ['fever', 'rash'] })
    expect(r.matches[0].possibility).toMatch(/measles/)
    expect(r.matches[0].rule).toBeTruthy()
    expect(r).toMatchObject({ not_a_diagnosis: true, clinically_reviewed: false })
    expect(r.disclaimer).toMatch(/not a diagnosis/i)
  })

  it('forecasts are for surveillance staff, say they are estimates, and follow the stated method', async () => {
    await db.withTransaction(ghs, async (q) => {
      for (const [w, n] of [['2026-10-12', 2], ['2026-10-19', 4], ['2026-10-26', 6], ['2026-11-02', 8]] as const) {
        await q.query(`INSERT INTO weekly_case_counts (week_start, region, district, condition, case_count, source) VALUES ($1, 'Volta', 'Ho', 'malaria', $2, 'synthetic')`, [w, n])
      }
    })
    expect((await get(chv, '/surveillance/forecast')).http).toBe(403)
    const f = await get(ghs, '/surveillance/forecast?region=Volta')
    expect(f).toMatchObject({ estimate: true, synthetic: true, week_start: '2026-11-09' })
    expect(f.forecasts[0]).toMatchObject({ district: 'Ho', estimate: 5, low: 2, high: 8 })
    expect(f.method).toMatch(/last 4/)
  })
})
