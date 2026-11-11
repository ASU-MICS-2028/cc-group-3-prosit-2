import type { Express, Request, Response } from 'express'
import type { Ctx } from '../app.js'
import { logAccess, type AccessEntry } from '../audit.js'
import { requireActor, type Actor } from '../auth.js'
import type { Queryable } from '../db.js'
import { DISCLAIMER, SYMPTOMS, checkSymptoms, type Symptom } from '../symptomRules.js'
import { Refusal, UUID, invalid, text } from './prescriptions.js'
import { VISIBLE, canReach } from './sync.js'

type Row = Record<string, unknown>

const CARERS = new Set(['chv', 'nurse', 'doctor', 'specialist'])
const COLLECTORS = new Set(['chv', 'nurse'])
const BUILDERS = new Set(['ghs_official'])
const denied = (message: string, patientId?: string) => new Refusal(403, { error: 'forbidden', message, ...(patientId ? { patientId } : {}) }, 'denied')
const need = (allowed: Set<string>, actor: Actor, doing: string) => { if (!allowed.has(actor.role)) throw denied(`A ${actor.role} account cannot ${doing}`) }

const uuid = (b: Row, field: string): string => {
  if (typeof b[field] !== 'string' || !UUID.test(b[field] as string)) throw invalid(field, `${field} must be a UUID`)
  return b[field] as string
}
const isoDate = (b: Row, field: string): string => {
  const v = b[field]
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) throw invalid(field, `${field} must be a date, YYYY-MM-DD`)
  return v
}

// Illustrative timings, not reviewed by a clinician (the app says so). WHO's 2016 antenatal model of 8 contacts, in
// weeks of pregnancy, and common childhood visit ages in days. Ones already past when the record is added are skipped.
const ANTENATAL_WEEKS = [12, 20, 26, 30, 34, 36, 38, 40]
const CHILD_DAYS = [0, 42, 70, 98, 183, 274, 548]
const CHILD_LABELS = ['Birth visit', '6-week visit', '10-week visit', '14-week visit', '6-month visit', '9-month visit', '18-month visit']

