import { hostname } from 'node:os'

/** Everything the service reads from its environment. Secrets are referenced by ARN and fetched at runtime. */
export interface Config {
  port: number
  /** Local development: a full connection string. On AWS, dbHost + dbSecretArn instead. */
  databaseUrl: string | null
  dbHost: string | null
  dbName: string
  /** RDS-managed secret ({ username, password }), read per new connection so a rotation just works. */
  dbSecretArn: string | null
  /** Path to the RDS CA bundle, so the connection verifies the server's certificate. */
  dbCaFile: string | null
  region: string
  /** Which machine answered. The EC2 user data passes the instance id; locally it's the hostname. */
  instanceId: string
  /** Signing secret for sign-in tokens: JWT_SECRET (laptop) or JWT_SECRET_ARN (Secrets Manager, JSON {"secret": "..."}). */
  jwtSecret: string | null
  jwtSecretArn: string | null
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT) || 8000,
    databaseUrl: env.DATABASE_URL || null,
    dbHost: env.DB_HOST || null,
    dbName: env.DB_NAME || 'healthconnect',
    dbSecretArn: env.DB_SECRET_ARN || null,
    dbCaFile: env.DB_CA_FILE || null,
    region: env.AWS_REGION || 'af-south-1',
    instanceId: env.INSTANCE_ID || hostname(),
    jwtSecret: env.JWT_SECRET || null,
    jwtSecretArn: env.JWT_SECRET_ARN || null,
  }
}

/** Fails fast on a configuration the service cannot run with, before it tries to open a connection. */
export function validateConfig(config: Config): void {
  const problems: string[] = []
  if (!config.databaseUrl && !(config.dbHost && config.dbSecretArn)) {
    problems.push('Set DATABASE_URL, or both DB_HOST and DB_SECRET_ARN')
  }
  if (!config.databaseUrl && config.dbHost && !config.dbCaFile) {
    problems.push('Set DB_CA_FILE to the RDS CA bundle: the connection to RDS must verify TLS')
  }
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    problems.push('PORT must be a whole number between 1 and 65535')
  }
  if (problems.length > 0) throw new Error(`Invalid configuration:\n- ${problems.join('\n- ')}`)
}
