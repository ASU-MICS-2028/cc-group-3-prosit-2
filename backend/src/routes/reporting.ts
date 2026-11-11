import type { Express, Request, Response } from 'express'
import type { Ctx } from '../app.js'
import { requireActor, type Actor } from '../auth.js'
import { appRole } from '../roles.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const VIEWERS = ['ghs_official', 'admin']

type Scope = { facilityId: string | null; name: string }
type Figure = { code: string; label: string; counts: string; target: string; unit?: string; value: number }
type Omitted = { label: string; why: string }

/**
 * Each figure keeps its description beside its query, so the two can't drift apart. Inside `sql`, `s.since` is the
 * start of the quarter and `s.fac` the facility (NULL = every facility). `national` figures have no link to a facility.
 */
const FIGURES: (Omit<Figure, 'value'> & { sql: string; national?: boolean })[] = [
  { code: 'patients_registered', national: true, target: '3.8', label: 'Patients on the system', counts: 'Every patient record held, from any date. All are synthetic people.',
    sql: 'SELECT count(*) FROM patients' },
  { code: 'insurance_enrolments', national: true, target: '3.8', label: 'Insurance enrolments', counts: 'Patients enrolled in a plan on this system, from any date, whether or not a premium has been paid.',
    sql: 'SELECT count(*) FROM insurance_enrolments' },
  { code: 'outbreaks_confirmed', national: true, target: '3.d', label: 'Outbreaks confirmed', counts: 'Suggested outbreak alerts a GHS official confirmed this quarter.',
    sql: `SELECT count(*) FROM outbreak_alerts WHERE status = 'confirmed' AND decided_at >= s.since` },
  { code: 'patients_with_readings', target: '3.8', label: 'Patients with a reading', counts: "Different patients with at least one reading this quarter, not marked entered-in-error. For a facility: taken by that facility's staff.",
    sql: `SELECT count(DISTINCT o.patient_id) FROM observations o JOIN practitioners p ON p.id = o.recorded_by WHERE o.status <> 'entered-in-error' AND o.effective_at >= s.since AND (s.fac IS NULL OR p.facility_id = s.fac)` },
  { code: 'readings_recorded', target: '3.8', label: 'Readings recorded', counts: "Vital-sign and lab readings this quarter, not marked entered-in-error. For a facility: taken by that facility's staff.",
    sql: `SELECT count(*) FROM observations o JOIN practitioners p ON p.id = o.recorded_by WHERE o.status <> 'entered-in-error' AND o.effective_at >= s.since AND (s.fac IS NULL OR p.facility_id = s.fac)` },
  { code: 'appointments_booked', target: '3.8', label: 'Appointments booked', counts: "Appointments starting this quarter that were not cancelled. For a facility: with that facility's doctors.",
    sql: `SELECT count(*) FROM appointments a JOIN practitioners p ON p.id = a.specialist_id WHERE a.status <> 'cancelled' AND a.starts_at >= s.since AND (s.fac IS NULL OR p.facility_id = s.fac)` },
  { code: 'referrals_received', target: '3.8', label: 'Referrals', counts: 'Referrals created this quarter, except cancelled ones. For a facility: sent to it or to one of its staff.',
    sql: `SELECT count(*) FROM referrals r LEFT JOIN practitioners p ON p.id = r.to_practitioner_id WHERE r.status <> 'cancelled' AND r.created_at >= s.since AND (s.fac IS NULL OR COALESCE(r.to_facility_id, p.facility_id) = s.fac)` },
  { code: 'prescriptions_dispensed', target: '3.8', label: 'Prescriptions dispensed', counts: 'Prescriptions a pharmacist dispensed this quarter. For a facility: dispensed there.',
    sql: 'SELECT count(*) FROM prescriptions WHERE dispensed_at >= s.since AND (s.fac IS NULL OR dispensed_facility_id = s.fac)' },
  { code: 'emergencies_raised', target: '3.d', label: 'Emergencies raised', counts: 'Emergency alerts raised this quarter, except cancelled ones. For a facility: raised for it.',
    sql: `SELECT count(*) FROM emergencies WHERE status <> 'cancelled' AND created_at >= s.since AND (s.fac IS NULL OR facility_id = s.fac)` },
  { code: 'emergency_ack_minutes_median', unit: 'min', target: '3.d', label: 'Median time to acknowledge an emergency', counts: 'Middle value, in minutes, between raising and acknowledging, for emergencies raised this quarter and acknowledged.',
    sql: 'SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM acknowledged_at - created_at) / 60)::numeric, 1) FROM emergencies WHERE acknowledged_at IS NOT NULL AND created_at >= s.since AND (s.fac IS NULL OR facility_id = s.fac)' },
]

