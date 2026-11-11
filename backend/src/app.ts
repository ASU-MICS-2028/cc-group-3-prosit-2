import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import { rateLimit } from 'express-rate-limit'
import helmet from 'helmet'
import { pinoHttp } from 'pino-http'
import { isDatabaseOutage, type Db } from './db.js'
import type { EventPublisher } from './events.js'
import { logger } from './logging.js'
import type { CheckoutProvider } from './votex.js'
import { adminRoutes } from './routes/admin.js'
import { appointmentRoutes } from './routes/appointments.js'
import { authRoutes } from './routes/auth.js'
import { insurancePremium, insuranceRoutes } from './routes/insurance.js'
import { patientRoutes } from './routes/patients.js'
import { paymentRoutes, webhookBodyParser } from './routes/payments.js'
import { prescriptionRoutes } from './routes/prescriptions.js'
import { recordingRoutes } from './routes/recordings.js'
import { surveillanceRoutes } from './routes/surveillance.js'
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
  /** votex365 checkout; null means every payment is simulated, and the app says so. */
  checkout?: CheckoutProvider | null
  /** Sign-in calls allowed per minute from one address, per server. Defaults to 60; the load test raises it. */
  authRatePerMinute?: number
  /** All other calls allowed per minute from one address, per server. Defaults to 600; the load test raises it. */
  apiRatePerMinute?: number
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
      res.set('Access-Control-Expose-Headers', 'Retry-After') // otherwise the app can't read it from another origin
      res.set('Access-Control-Max-Age', '600')
    }
    if (req.method === 'OPTIONS') return void res.status(204).end()
    next()
  })
  // Photos and voice notes come through sync, so that one path takes more.
  app.use('/sync/push', syncBodyParser)
  app.use('/webhooks/votex365', webhookBodyParser)
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

  // Every route below needs sign-in and a database call, so a flood from one address could tie up the servers.
  // 600 a minute: a whole clinic can share one address and a sync sends many calls. /health and /ready sit above
  // this on purpose, so the ALB's checks are never refused.
  app.use(rateLimit({
    windowMs: 60_000, limit: ctx.apiRatePerMinute ?? 600, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'too_many_requests', message: 'Too many requests. Wait a minute and try again' },
  }))

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
  surveillanceRoutes(app, ctx)
  syncRoutes(app, ctx)
  prescriptionRoutes(app, ctx)
  recordingRoutes(app, ctx)
  paymentRoutes(app, ctx, { insurance_premium: insurancePremium })
  insuranceRoutes(app, ctx)
  adminRoutes(app, ctx)

  app.use((_req, res) => void res.status(404).json({ error: 'not_found', message: 'Not found' }))
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const type = (error as { type?: string }).type
    if (type === 'entity.parse.failed') return void res.status(400).json({ error: 'invalid_json', message: 'Body must be JSON' })
    if (type === 'entity.too.large') return void res.status(413).json({ error: 'too_large', message: 'The request body is too large' })
    if (isDatabaseOutage(error)) {
      logger.error({ err: error }, 'database unreachable')
      return void res.status(503).set('Retry-After', '15').json({ error: 'unavailable', message: 'The service is briefly unavailable. Your data is safe on your phone; try again soon' })
    }
    logger.error({ err: error }, 'unexpected error')
    res.status(500).json({ error: 'server_error', message: 'Unexpected error' })
  })
  return app
}
