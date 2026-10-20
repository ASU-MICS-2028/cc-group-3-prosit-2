import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import type { Db } from '../src/db.js'

const okDb: Db = { query: async () => ({ rows: [{ '?column?': 1 }] }), close: async () => {} }
const downDb: Db = { query: async () => Promise.reject(new Error('connection refused')), close: async () => {} }

let close: (() => void) | undefined
afterEach(() => close?.())

async function start(db: Db) {
  const server = createApp({ db, instanceId: 'i-test123' }).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  close = () => server.close()
  const { port } = server.address() as AddressInfo
  return (path: string) => fetch(`http://127.0.0.1:${port}${path}`)
}

describe('health and readiness', () => {
  it('/health names the instance that answered', async () => {
    const get = await start(okDb)
    const res = await get('/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok', service: 'patient-record-service', instance: 'i-test123' })
  })

  it('/ready is 200 when the database answers', async () => {
    const get = await start(okDb)
    const res = await get('/ready')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ready', instance: 'i-test123' })
  })

  it('/ready is 503 when the database is down, and /health stays 200', async () => {
    const get = await start(downDb)
    expect((await get('/ready')).status).toBe(503)
    expect((await get('/health')).status).toBe(200)
  })

  it('unknown paths are a JSON 404', async () => {
    const get = await start(okDb)
    const res = await get('/nope')
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ error: 'not_found' })
  })
})