/** Asked for by the brief or usually shown on an SDG 3 page, but what we store can't support them. Estimating would be inventing. */
const NOT_COMPUTABLE: Omitted[] = [
  { label: 'Maternal mortality ratio (3.1.1)', why: 'No deaths or live births are stored.' },
  { label: 'Births with a skilled attendant (3.1.2)', why: 'No delivery records are stored.' },
  { label: 'Under-5 and newborn mortality (3.2.1, 3.2.2)', why: 'No births or deaths are stored.' },
  { label: 'Disease incidence per 1,000 people (3.3)', why: 'Case counts are stored, but no population for any district.' },
  { label: 'Universal health coverage index (3.8.1)', why: 'It is a composite of tracer services measured across a population, none of which we hold.' },
  { label: 'Share of the population insured', why: 'Enrolments are counted above, but no population figure is stored.' },
  { label: 'Share of appointments kept', why: 'Nothing in the system records whether a visit took place.' },
  { label: 'Rural and urban gap', why: 'Patients and facilities carry no rural or urban marker.' },
  { label: 'Change over time against a baseline', why: 'No baseline measurement exists.' },
]
const UNLINKED: Omitted = { label: 'Patients, insurance, outbreaks and disease cases', why: 'These records are not linked to a facility, so they appear only in the all-facilities view.' }

const CONFORMANCE: Record<string, string> = {
  fhir: 'FHIR-shaped, not FHIR-compatible (see docs/fhir-mapping.md). It follows the layout of FHIR R4 MeasureReport, but has not been checked with a FHIR validator, and its codes and measure address are local placeholders.',
  dhis2: 'Follows the layout of a DHIS2 dataValueSet. Its data set, data element and organisation unit codes are local placeholders from no real DHIS2 instance. Not imported into or validated by DHIS2.',
  who: 'A plain weekly table of district disease cases, in a layout of our own. Not a WHO schema, and not validated by or submitted to WHO. Deaths are absent because they are not stored.',
}
const slug = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, '_')

/** The start of this calendar quarter (UTC, which is Ghana's time) and its DHIS2 period code. */
function quarter(now = new Date()) {
  const q = Math.floor(now.getUTCMonth() / 3)
  return { code: `${now.getUTCFullYear()}Q${q + 1}`, start: new Date(Date.UTC(now.getUTCFullYear(), q * 3, 1)).toISOString(), end: now.toISOString() }
}

