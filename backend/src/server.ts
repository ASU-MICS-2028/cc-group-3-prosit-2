import { signingKey } from './auth.js'
import { createApp } from './app.js'
import { loadConfig, validateConfig } from './config.js'
import { createPgDb } from './db.js'
import { logger } from './logging.js'
import { optionalSecret } from './secrets.js'
import { noPublisher, snsPublisher } from './events.js'

const config = loadConfig()
// Fail fast: a missing database setting should stop the boot, not surface as a 500 later.
validateConfig(config)
const db = await createPgDb(config)

// Sign-in key: fail closed. Without one the API still starts (the load balancer's /health keeps working),
// but every protected route answers 401. A key that is too short stops the boot.
const fromArn = await optionalSecret<{ secret?: string }>(config, config.jwtSecretArn)
const jwtKey = signingKey(config.jwtSecret ?? fromArn?.secret ?? null)
if (!jwtKey) logger.warn('No JWT secret configured (JWT_SECRET or JWT_SECRET_ARN): protected routes will refuse every request')

const events = config.appointmentTopicArn ? snsPublisher(config.appointmentTopicArn, config.region) : noPublisher
if (!config.appointmentTopicArn) logger.warn('APPOINTMENT_TOPIC_ARN not set: appointments save, but no events are published')

const app = createApp({ db, instanceId: config.instanceId, jwtKey, events })
const server = app.listen(config.port, () => logger.info({ port: config.port, instance: config.instanceId }, 'patient-record-service listening'))

// The ASG replaces instances during a deploy: finish in-flight requests, then close the pool.
// If a connection refuses to drain, exit anyway after 10 seconds.
let shuttingDown = false
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return
  shuttingDown = true
  logger.info({ signal }, 'shutting down')
  setTimeout(() => process.exit(1), 10_000).unref()
  server.close(() => void db.close().finally(() => process.exit(0)))
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
