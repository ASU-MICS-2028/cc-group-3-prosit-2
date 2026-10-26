import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '../src/db.js'
import { SYSTEM_ID, TEST_DATABASE_URL, freshDatabase, sqlState } from './pg.js'

const newPractitioner = (q: { query: Db['query'] }, id = randomUUID(), name = 'Test Nurse') =>
  q.query(`INSERT INTO practitioners (id, full_name, role) VALUES ($1, $2, 'nurse')`, [id, name]).then(() => id)

describe.skipIf(!TEST_DATABASE_URL)('withTransaction against the real schema', () => {
  let db: Db
  let drop: () => Promise<void>
  beforeAll(async () => ({ db, drop } = await freshDatabase()))
  afterAll(async () => drop?.())

  it('stamps the acting user on every write', async () => {
    const id = await db.withTransaction(SYSTEM_ID, (q) => newPractitioner(q))
    const { rows } = await db.query('SELECT created_by FROM practitioners WHERE id = $1', [id])
    expect(rows[0]?.created_by).toBe(SYSTEM_ID)
  })

  it('refuses a write when no user is set', async () => {
    const error = await db.withTransaction(null, (q) => newPractitioner(q)).catch((e) => e)
    expect(sqlState(error)).toBe('42501') // insufficient_privilege: "No acting user set"
  })

  it('refuses a write by a user who is not a practitioner', async () => {
    const error = await db.withTransaction(randomUUID(), (q) => newPractitioner(q)).catch((e) => e)
    expect(sqlState(error)).toBe('23503') // foreign key: created_by must be a real practitioner
  })

  it('rolls everything back when anything in the transaction fails', async () => {
    const id = randomUUID()
    await db
      .withTransaction(SYSTEM_ID, async (q) => {
        await newPractitioner(q, id)
        throw new Error('something after the insert failed')
      })
      .catch(() => {})
    const { rows } = await db.query('SELECT 1 FROM practitioners WHERE id = $1', [id])
    expect(rows).toHaveLength(0)
  })

  it('never leaks one request\'s user into the next on a reused connection', async () => {
    const { db: single, drop: dropSingle } = await freshDatabase(1) // one connection, always reused
    try {
      await single.withTransaction(SYSTEM_ID, (q) => newPractitioner(q))
      const error = await single.withTransaction(null, (q) => newPractitioner(q)).catch((e) => e)
      expect(sqlState(error)).toBe('42501')
      const { rows } = await single.query("SELECT current_setting('app.user_id', true) AS v")
      expect(rows[0]?.v ?? '').toBe('')
    } finally {
      await dropSingle()
    }
  })

  it('keeps concurrent requests\' users apart', async () => {
    const nurse = await db.withTransaction(SYSTEM_ID, (q) => newPractitioner(q, randomUUID(), 'Actor A'))
    const [a, b] = await Promise.all([
      db.withTransaction(nurse, (q) => newPractitioner(q)),
      db.withTransaction(SYSTEM_ID, (q) => newPractitioner(q)),
    ])
    const { rows } = await db.query('SELECT id, created_by FROM practitioners WHERE id = ANY($1)', [[a, b]])
    const by = Object.fromEntries(rows.map((r) => [r.id, r.created_by]))
    expect(by[a]).toBe(nurse)
    expect(by[b]).toBe(SYSTEM_ID)
  })

  it('can still log an unauthenticated attempt (access_log allows no user)', async () => {
    await db.withTransaction(null, (q) =>
      q.query(`INSERT INTO access_log (accessed_by, resource_type, action, outcome) VALUES (NULL, 'Patient', 'read', 'denied')`),
    )
    const { rows } = await db.query(`SELECT count(*)::int AS n FROM access_log WHERE outcome = 'denied'`)
    expect(rows[0]?.n).toBe(1)
  })
})