/** The SDG 3 figures, and the disease reports for the exports (empty for one facility). Totals only: no query returns a patient. */
export function reportingRoutes(app: Express, ctx: Ctx) {
  const guard = requireActor(ctx.jwtKey, ctx.db)

  /**
   * Decides which facility a request may read, or answers and returns null. A health centre admin always gets their
   * own, from the database, and is refused any other; `facilityId` from the client can only ever narrow, never widen.
   */
  const scopeOf = async (req: Request, res: Response, roles: string[]): Promise<Scope | null> => {
    const actor = res.locals.actor as Actor
    const asked = req.query.facilityId
    if (asked !== undefined && (typeof asked !== 'string' || !UUID.test(asked))) {
      res.status(400).json({ error: 'invalid_request', field: 'facilityId', message: 'facilityId must be a UUID' })
      return null
    }
    if (actor.role === 'health_centre_admin') {
      const own = (await ctx.db.query('SELECT f.id, f.name FROM practitioners p JOIN facilities f ON f.id = p.facility_id WHERE p.id = $1', [actor.id])).rows[0]
      if (!own) {
        res.status(403).json({ error: 'no_facility', message: 'This account is not linked to a facility yet' })
        return null
      }
      if (asked && asked.toLowerCase() !== String(own.id)) {
        res.status(403).json({ error: 'other_facility', message: 'You can only see your own facility' })
        return null
      }
      return { facilityId: String(own.id), name: String(own.name) }
    }
    if (!roles.includes(actor.role)) {
      res.status(403).json({ error: 'forbidden', message: `A ${actor.role} account cannot open this` })
      return null
    }
    if (!asked) return { facilityId: null, name: 'All facilities' }
    const found = (await ctx.db.query('SELECT id, name FROM facilities WHERE id = $1', [asked])).rows[0]
    if (!found) {
      res.status(404).json({ error: 'not_found', message: 'Unknown facility' })
      return null
    }
    return { facilityId: String(found.id), name: String(found.name) }
  }

  const report = async (scope: Scope) => {
    const period = quarter()
    const figures: Figure[] = []
    const omitted = [...NOT_COMPUTABLE, ...(scope.facilityId ? [UNLINKED] : [])]
    for (const { sql, national, ...f } of FIGURES) {
      if (national && scope.facilityId) continue
      const { rows } = await ctx.db.query(`SELECT (${sql}) AS value FROM (SELECT $1::timestamptz AS since, $2::uuid AS fac) s`, [period.start, scope.facilityId])
      if (rows[0]!.value === null) omitted.push({ label: f.label, why: 'Nothing has happened yet this quarter to measure it from.' })
      else figures.push({ ...f, value: Number(rows[0]!.value) })
    }
    const cases = scope.facilityId ? [] : (await ctx.db.query(
      `SELECT to_char(week_start, 'IYYY"W"FMIW') AS week, to_char(week_start, 'YYYY-MM-DD') AS from_date, to_char(week_start + 6, 'YYYY-MM-DD') AS to_date, region, district, condition, case_count, source
       FROM weekly_case_counts WHERE week_start >= $1::date ORDER BY week_start, region, district, condition`, [period.start],
    )).rows as Case[]
    const totals = new Map<string, Figure>()
    for (const c of cases) {
      const code = `cases_${c.condition}_${c.source}`
      const figure = totals.get(code) ?? { code, target: '3.3', label: `${c.condition[0]!.toUpperCase()}${c.condition.slice(1)} cases (${c.source})`, counts: `Weekly district case counts added up for weeks starting this quarter. Source: ${c.source}. A count, not a rate.`, value: 0 }
      figure.value += c.case_count
      totals.set(code, figure)
    }
    return { period, figures: [...figures, ...totals.values()], omitted, cases }
  }

  app.get('/reporting/sdg3', guard, async (req: Request, res: Response) => {
    const scope = await scopeOf(req, res, VIEWERS)
    if (!scope) return
    const { cases: _cases, ...data } = await report(scope)
    res.json({ sandbox: true, synthetic: true, scope: scope.name, ...data })
  })

  /** Built here and handed to the signed-in person's browser as a file. This server sends it nowhere else. */
  app.get('/reporting/export/:format', guard, async (req: Request, res: Response) => {
    const format = String(req.params.format)
    if (!Object.hasOwn(CONFORMANCE, format)) return void res.status(404).json({ error: 'not_found', message: 'The formats are fhir, dhis2 and who' })
    const scope = await scopeOf(req, res, VIEWERS)
    if (!scope) return
    const { period, figures, cases } = await report(scope)
    const payload = format === 'fhir' ? fhir(scope, period, figures, cases) : format === 'dhis2' ? dhis2(scope, period, figures, cases) : who(scope, period, figures, cases)
    res.json({
      notice: { sandbox: true, synthetic: true, label: 'SANDBOX: synthetic data, totals only. Generated as a download and sent to no external system.', conformance: CONFORMANCE[format] },
      format, scope: scope.name, period, payload,
    })
  })

  /** Staff of the admin's own facility. No patients. A platform admin uses GET /admin/users. */
  app.get('/facility/people', guard, async (req: Request, res: Response) => {
    const scope = await scopeOf(req, res, [])
    if (!scope) return
    const { rows } = await ctx.db.query(`SELECT id, full_name, role, active FROM practitioners WHERE facility_id = $1 AND role <> 'system' ORDER BY full_name`, [scope.facilityId])
    res.json({ facility: scope.name, people: rows.map((r) => ({ id: r.id, name: r.full_name, role: appRole(String(r.role)), active: r.active })) })
  })
}

