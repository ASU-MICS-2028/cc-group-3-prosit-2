import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import helmet from 'helmet'
import { pinoHttp } from 'pino-http'
import type { Db } from './db.js'
import type { EventPublisher } from './events.js'
import { logger } from './logging.js'
import { appointmentRoutes } from './routes/appointments.js'

export interface Ctx {
  db: Db
  instanceId: string
  /** Signing key for sign-in tokens; null = sign-in not configured, so protected routes refuse everyone. */
  jwtKey: Uint8Array | null
  /** Where domain events go (SNS in AWS; a stand-in in tests). */
  events: EventPublisher
}

export function createApp(ctx: Ctx): Express {
  const app = express()
  app.disable('x-powered-by')
  // Trust exactly one proxy, the ALB. `true` would trust every hop, letting a client forge
  // X-Forwarded-For and put a fake IP into the audit log.
  app.set('trust proxy', 1)
  // One JSON line per request. Bodies are never logged: they will hold patient data.
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' || req.url === '/ready' } }))
  app.use(helmet())
  app.use(express.json({ limit: '100kb' }))

  // Liveness, checked by the ALB. Names the instance so the load-balancing demo shows who answered.
  app.get('/health', (_req, res) => void res.json({ status: 'ok', service: 'patient-record-service', instance: ctx.instanceId }))
  // Readiness: the database answers too.
  app.get('/ready', async (_req, res) => {
    try {
      await ctx.db.query('SELECT 1')
      res.json({ status: 'ready', instance: ctx.instanceId })
    } catch (error) {
      logger.error({ err: error }, 'readiness check failed')
      res.status(503).json({ status: 'unavailable', instance: ctx.instanceId })
    }
  })

  appointmentRoutes(app, ctx)

  app.use((_req, res) => void res.status(404).json({ error: 'not_found', message: 'Not found' }))
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const type = (error as { type?: string }).type
    if (type === 'entity.parse.failed') return void res.status(400).json({ error: 'invalid_json', message: 'Body must be JSON' })
    if (type === 'entity.too.large') return void res.status(413).json({ error: 'too_large', message: 'The request body is too large' })
    logger.error({ err: error }, 'unexpected error')
    res.status(500).json({ error: 'server_error', message: 'Unexpected error' })
  })
  return app
}
