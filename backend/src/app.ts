import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import { rateLimit } from 'express-rate-limit'
import helmet from 'helmet'
import { pinoHttp } from 'pino-http'
import type { Db } from './db.js'
import type { EventPublisher } from './events.js'
import { logger } from './logging.js'
import { appointmentRoutes } from './routes/appointments.js'
import { authRoutes } from './routes/auth.js'
import { patientRoutes } from './routes/patients.js'
import { syncBodyParser, syncRoutes } from './routes/sync.js'

export interface Ctx {
  db: Db
  instanceId: string
  /** Signing key for sign-in tokens; null = sign-in not configured, so protected routes refuse everyone. */
  jwtKey: Uint8Array | null
  /** Where domain events go (SNS in AWS; a stand-in in tests). */
  events: EventPublisher
  /** Websites allowed to call this API from a browser (CORS). Defaults to the live app. */
  corsOrigins?: string[]
  /** Sign-in calls allowed per minute from one address, per server. Defaults to 60; the load test raises it. */
  authRatePerMinute?: number
}

const LIVE_APP = 'https://app-hc.agroconnect.space'

export function createApp(ctx: Ctx): Express {
  const app = express()
  app.disable('x-powered-by')
  // Trust exactly one proxy, the ALB. `true` would trust every hop, letting a client forge
  // X-Forwarded-For and put a fake IP into the audit log.
  app.set('trust proxy', 1)
  // One JSON line per request. Bodies are never logged: they will hold patient data.
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' || req.url === '/ready' } }))
  app.use(helmet())
  // CORS: tell browsers which websites may call us. It doesn't replace sign-in; only a browser obeys it.
  const allowed = new Set(ctx.corsOrigins ?? [LIVE_APP])
  app.use((req, res, next) => {
    res.vary('Origin')
    const origin = req.get('origin')
    if (origin && allowed.has(origin)) {
      res.set('Access-Control-Allow-Origin', origin)
      res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
      res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      res.set('Access-Control-Max-Age', '600')
    }
    if (req.method === 'OPTIONS') return void res.status(204).end()
    next()
  })
  // Photos and voice notes come through sync, so that one path takes more.
  app.use('/sync/push', syncBodyParser)
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

  // Password checks are slow on purpose, so unlimited sign-ins could tie up a server. The account lock doesn't
  // cover guesses across many usernames; this does. 60, not 5: a whole clinic can share one address.
  // ponytail: counted per server (two servers = up to double); move the count to a shared store if that matters.
  app.use('/auth', rateLimit({
    windowMs: 60_000, limit: ctx.authRatePerMinute ?? 60, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'too_many_requests', message: 'Too many sign-in attempts. Wait a minute and try again' },
  }))
  authRoutes(app, ctx)
  appointmentRoutes(app, ctx)
  patientRoutes(app, ctx)
  syncRoutes(app, ctx)

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
