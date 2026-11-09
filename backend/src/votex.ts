import { createHmac, timingSafeEqual } from 'node:crypto'
import { logger } from './logging.js'

/** votex365 partner payments, as in Prosit 1 (https://partners.votex365.com/docs): GHS through a hosted checkout page. */
export type ProviderStatus = 'pending' | 'successful' | 'failed'
export interface VotexSecret { api_key: string; webhook_secret: string }
export interface CheckoutRequest { reference: string; amount: number; description: string; customer: { name?: string; phone: string }; metadata: Record<string, string> }
export interface Checkout { providerRef: string; checkoutUrl: string; status: ProviderStatus }
export interface WebhookEvent { providerRef: string; reference: string; status: ProviderStatus }

export interface CheckoutProvider {
  create(request: CheckoutRequest): Promise<Checkout>
  status(providerRef: string): Promise<ProviderStatus>
  /** The verified event; 'ignored' for a genuine event we don't use; null when the signature or time is wrong. */
  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>, nowMs: number): Promise<WebhookEvent | 'ignored' | null>
}

/** The provider couldn't be reached. The API answers 503; the payment stays, and a retry opens the checkout. */
export class ProviderUnavailable extends Error {}

type VotexPayment = { id: string; reference: string; status: 'pending' | 'paid' | 'failed'; checkout_url?: string }
const toStatus = (s: VotexPayment['status']): ProviderStatus => (s === 'paid' ? 'successful' : s === 'failed' ? 'failed' : 'pending')
const WEBHOOK_TOLERANCE_MS = 5 * 60_000

export function votexProvider(baseUrl: string, returnUrl: string, loadSecret: () => Promise<VotexSecret | null>): CheckoutProvider {
  const secret = async () => {
    const value = await loadSecret()
    if (!value?.api_key) throw new ProviderUnavailable('no api key')
    return value
  }
  async function call(path: string, init: RequestInit = {}): Promise<VotexPayment> {
    const { api_key } = await secret()
    const res = await fetch(`${baseUrl}${path}`, { ...init, headers: { Authorization: `Bearer ${api_key}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15_000) }).catch(() => null)
    const body = (await res?.json().catch(() => null)) as (VotexPayment & { detail?: { code?: string } }) | null
    if (!res?.ok || !body) {
      logger.error({ status: res?.status, code: body?.detail?.code, path }, 'votex365 call failed')
      throw new ProviderUnavailable('votex365 call failed')
    }
    return body
  }
  return {
    async create({ reference, amount, description, customer, metadata }) {
      const p = await call('/payments', { method: 'POST', body: JSON.stringify({ amount, description, reference, return_url: returnUrl, customer, metadata }) })
      return { providerRef: p.id, checkoutUrl: p.checkout_url ?? '', status: toStatus(p.status) }
    },
    status: async (ref) => toStatus((await call(`/payments/${encodeURIComponent(ref)}`)).status),
    async verifyWebhook(rawBody, headers, nowMs) {
      const { webhook_secret } = await secret()
      const timestamp = String(headers['x-votex-webhook-timestamp'] ?? '')
      const signature = String(headers['x-votex-webhook-signature'] ?? '')
      if (!/^\d+$/.test(timestamp) || Math.abs(nowMs - Number(timestamp) * 1000) > WEBHOOK_TOLERANCE_MS) return null
      const expected = createHmac('sha256', webhook_secret).update(`${timestamp}.`).update(rawBody).digest()
      const given = Buffer.from(signature, 'hex')
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
      let event: { event?: string; data?: VotexPayment }
      try { event = JSON.parse(rawBody.toString('utf8')) as typeof event } catch { return 'ignored' }
      if (!event.data?.id || !['payment.succeeded', 'payment.failed'].includes(event.event ?? '')) return 'ignored'
      return { providerRef: event.data.id, reference: event.data.reference, status: event.event === 'payment.succeeded' ? 'successful' : 'failed' }
    },
  }
}
