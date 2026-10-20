import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager'
import type { Config } from './config.js'

const TTL_MS = 5 * 60_000
const cache = new Map<string, { value: unknown; at: number }>()
let client: SecretsManagerClient | null = null

/**
 * Reads a JSON secret with the instance role's credentials, cached for 5 minutes so a rotated value is
 * picked up soon without calling Secrets Manager on every request.
 */
export async function getSecretJson<T>(config: Config, arn: string): Promise<T> {
  const hit = cache.get(arn)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T
  client ??= new SecretsManagerClient({ region: config.region })
  const { SecretString } = await client.send(new GetSecretValueCommand({ SecretId: arn }))
  if (!SecretString) throw new Error(`Secret ${arn} has no value yet`)
  const value = JSON.parse(SecretString) as T
  cache.set(arn, { value, at: Date.now() })
  return value
}

/** Like getSecretJson, but null when the secret is not configured or has no value yet (optional integrations). */
export async function optionalSecret<T>(config: Config, arn: string | null): Promise<T | null> {
  if (!arn) return null
  try {
    return await getSecretJson<T>(config, arn)
  } catch (error) {
    console.warn(`[secrets] ${arn} unavailable: ${(error as Error).message}`)
    return null
  }
}
