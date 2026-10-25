import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'
import { dbFromPool, type Db } from '../src/db.js'

/**
 * Database tests need a real Postgres (Elise's rules live in triggers and constraints).
 * Set TEST_DATABASE_URL to a server you can create databases on, e.g.
 *   docker run -d --name hc-test-pg -e POSTGRES_PASSWORD=test -p 55432:5432 postgres:16
 *   TEST_DATABASE_URL=postgres://postgres:test@localhost:55432/postgres npm test
 * Without it, these tests are skipped (and say so). CI always sets it.
 */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
if (!TEST_DATABASE_URL) {
  // Skipping is fine on a laptop, never in CI: a green run that tested nothing is worse than a red one.
  if (process.env.CI) throw new Error('TEST_DATABASE_URL must be set in CI: the database tests would be skipped')
  console.warn('[test] TEST_DATABASE_URL not set: database tests are SKIPPED')
}

/** The "system" practitioner seeded by migration 001; a valid actor for tests. */
export const SYSTEM_ID = '00000000-0000-0000-0000-000000000000'

const MIGRATIONS = join(import.meta.dirname, '../../db/migrations')

/** A brand-new database with every migration applied, and a way to throw it away. */
export async function freshDatabase(poolSize = 4): Promise<{ db: Db; pool: pg.Pool; drop: () => Promise<void> }> {
  if (!TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL not set')
  const name = `hc_api_test_${process.pid}_${Math.random().toString(36).slice(2, 8)}`
  const admin = new pg.Client({ connectionString: TEST_DATABASE_URL })
  await admin.connect()
  await admin.query(`CREATE DATABASE ${name}`)
  await admin.end()

  const url = new URL(TEST_DATABASE_URL)
  url.pathname = `/${name}`
  const migrate = new pg.Client({ connectionString: url.toString() })
  await migrate.connect()
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    await migrate.query(readFileSync(join(MIGRATIONS, file), 'utf8'))
  }
  await migrate.end()

  const pool = new pg.Pool({ connectionString: url.toString(), max: poolSize })
  return {
    db: dbFromPool(pool),
    pool,
    drop: async () => {
      await pool.end()
      const a = new pg.Client({ connectionString: TEST_DATABASE_URL })
      await a.connect()
      await a.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`)
      await a.end()
    },
  }
}

/** The SQLSTATE code a database error carries, e.g. '42501' or '23503'. */
export const sqlState = (error: unknown) => (error as { code?: string }).code
