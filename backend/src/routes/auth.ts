import { createHash, randomBytes } from 'node:crypto'
import type { Express, Request, Response } from 'express'
import type { Ctx } from '../app.js'
import { requireActor, signToken, type Actor } from '../auth.js'
import { hashPassword, verifyPassword } from '../passwords.js'
import { appRole } from '../roles.js'

const ACCESS_SECONDS = 60 * 60 // a stolen sign-in token stops working within the hour
const REFRESH_DAYS = 30 // a phone that's offline for weeks can still come back without a new password
const MAX_FAILURES = 5
const LOCK_MINUTES = 15
const REFUSED = { error: 'unauthenticated', message: 'Wrong username or password' }

// Compared against when the username doesn't exist, so "no such user" takes as long as "wrong password".
const DUMMY_HASH = hashPassword(randomBytes(16).toString('hex'))
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

/** The person as the app sees them; the role is translated to the app's name. */
const SELECT_PERSON = `SELECT p.id, p.full_name, p.role, p.patient_id, COALESCE(f.name, p.facility) AS facility
  FROM practitioners p LEFT JOIN facilities f ON f.id = p.facility_id WHERE p.id = $1 AND p.active`

export function authRoutes(app: Express, ctx: Ctx) {
  const toUser = (r: Record<string, unknown>) => ({
    id: r.id, name: r.full_name, role: appRole(String(r.role)), ...(r.facility ? { facility: r.facility } : {}), ...(r.patient_id ? { patientId: r.patient_id } : {}),
  })

  const startSession = async (person: Record<string, unknown>) => {
    const refreshToken = randomBytes(32).toString('base64url')
    await ctx.db.query(
      `INSERT INTO refresh_tokens (token_hash, practitioner_id, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))`,
      [sha256(refreshToken), person.id, REFRESH_DAYS],
    )
    const user = toUser(person)
    const token = await signToken(ctx.jwtKey!, String(person.id), ACCESS_SECONDS + 's', { role: user.role })
    return { token, refreshToken, expiresIn: ACCESS_SECONDS, user, mode: 'live' }
  }

  const logEvent = (practitionerId: string | null, outcome: string, req: Request) =>
    ctx.db.query('INSERT INTO login_events (practitioner_id, outcome, source_ip) VALUES ($1, $2, $3::inet)', [practitionerId, outcome, req.ip ?? null])

  app.post('/auth/login', async (req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store')
    const { username, password } = (req.body ?? {}) as Record<string, unknown>
    if (typeof username !== 'string' || !username || username.length > 100 || typeof password !== 'string' || !password || password.length > 200) {
      return void res.status(400).json({ error: 'invalid_request', message: 'Send a username and a password' })
    }
    if (!ctx.jwtKey) return void res.status(503).json({ error: 'not_configured', message: 'Sign-in is not configured on this server' })

    const { rows } = await ctx.db.query(
      `SELECT c.practitioner_id, c.password_hash, c.locked_until > now() AS locked, p.active, p.role
       FROM practitioner_credentials c JOIN practitioners p ON p.id = c.practitioner_id WHERE c.username = $1`,
      [username],
    )
    const account = rows[0]
    if (!account) {
      await verifyPassword(password, await DUMMY_HASH)
      await logEvent(null, 'unknown_user', req)
      return void res.status(401).json(REFUSED)
    }
    const id = String(account.practitioner_id)
    if (account.locked) {
      await logEvent(id, 'locked', req)
      return void res.status(429).json({ error: 'locked', message: `Too many wrong passwords. Try again in ${LOCK_MINUTES} minutes` })
    }
    if (!(await verifyPassword(password, String(account.password_hash)))) {
      await ctx.db.query(
        `UPDATE practitioner_credentials SET failed_attempts = failed_attempts + 1,
           locked_until = CASE WHEN failed_attempts + 1 >= $2 THEN now() + make_interval(mins => $3) END
         WHERE practitioner_id = $1`,
        [id, MAX_FAILURES, LOCK_MINUTES],
      )
      await logEvent(id, 'wrong_password', req)
      return void res.status(401).json(REFUSED)
    }
    if (!account.active || !appRole(String(account.role))) {
      await logEvent(id, 'inactive', req)
      return void res.status(401).json(REFUSED)
    }
    await ctx.db.query('UPDATE practitioner_credentials SET failed_attempts = 0, locked_until = NULL WHERE practitioner_id = $1', [id])
    await logEvent(id, 'success', req)
    const person = (await ctx.db.query(SELECT_PERSON, [id])).rows[0]!
    res.json(await startSession(person))
  })

  /**
   * Swaps a refresh token for a new sign-in. Each one works once. If a used one comes back, someone has
   * a copy, so every open sign-in for that person ends.
   * ponytail: a phone that loses the reply to a refresh has to sign in again; add a short grace period if that's common.
   */
  app.post('/auth/refresh', async (req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store')
    const presented = (req.body as { refreshToken?: unknown } | undefined)?.refreshToken
    if (typeof presented !== 'string' || !presented) return void res.status(400).json({ error: 'invalid_request', message: 'Send a refreshToken' })
    if (!ctx.jwtKey) return void res.status(503).json({ error: 'not_configured', message: 'Sign-in is not configured on this server' })

    const hash = sha256(presented)
    const swapped = await ctx.db.query(
      'UPDATE refresh_tokens SET used_at = now() WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() RETURNING practitioner_id',
      [hash],
    )
    const expired = { error: 'unauthenticated', message: 'Your session has ended. Sign in again' }
    const id = swapped.rows[0]?.practitioner_id
    if (!id) {
      await ctx.db.query(
        `UPDATE refresh_tokens SET used_at = now() WHERE used_at IS NULL AND practitioner_id =
           (SELECT practitioner_id FROM refresh_tokens WHERE token_hash = $1 AND used_at IS NOT NULL)`,
        [hash],
      )
      return void res.status(401).json(expired)
    }
    const person = (await ctx.db.query(SELECT_PERSON, [id])).rows[0]
    if (!person || !appRole(String(person.role))) return void res.status(401).json(expired)
    res.json(await startSession(person))
  })

  /** Ends this sign-in. Always answers 204, so it says nothing about whether a token was real. */
  app.post('/auth/logout', async (req: Request, res: Response) => {
    const presented = (req.body as { refreshToken?: unknown } | undefined)?.refreshToken
    if (typeof presented === 'string' && presented) {
      await ctx.db.query('UPDATE refresh_tokens SET used_at = now() WHERE token_hash = $1 AND used_at IS NULL', [sha256(presented)])
    }
    res.status(204).end()
  })

  app.get('/auth/me', requireActor(ctx.jwtKey, ctx.db), async (_req: Request, res: Response) => {
    const person = (await ctx.db.query(SELECT_PERSON, [(res.locals.actor as Actor).id])).rows[0]
    res.json({ user: toUser(person!) })
  })
}