type Period = ReturnType<typeof quarter>
type Case = { week: string; from_date: string; to_date: string; region: string; district: string; condition: string; case_count: number; source: string }

/** R4 layout, per docs/fhir-mapping.md: one MeasureReport for the figures, one per district and week for cases. `HTEST` is the HL7 code for test data. */
function fhir(scope: Scope, period: Period, figures: Figure[], cases: Case[]) {
  const SYSTEM = 'urn:healthconnect:sandbox'
  const tag = (extra: { system: string; code: string }[] = []) => ({ tag: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ActReason', code: 'HTEST', display: 'test health data' }, ...extra] })
  const report = (rest: object) => ({ resource: { resourceType: 'MeasureReport', status: 'complete', type: 'summary', measure: `${SYSTEM}:sdg3`, date: period.end, ...rest } })
  const weeks = new Map<string, Case[]>()
  for (const c of cases) weeks.set(`${c.district}|${c.week}`, [...(weeks.get(`${c.district}|${c.week}`) ?? []), c])
  return {
    resourceType: 'Bundle', type: 'collection', timestamp: period.end, meta: tag(),
    entry: [
      report({
        meta: tag(), reporter: { display: scope.name }, period: { start: period.start, end: period.end },
        group: figures.map((f) => ({ code: { coding: [{ system: `${SYSTEM}:figure`, code: f.code }], text: f.label }, ...(f.unit ? { measureScore: { value: f.value, unit: f.unit } } : { population: [{ code: { text: f.counts }, count: f.value }] }) })),
      }),
      ...[...weeks.values()].map((rows) => report({
        meta: tag([{ system: `${SYSTEM}:source`, code: rows[0]!.source }]), subject: { display: `${rows[0]!.district}, ${rows[0]!.region}` }, period: { start: rows[0]!.from_date, end: rows[0]!.to_date },
        group: rows.map((c) => ({ code: { text: c.condition }, population: [{ code: { text: 'cases' }, count: c.case_count }] })),
      })),
    ],
  }
}

function dhis2(scope: Scope, period: Period, figures: Figure[], cases: Case[]) {
  const orgUnit = `SANDBOX_${slug(scope.facilityId ? scope.name : 'Ghana')}`
  return {
    dataSet: 'SANDBOX_HC_SDG3', idScheme: 'code', completeDate: period.end.slice(0, 10), period: period.code, orgUnit,
    dataValues: [
      ...figures.filter((f) => !f.code.startsWith('cases_')).map((f) => ({ dataElement: `SANDBOX_${slug(f.code)}`, period: period.code, orgUnit, value: String(f.value), comment: f.counts })),
      ...cases.map((c) => ({ dataElement: `SANDBOX_CASES_${slug(c.condition)}`, period: c.week, orgUnit: `SANDBOX_${slug(c.district)}`, value: String(c.case_count), comment: `source: ${c.source}` })),
    ],
  }
}

function who(scope: Scope, period: Period, figures: Figure[], cases: Case[]) {
  return {
    country: 'GH', reporter: scope.name, period: period.code,
    indicators: figures.filter((f) => !f.code.startsWith('cases_')).map(({ code, label, counts, target, value }) => ({ code, label, sdgTarget: target, counts, value })),
    weeklyDiseaseCases: cases.map((c) => ({ epiWeek: c.week, region: c.region, district: c.district, disease: c.condition, cases: c.case_count, source: c.source })),
  }
}
