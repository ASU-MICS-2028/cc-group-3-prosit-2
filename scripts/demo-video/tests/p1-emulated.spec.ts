import { expect, test } from '@playwright/test'
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { signIn, tab } from './_helpers'

// P1 stand-in: what can be checked in an emulated phone (Chrome, Pixel 7 size) against the live app.
// NOT a real phone: no real fingerprint sensor, microphone, home-screen install or airplane mode.
// Run alone: npx playwright test tests/p1-emulated.spec.ts
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'evidence', 'final')
mkdirSync(OUT, { recursive: true })
const LOG = path.join(OUT, 'P1-emulated.txt')
const log = (s: string) => { appendFileSync(LOG, s + '\n'); console.log(s) }
const shot = (page: import('@playwright/test').Page, name: string) => page.screenshot({ path: path.join(OUT, `P1-emulated-${name}.png`) })

// A 2G-like link (EDGE): 256 kbit/s down, 128 kbit/s up, 800 ms round trip. Chrome network emulation, not a real 2G network.
const TWO_G = { offline: false, latency: 800, downloadThroughput: 32_000, uploadThroughput: 16_000 }

test.use({
  video: 'off',
  permissions: ['microphone'],
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
})

test('P1 emulated phone checks on the live app', async ({ page, context, baseURL }) => {
  test.setTimeout(600_000)
  writeFileSync(LOG, `P1 emulated phone checks, ${new Date().toISOString()}\nTarget: ${baseURL}\nDevice: Chrome (Playwright) emulating a Pixel 7, 412x820. Not a real phone.\n\n`)

  // 1. Cold first load on a 2G-like link, empty cache.
  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  await cdp.send('Network.emulateNetworkConditions', TWO_G)
  let bytes = 0
  cdp.on('Network.loadingFinished', (e: { encodedDataLength: number }) => { bytes += e.encodedDataLength })
  const t0 = Date.now()
  await page.goto('/', { timeout: 180_000 })
  await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible({ timeout: 180_000 })
  log(`1. 2G-like cold load (256/128 kbit/s, 800 ms RTT, no cache): sign-in screen usable after ${((Date.now() - t0) / 1000).toFixed(1)} s, ${(bytes / 1024).toFixed(0)} KB transferred`)
  await shot(page, '1-2g-cold-load')
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: false })

  // 2. Installable: manifest fields and a service worker in control.
  const manifest = await page.evaluate(async () => {
    const href = document.querySelector('link[rel="manifest"]')?.getAttribute('href')
    return href ? await (await fetch(href)).json() : null
  })
  const sizes = (manifest?.icons ?? []).map((i: { sizes: string }) => i.sizes).join(', ')
  log(`2. Manifest: name "${manifest?.name}", display "${manifest?.display}", start_url "${manifest?.start_url}", icons ${sizes}`)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible()
  const sw = await page.evaluate(async () => { await navigator.serviceWorker.ready; return !!navigator.serviceWorker.controller })
  log(`   Service worker registered and ready; controls the page on its first load: ${sw ? 'yes' : 'no (it takes over from the next load)'}`)

  // 3. Sign in, then lose the signal and restart the app.
  await signIn(page, 'chv')
  await tab(page, 'Patients')
  await page.waitForTimeout(3000) // let the first download finish
  const ctl = await page.evaluate(() => !!navigator.serviceWorker.controller)
  log(`   Before going offline, service worker controls the page: ${ctl ? 'yes' : 'no'}`)
  await context.setOffline(true)
  await page.reload()
  const served = await page.evaluate(() => !!navigator.serviceWorker.controller)
  const passphrase = page.getByLabel('Passphrase', { exact: true })
  if (await passphrase.isVisible({ timeout: 15_000 }).catch(() => false)) {
    await passphrase.fill('violet mango harbour tiger')
    await page.getByRole('button', { name: /Unlock|Continue/ }).first().click()
  }
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible({ timeout: 30_000 })
  await tab(page, 'Patients')
  log(`3. Offline restart: app opened with no network after a reload (served by the service worker: ${served ? 'yes' : 'no'}); saved records unlocked with the passphrase`)
  await shot(page, '3-offline-start')

  // 4. Voice note with no signal (fake microphone).
  await page.getByRole('main').getByRole('button').filter({ hasText: /[A-Z][a-z]+ [A-Z][a-z]+/ }).first().click()
  const mic = page.getByRole('button', { name: 'Record a voice note' }).first()
  await mic.scrollIntoViewIfNeeded()
  await mic.click()
  await page.waitForTimeout(3000)
  await page.getByRole('button', { name: 'Stop recording' }).first().click()
  await expect(page.getByText(/Voice note · /).first()).toBeVisible({ timeout: 20_000 })
  log(`4. Voice note recorded and saved offline (Chrome's fake microphone): ${await page.getByText(/Voice note · /).first().innerText()}`)
  await shot(page, '4-voice-note-offline')

  // 5. Back online; fingerprint unlock with Chrome's virtual authenticator (WebAuthn), not a real sensor.
  await context.setOffline(false)
  await cdp.send('WebAuthn.enable')
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true } })
  await tab(page, 'Me')
  await page.getByRole('button', { name: 'Turn on fingerprint unlock' }).click()
  await expect(page.getByText('Fingerprint turned on.')).toBeVisible({ timeout: 20_000 })
  log(`5. Fingerprint unlock enrolled with a virtual platform authenticator (WebAuthn): "Fingerprint turned on."`)
  await shot(page, '5-fingerprint-on')
  log(`\nStill needs a real phone: home-screen install, a real fingerprint, real microphone, airplane mode, a real 2G/3G network.`)
})
