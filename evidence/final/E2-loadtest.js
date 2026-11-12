// E2 load test: 1,000 concurrent users write 50,000 records through the real sync API.
// Each of 1,000 virtual users registers 10 synthetic patients; each patient is 5 records
// (Patient, Consent, 3 temperature readings) = 1,000 x 10 x 5 = 50,000 records.
// Names start with "LOADTEST" so the rows can be found later. Synthetic data only.
//
// Run (from the load-test machine in af-south-1):
//   LT_USER=loadtest_chv LT_PASSWORD=... k6 run --summary-export E2-summary.json E2-loadtest.js
import http from 'k6/http'
import { check } from 'k6'
import { Counter } from 'k6/metrics'
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js'

const API = __ENV.API || 'https://api-hc.agroconnect.space'
const records = new Counter('records_stored')

export const options = {
  scenarios: {
    chvs: { executor: 'per-vu-iterations', vus: 1000, iterations: 10, maxDuration: '30m' },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],          // under 1% errors
    'http_req_duration{kind:push}': ['p(95)<2000'],
    records_stored: ['count>=50000'],
  },
}

// One sign-in for the whole run (a token lasts 1 hour; the run is capped at 30 minutes).
export function setup() {
  const res = http.post(`${API}/auth/login`, JSON.stringify({ username: __ENV.LT_USER, password: __ENV.LT_PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } })
  if (res.status !== 200) throw new Error(`sign-in failed: ${res.status}`)
  return { token: res.json('token') }
}

function push(token, resource) {
  const res = http.post(`${API}/sync/push`,
    JSON.stringify({ id: resource.id, resourceType: resource.resourceType, patientId: null, version: 1, baseVersion: null, resource }),
    { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, tags: { kind: 'push', type: resource.resourceType } })
  if (check(res, { 'stored (201)': (r) => r.status === 201 })) records.add(1)
  return res
}

export default function (data) {
  const p = uuidv4()
  const now = new Date().toISOString()
  push(data.token, { resourceType: 'Patient', id: p, name: [{ text: `LOADTEST ${__VU}-${__ITER}` }], gender: __ITER % 2 ? 'male' : 'female',
    birthDate: String(1950 + (__VU % 60)), address: [{ city: 'Loadtest' }] })
  const c = uuidv4()
  push(data.token, { resourceType: 'Consent', id: c, status: 'active', scope: { coding: [{ system: 's', code: 'patient-privacy' }] },
    category: [{ coding: [{ system: 'p', code: 'clinical_care' }] }], patient: { reference: `Patient/${p}` }, dateTime: now, performer: [{ display: 'patient' }] })
  for (let i = 0; i < 3; i++) {
    push(data.token, { resourceType: 'Observation', id: uuidv4(), status: 'final', category: [{ coding: [{ system: 's', code: 'vital-signs' }] }],
      code: { coding: [{ system: 'http://loinc.org', code: '8310-5' }] }, subject: { reference: `Patient/${p}` }, effectiveDateTime: now,
      valueQuantity: { value: 36.5 + i * 0.3, unit: '°C', system: 'u', code: 'Cel' },
      // Each reading names the consent it was taken under (the API refuses it otherwise).
      extension: [{ url: 'https://healthconnect.example/observation-consent', valueReference: { reference: `Consent/${c}` } }] })
  }
}
