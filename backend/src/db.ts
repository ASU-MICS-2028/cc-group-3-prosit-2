import { readFileSync } from 'node:fs'
import pg from 'pg'
import type { Config } from './config.js'
import { logger } from './logging.js'
import { getSecretJson } from './secrets.js'

export interface Queryable {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>
}

export interface Db extends Queryable {
  /**
   * Runs `fn` in one transaction on one connection. The acting practitioner is set first
   * (`app.user_id`, transaction-local), so the database's triggers record who did each write (D-015).
   * With `actorId` null, the database refuses any audited write: only unauthenticated audit rows
   * (`access_log` with no user) can go in. Any error rolls the whole transaction back.
   */
  withTransaction<T>(actorId: string | null, fn: (q: Queryable) => Promise<T>): Promise<T>
  close(): Promise<void>
}

interface DbCredentials {
  username: string
  password: string
}

/**
 * Postgres on RDS, or any DATABASE_URL for local work. On RDS the password is fetched for every new
 * connection, so a rotated secret is picked up without a restart, and TLS is verified against the RDS CA.
 */
export async function createPgDb(config: Config): Promise<Db> {
  let poolConfig: pg.PoolConfig
  if (config.databaseUrl) {
    poolConfig = { connectionString: config.databaseUrl }
  } else {
    if (!config.dbHost || !config.dbSecretArn || !config.dbCaFile) throw new Error('Set DB_HOST, DB_SECRET_ARN and DB_CA_FILE')
    const secretArn = config.dbSecretArn
    const [host, port] = config.dbHost.split(':')
    const { username } = await getSecretJson<DbCredentials>(config, secretArn)
    poolConfig = {
      host,
      port: Number(port) || 5432,
      database: config.dbName,
      user: username,
      password: async () => (await getSecretJson<DbCredentials>(config, secretArn)).password,
      ssl: { ca: readFileSync(config.dbCaFile, 'utf8'), rejectUnauthorized: true },
    }
  }

  return dbFromPool(new pg.Pool({ max: 10, idleTimeoutMillis: 30_000, ...poolConfig }))
}

/** Wraps a pool as our `Db`. Exported so tests can point it at a throwaway database. */
export function dbFromPool(pool: pg.Pool): Db {
  pool.on('error', (error) => logger.error({ err: error }, 'idle database client error'))
  return {
    query: (sql, params) => pool.query(sql, params),
    async withTransaction(actorId, fn) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        // set_config(..., true) is the parameterised form of SET LOCAL: it ends with the transaction,
        // so a pooled connection never carries one request's user into the next.
        if (actorId) await client.query("SELECT set_config('app.user_id', $1, true)", [actorId])
        const result = await fn({ query: (sql, params) => client.query(sql, params) })
        await client.query('COMMIT')
        return result
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {})
        throw error
      } finally {
        client.release()
      }
    },
    close: () => pool.end(),
  }
}