/** Surveys, pregnancy and child records with their visit schedules, and symptom decision support (FB-7b, SVC-9, SVC-10). */
export function communityRoutes(app: Express, ctx: Ctx) {
  const signedIn = requireActor(ctx.jwtKey, ctx.db)

  /** A refusal is answered and, if it concerns a patient, put on record. The database's own refusals are written for people. */
  const handle = (work: (req: Request, res: Response, actor: Actor) => Promise<void>) => async (req: Request, res: Response) => {
    const actor = res.locals.actor as Actor
    try {
      await work(req, res, actor)
    } catch (error) {
      if (error instanceof Refusal) {
        const { patientId, ...body } = error.body
        if (typeof patientId === 'string') await ctx.db.withTransaction(null, (q) => logAccess(q, entry(req, actor, 'read', error.outcome, patientId)))
        return void res.status(error.status).json(body)
      }
      const { code, message } = error as { code?: string; message?: string }
      if (code === '42501') return void res.status(403).json({ error: 'forbidden', message })
      if (code?.startsWith('22') || code?.startsWith('23') || code === 'P0001') return void res.status(422).json({ error: 'refused', message })
      throw error
    }
  }
  // Maternal records are part of the patient's record, so they share its resource type in access_log.
  const entry = (req: Request, actor: Actor, action: AccessEntry['action'], outcome: AccessEntry['outcome'], patientId: string): AccessEntry => ({
    accessedBy: actor.id, patientId, resourceType: 'Patient', action, outcome, sourceIp: req.ip ?? null,
  })

  /* ---------------- Surveys ---------------- */

  const surveyJson = (r: Row) => ({ id: r.id, title: r.title, questions: r.questions, status: r.status })

  app.post('/surveys', signedIn, handle(async (req, res, actor) => {
    need(BUILDERS, actor, 'build a survey')
    const b = (req.body ?? {}) as Row
    const id = uuid(b, 'id'), title = text(b, 'title')
    if (!Array.isArray(b.questions) || b.questions.length < 1 || b.questions.length > 20) throw invalid('questions', 'A survey needs 1 to 20 questions')
    const questions = b.questions.map((raw, i) => {
      const q = (raw ?? {}) as Row
      const options = q.options
      if (!Array.isArray(options) || options.length < 2 || options.length > 8 || options.some((o) => typeof o !== 'string' || !o.trim() || o.length > 100) || new Set(options).size !== options.length) {
        throw invalid('options', 'Each question needs 2 to 8 different answers to choose from')
      }
      return { id: `q${i + 1}`, text: text(q, 'text', 300), options }
    })
    const row = await ctx.db.withTransaction(actor.id, async (q) => {
      await q.query(`INSERT INTO surveys (id, title, questions) VALUES ($1, $2, $3::jsonb) ON CONFLICT (id) DO NOTHING`, [id, title, JSON.stringify(questions)])
      return (await q.query('SELECT * FROM surveys WHERE id = $1', [id])).rows[0]
    })
    res.status(201).json(surveyJson(row!))
  }))

  app.get('/surveys', signedIn, handle(async (_req, res, actor) => {
    if (!BUILDERS.has(actor.role) && !COLLECTORS.has(actor.role)) throw denied(`A ${actor.role} account cannot see surveys`)
    const open = BUILDERS.has(actor.role) ? '' : `WHERE status = 'open'`
    const { rows } = await ctx.db.query(`SELECT * FROM surveys ${open} ORDER BY created_at DESC LIMIT 100`)
    res.json({ surveys: rows.map(surveyJson) })
  }))

  app.post('/surveys/:id/close', signedIn, handle(async (req, res, actor) => {
    need(BUILDERS, actor, 'close a survey')
    if (!UUID.test(String(req.params.id))) throw invalid('id', 'id must be a UUID')
    const { rows } = await ctx.db.withTransaction(actor.id, (q) => q.query(`UPDATE surveys SET status = 'closed' WHERE id = $1 RETURNING *`, [req.params.id]))
    if (!rows[0]) throw new Refusal(404, { error: 'not_found', message: 'That survey does not exist' })
    res.json(surveyJson(rows[0]))
  }))

  /** One filled-in survey. It names nobody; the id comes from the phone, so sending twice counts once. */
  app.post('/surveys/:id/answers', signedIn, handle(async (req, res, actor) => {
    need(COLLECTORS, actor, 'record survey answers')
    if (!UUID.test(String(req.params.id))) throw invalid('id', 'id must be a UUID')
    const b = (req.body ?? {}) as Row
    const id = uuid(b, 'id')
    await ctx.db.withTransaction(actor.id, async (q) => {
      const survey = (await q.query('SELECT 1 FROM surveys WHERE id = $1', [req.params.id])).rows[0]
      if (!survey) throw new Refusal(404, { error: 'not_found', message: 'That survey does not exist' })
      await q.query(`INSERT INTO survey_answers (id, survey_id, answers) VALUES ($1, $2, $3::jsonb) ON CONFLICT (id) DO NOTHING`, [id, req.params.id, JSON.stringify(b.answers ?? {})])
    })
    res.status(201).json({ id })
  }))

  /** Totals per option: the only view of answers anyone gets. */
  app.get('/surveys/:id/results', signedIn, handle(async (req, res, actor) => {
    need(BUILDERS, actor, 'see survey results')
    if (!UUID.test(String(req.params.id))) throw invalid('id', 'id must be a UUID')
    const survey = (await ctx.db.query('SELECT questions FROM surveys WHERE id = $1', [req.params.id])).rows[0]
    if (!survey) throw new Refusal(404, { error: 'not_found', message: 'That survey does not exist' })
    const { rows } = await ctx.db.query('SELECT answers FROM survey_answers WHERE survey_id = $1', [req.params.id])
    res.json({
      total: rows.length,
      questions: (survey.questions as { id: string; text: string; options: string[] }[]).map((q) => ({
        text: q.text, counts: q.options.map((option) => ({ option, count: rows.filter((r) => (r.answers as Row)[q.id] === option).length })),
      })),
    })
  }))

  /* ---------------- Pregnancies and children ---------------- */

  /** The newest active clinical-care consent, or a refusal. Checked on every write, as consent can be withdrawn. */
  const activeConsent = async (q: Queryable, patient: string): Promise<string> => {
    const row = (await q.query(`SELECT id FROM consents WHERE patient_id = $1 AND purpose = 'clinical_care' AND withdrawn_at IS NULL ORDER BY given_at DESC LIMIT 1`, [patient])).rows[0]
    if (!row) throw new Refusal(403, { error: 'consent_missing', message: 'This person has not given consent for care. Ask them first', patientId: patient }, 'denied')
    return String(row.id)
  }
  const reach = async (q: Queryable, actor: Actor, patient: string) => {
    if (!(await canReach(q, actor, patient))) throw denied('This person is not one of your patients', patient)
  }

  /** Only people with a relationship see a record. A patient always sees their own; carers stop seeing it once consent is withdrawn. */
  const SEEN = (mother: string) => `(${mother} = $3
    OR (${mother} IN (SELECT s.patient_id FROM sync_records s WHERE ${VISIBLE})
        AND EXISTS (SELECT 1 FROM consents c WHERE c.patient_id = ${mother} AND c.purpose = 'clinical_care' AND c.withdrawn_at IS NULL)))`

  app.get('/maternal', signedIn, handle(async (req, res, actor) => {
    if (!CARERS.has(actor.role) && actor.role !== 'patient') throw denied(`A ${actor.role} account cannot see maternal records`)
    const who = [actor.id, actor.role, actor.patientId ?? null]
    const result = await ctx.db.withTransaction(actor.id, async (q) => {
      const pregnancies = (await q.query(
        `SELECT m.id, m.patient_id, p.full_name, m.expected_due_date::text AS due, m.status FROM pregnancies m JOIN patients p ON p.id = m.patient_id
         WHERE m.status = 'active' AND ${SEEN('m.patient_id')} ORDER BY m.expected_due_date LIMIT 200`, who)).rows
      const children = (await q.query(
        `SELECT m.id, m.mother_id, p.full_name, m.given_name, m.date_of_birth::text AS dob, m.status FROM children m JOIN patients p ON p.id = m.mother_id
         WHERE m.status = 'active' AND ${SEEN('m.mother_id')} ORDER BY m.date_of_birth DESC LIMIT 200`, who)).rows
      const ids = [...pregnancies, ...children].map((r) => r.id)
      const visits = (await q.query(
        `SELECT id, coalesce(pregnancy_id, child_id) AS owner, label, due_on::text AS due_on, done_at FROM visit_schedules
         WHERE pregnancy_id = ANY($1::uuid[]) OR child_id = ANY($1::uuid[]) ORDER BY due_on`, [ids])).rows
      const visitsOf = (id: unknown) => visits.filter((v) => v.owner === id).map((v) => ({ id: v.id, label: v.label, dueOn: v.due_on, done: v.done_at !== null }))
      for (const patient of new Set([...pregnancies.map((r) => r.patient_id as string), ...children.map((r) => r.mother_id as string)])) {
        await logAccess(q, entry(req, actor, 'read', 'success', patient))
      }
      return {
        pregnancies: pregnancies.map((r) => ({ id: r.id, patient: { id: r.patient_id, name: r.full_name }, dueDate: r.due, status: r.status, visits: visitsOf(r.id) })),
        children: children.map((r) => ({ id: r.id, mother: { id: r.mother_id, name: r.full_name }, givenName: r.given_name, dateOfBirth: r.dob, status: r.status, visits: visitsOf(r.id) })),
      }
    })
    res.json(result)
  }))

  app.post('/maternal/pregnancies', signedIn, handle(async (req, res, actor) => {
    need(CARERS, actor, 'add a pregnancy')
    const b = (req.body ?? {}) as Row
    const id = uuid(b, 'id'), patient = uuid(b, 'patient_id'), due = isoDate(b, 'expected_due_date')
    await ctx.db.withTransaction(actor.id, async (q) => {
      const again = (await q.query('SELECT patient_id FROM pregnancies WHERE id = $1', [id])).rows[0]
      if (again) {
        if (again.patient_id !== patient) throw new Refusal(409, { error: 'id_conflict', message: 'This id is already used' })
        return
      }
      await reach(q, actor, patient)
      const consent = await activeConsent(q, patient)
      await q.query('INSERT INTO pregnancies (id, patient_id, consent_id, expected_due_date) VALUES ($1, $2, $3, $4)', [id, patient, consent, due])
      await q.query(
        `INSERT INTO visit_schedules (pregnancy_id, label, due_on)
         SELECT $1, w || '-week antenatal visit', $2::date - (40 - w) * 7 FROM unnest($3::int[]) w
         WHERE $2::date - (40 - w) * 7 >= current_date`, [id, due, ANTENATAL_WEEKS])
      await logAccess(q, entry(req, actor, 'create', 'success', patient))
    })
    res.status(201).json({ id })
  }))

  app.post('/maternal/children', signedIn, handle(async (req, res, actor) => {
    need(CARERS, actor, 'add a child')
    const b = (req.body ?? {}) as Row
    const id = uuid(b, 'id'), mother = uuid(b, 'mother_id'), name = text(b, 'given_name', 60), dob = isoDate(b, 'date_of_birth')
    await ctx.db.withTransaction(actor.id, async (q) => {
      const again = (await q.query('SELECT mother_id FROM children WHERE id = $1', [id])).rows[0]
      if (again) {
        if (again.mother_id !== mother) throw new Refusal(409, { error: 'id_conflict', message: 'This id is already used' })
        return
      }
      await reach(q, actor, mother)
      const consent = await activeConsent(q, mother)
      await q.query('INSERT INTO children (id, mother_id, consent_id, given_name, date_of_birth) VALUES ($1, $2, $3, $4, $5)', [id, mother, consent, name, dob])
      await q.query(
        `INSERT INTO visit_schedules (child_id, label, due_on)
         SELECT $1, l, $2::date + d FROM unnest($3::int[], $4::text[]) t(d, l) WHERE $2::date + d >= current_date`, [id, dob, CHILD_DAYS, CHILD_LABELS])
      await logAccess(q, entry(req, actor, 'create', 'success', mother))
    })
    res.status(201).json({ id })
  }))

  /** Closing is the only change: delivered, ended, or added by mistake. A closed record's visits stop reminding. */
  const close = (table: 'pregnancies' | 'children', mother: string, outcomes: string[]) => handle(async (req, res, actor) => {
    need(CARERS, actor, 'close this record')
    if (!UUID.test(String(req.params.id))) throw invalid('id', 'id must be a UUID')
    const outcome = (req.body as Row | undefined)?.outcome
    if (typeof outcome !== 'string' || !outcomes.includes(outcome)) throw invalid('outcome', `outcome must be one of ${outcomes.join(', ')}`)
    await ctx.db.withTransaction(actor.id, async (q) => {
      const row = (await q.query(`SELECT ${mother} AS mother FROM ${table} WHERE id = $1 FOR UPDATE`, [req.params.id])).rows[0]
      if (!row) throw new Refusal(404, { error: 'not_found', message: 'That record does not exist' })
      await reach(q, actor, row.mother as string)
      await q.query(`UPDATE ${table} SET status = $2 WHERE id = $1`, [req.params.id, outcome])
      await logAccess(q, entry(req, actor, 'update', 'success', row.mother as string))
    })
    res.json({ id: req.params.id, status: outcome })
  })
  app.post('/maternal/pregnancies/:id/close', signedIn, close('pregnancies', 'patient_id', ['delivered', 'ended', 'entered_in_error']))
  app.post('/maternal/children/:id/close', signedIn, close('children', 'mother_id', ['entered_in_error']))

  /** A visit happened. Marking it twice answers the same, so a retry from a poor signal is harmless. */
  app.post('/maternal/visits/:id/done', signedIn, handle(async (req, res, actor) => {
    need(CARERS, actor, 'mark a visit')
    if (!UUID.test(String(req.params.id))) throw invalid('id', 'id must be a UUID')
    await ctx.db.withTransaction(actor.id, async (q) => {
      const v = (await q.query(
        `SELECT v.done_at, coalesce(p.patient_id, c.mother_id) AS mother FROM visit_schedules v
         LEFT JOIN pregnancies p ON p.id = v.pregnancy_id LEFT JOIN children c ON c.id = v.child_id WHERE v.id = $1 FOR UPDATE OF v`, [req.params.id])).rows[0]
      if (!v) throw new Refusal(404, { error: 'not_found', message: 'That visit does not exist' })
      await reach(q, actor, v.mother as string)
      await activeConsent(q, v.mother as string)
      if (v.done_at) return
      await q.query('UPDATE visit_schedules SET done_at = now(), done_by = $2 WHERE id = $1', [req.params.id, actor.id])
      await logAccess(q, entry(req, actor, 'update', 'success', v.mother as string))
    })
    res.json({ id: req.params.id, done: true })
  }))

  /* ---------------- Symptom decision support ---------------- */

  /** Nothing is stored and no patient is named: the symptoms go in, the rules that fired come out. */
  app.post('/decision-support/symptoms', signedIn, handle(async (req, res, actor) => {
    need(CARERS, actor, 'use decision support')
    const symptoms = ((req.body ?? {}) as Row).symptoms
    if (!Array.isArray(symptoms) || symptoms.length === 0 || symptoms.some((s) => typeof s !== 'string' || !Object.hasOwn(SYMPTOMS, s))) throw invalid('symptoms', 'Choose at least one symptom from the list')
    res.json({ matches: checkSymptoms(symptoms as Symptom[]), disclaimer: DISCLAIMER, not_a_diagnosis: true, clinically_reviewed: false })
  }))
}
