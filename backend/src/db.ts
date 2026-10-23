import { readFileSync } from 'node:fs'
import pg from 'pg'
import type { Config } from './config.js'
import { logger } from './logging.js'
import { getSecretJson } from './secrets.js'

export interface Db {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>
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

  const pool = new pg.Pool({ max: 10, idleTimeoutMillis: 30_000, ...poolConfig })
  pool.on('error', (error) => logger.error({ err: error }, 'idle database client error'))
  return {
    query: (sql, params) => pool.query(sql, params),
    close: () => pool.end(),
  }
}
