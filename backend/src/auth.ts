import type { Request, RequestHandler } from 'express'
import { SignJWT, jwtVerify } from 'jose'
import type { Queryable } from './db.js'
import { logger } from './logging.js'

/**
 * Who is calling. A request carries `Authorization: Bearer <token>`, a JWT signed by us (HS256) whose
 * `sub` is a practitioner id. We trust the signature, not anything else the client sends: never a
 * header like `x-user-id`, which anyone can forge.
 */
export const ISSUER = 'healthconnect'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface Actor {
  id: string
  role: string
}

/** The signing key, or null when none is configured (then every protected request is refused). */
export function signingKey(secret: string | null): Uint8Array | null {
  if (!secret) return null
  if (secret.length < 32) throw new Error('The JWT secret must be at least 32 characters')
  return new TextEncoder().encode(secret)
}

/** Issues a token for a practitioner. Used by `npm run token` (no login screen yet) and by tests. */
export function signToken(key: Uint8Array, practitionerId: string, expiresIn: string | number = '8h'): Promise<string> {
  return new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject(practitionerId).setIssuer(ISSUER)
    .setIssuedAt().setExpirationTime(expiresIn).sign(key)
}

const refuse = (res: Parameters<RequestHandler>[1], message: string) =>
  void res.status(401).json({ error: 'unauthenticated', message })

/**
 * Lets the request through only with a valid token for an **active** practitioner, and puts them in
 * `res.locals.actor`. Checking the database on every request means a deactivated account stops
 * working at once, not when its token expires.
 */
export function requireActor(key: Uint8Array | null, db: Queryable, onRefused?: (req: Request) => Promise<unknown>): RequestHandler {
  return async (req, res, next) => {
    // `onRefused` lets a route put the refused attempt on record (access_log) before answering 401.
    // If recording fails we still refuse: an audit hiccup must never let a caller in.
    const deny = async (message: string) => {
      if (onRefused) await onRefused(req).catch((error) => logger.error({ err: error }, 'could not record a refused sign-in'))
      refuse(res, message)
    }
    if (!key) return deny('Sign-in is not configured on this server')
    const header = req.get('authorization') ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
    if (!token) return deny('Sign in first')

    let sub: string | undefined
    try {
      ;({ payload: { sub } } = await jwtVerify(token, key, { algorithms: ['HS256'], issuer: ISSUER }))
    } catch {
      return deny('Your session is invalid or has expired. Sign in again')
    }
    if (!sub || !UUID.test(sub)) return deny('Your session is invalid. Sign in again')

    try {
      const { rows } = await db.query('SELECT id, role FROM practitioners WHERE id = $1 AND active', [sub])
      const row = rows[0]
      if (!row) return deny('This account is not active')
      res.locals.actor = { id: String(row.id), role: String(row.role) } satisfies Actor
      next()
    } catch (error) {
      next(error)
    }
  }
}
