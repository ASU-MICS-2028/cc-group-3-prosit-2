import { expect, type Page } from '@playwright/test'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** DEMO_MODE=test uses the app's Test mode (made-up people, mock server in browser storage). Anything else signs in for real. */
export const TEST_MODE = process.env.DEMO_MODE === 'test'

// What one scene hands to the next (patient name, prescription code, Test-mode mock data). Wiped by build-video.sh.
const STATE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.state')
mkdirSync(STATE_DIR, { recursive: true })
const STATE_FILE = path.join(STATE_DIR, 'state.json')
type State = { patient?: string; rxCode?: string; mock?: Record<string, string> }
export const readState = (): State => (existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) as State : {})
export const writeState = (patch: Partial<State>) => writeFileSync(STATE_FILE, JSON.stringify({ ...readState(), ...patch }, null, 2))

/** Synthetic names only. A fresh one per run, so repeated live runs don't pile up identical patients. */
export function newPatientName() {
  const first = ['Efua', 'Abena', 'Adjoa', 'Akua', 'Yaa', 'Afua', 'Ama', 'Esi']
  const last = ['Nyarko', 'Adomako', 'Ansah', 'Tetteh', 'Quartey', 'Agyeman', 'Badu', 'Donkor']
  const pick = (a: string[]) => a[Math.floor(Math.random() * a.length)]
  return `${pick(first)} ${pick(last)}`
}

/** Local-only secrets for the PIN setup screens. They protect the browser profile Playwright throws away. */
const PASSPHRASE = 'violet mango harbour tiger'
const PIN = '2468'

/** Test-mode names of the seeded accounts (frontend/src/auth/mockApi.ts). */
const TEST_NAMES: Record<string, string> = {
  chv: 'Ama Serwaa', patient: 'Akosua Boateng', clinician: 'Dr. Kofi Mensah', pharmacist: 'Efua Darko',
  healer: 'Nana Yaw Asare', ghs: 'Adwoa Frimpong', facility_admin: 'Kwabena Ofori', platform_admin: 'Team Admin',
}

/** Pause so viewers can read the screen. */
export const dwell = (page: Page, ms = 1800) => page.waitForTimeout(ms)

/** Open the app. In Test mode, first restore the mock "server" the earlier scenes wrote to. */
export async function open(page: Page) {
  const mock = TEST_MODE ? readState().mock ?? {} : {}
  await page.addInitScript((saved) => {
    for (const [k, v] of Object.entries(saved)) if (localStorage.getItem(k) === null) localStorage.setItem(k, v)
  }, mock)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible()
  await dwell(page, 1200)
}

/** Save the Test-mode mock data for the next scene. No-op for a live run (the server keeps it). */
export async function keepMockData(page: Page) {
  if (!TEST_MODE) return
  const mock = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter((k) => k.startsWith('hc.mock.')).map((k) => [k, localStorage.getItem(k)!])))
  writeState({ mock })
}

/** Sign in as one of the seeded test users, then do the first-time passphrase + PIN setup. */
export async function signIn(page: Page, username: string) {
  if (TEST_MODE) {
    const toTest = page.getByRole('button', { name: 'Use test mode (made-up people)' })
    if (await toTest.isVisible()) await toTest.click()
    await dwell(page, 800)
    await page.getByRole('button', { name: new RegExp(`^${TEST_NAMES[username]}`) }).click()
  } else {
    const password = process.env.TEST_PASSWORD
    if (!password) throw new Error('Set TEST_PASSWORD for a live run (or DEMO_MODE=test).')
    const toLive = page.getByRole('button', { name: 'Sign in with a real account' })
    if (await toLive.isVisible()) await toLive.click()
    await page.getByLabel('Username').fill(username)
    // The field masks it on screen. Errors are replaced so a failure can't echo the value into the log.
    try { await page.getByLabel('Password', { exact: true }).fill(password) } catch { throw new Error('Could not type into the password field') }
    await dwell(page, 600)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  }
  await setUpPin(page)
}

async function setUpPin(page: Page) {
  await expect(page.getByRole('heading', { name: 'Choose a passphrase' })).toBeVisible()
  await dwell(page, 600)
  await page.getByLabel('Passphrase', { exact: true }).fill(PASSPHRASE)
  await page.getByLabel('Type it again').fill(PASSPHRASE)
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'Choose a PIN' })).toBeVisible()
  await page.getByLabel('PIN (4 to 6 digits)').fill(PIN)
  await page.getByLabel('Type it again').fill(PIN)
  await dwell(page, 500)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
  await dwell(page, 1000)
}

/** Me → Sign out, back to the sign-in screen. */
export async function signOut(page: Page) {
  await tab(page, 'Me')
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible()
  await dwell(page, 800)
}

/** Bottom navigation tab by its label. */
export async function tab(page: Page, label: string) {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: label, exact: true }).click()
  await dwell(page, 600)
}

export const back = (page: Page) => page.getByRole('button', { name: 'Back', exact: true }).click()

/** Scroll the screen gently so a viewer sees the lower half, then back to the top. */
export async function tour(page: Page, ms = 1500) {
  await page.mouse.move(206, 400)
  await page.mouse.wheel(0, 450); await dwell(page, ms)
  await page.mouse.wheel(0, 450); await dwell(page, ms)
  await page.mouse.wheel(0, -2000); await dwell(page, 600)
}
