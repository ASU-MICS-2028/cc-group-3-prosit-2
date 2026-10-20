import { createApp } from './app.js'
import { loadConfig, validateConfig } from './config.js'
import { createPgDb } from './db.js'
import { logger } from './logging.js'

const config = loadConfig()
// Fail fast: a missing database setting should stop the boot, not surface as a 500 later.
validateConfig(config)
const db = await createPgDb(config)

const app = createApp({ db, instanceId: config.instanceId })
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
