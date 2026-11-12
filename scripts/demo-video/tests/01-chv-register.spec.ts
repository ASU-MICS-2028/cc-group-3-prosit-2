import { expect, test } from '@playwright/test'
import { dwell, keepMockData, newPatientName, open, signIn, tab, writeState } from './_helpers'

test('CHV registers a patient offline, then it syncs', async ({ page, context }) => {
  const name = newPatientName()
  writeState({ patient: name })

  await open(page)
  await signIn(page, 'chv')

  // No signal from here on.
  await context.setOffline(true)
  await expect(page.getByText("You're offline", { exact: false }).first()).toBeVisible()
  await dwell(page, 1500)

  await tab(page, 'Patients')
  await page.getByRole('button', { name: 'Add patient' }).click()
  await page.getByLabel('Full name').pressSequentially(name, { delay: 40 })
  await page.getByLabel('Village or town').fill('Dodowa')
  await page.getByLabel('Year of birth').fill('1988')
  await page.getByRole('button', { name: 'Female' }).click()
  await dwell(page, 1000)
  await page.getByRole('button', { name: 'Save and continue' }).click()

  // Consent before any reading.
  await expect(page.getByText('May we write down your health readings')).toBeVisible()
  await dwell(page, 2000)
  await page.getByRole('button', { name: 'I agree', exact: true }).click()

  await page.getByRole('button', { name: 'Record vitals' }).click()
  await page.getByLabel('Blood pressure, top number').fill('152')
  await page.getByLabel('Bottom number').fill('96')
  await page.getByLabel('Temperature').fill('37.9')
  await page.getByLabel('Weight').fill('64')
  await dwell(page, 1000)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Latest readings' })).toBeVisible()
  await dwell(page, 2500)

  // Still offline: everything is waiting on the phone.
  await tab(page, 'Today')
  await expect(page.getByText(/waiting to send/)).toBeVisible()
  await dwell(page, 2500)

  // Signal back: the app sends by itself.
  await context.setOffline(false)
  await expect(page.getByText('Everything is sent')).toBeVisible({ timeout: 45_000 })
  await dwell(page, 2000)

  await keepMockData(page)
})
