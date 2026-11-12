import { expect, test } from '@playwright/test'
import { back, dwell, keepMockData, open, readState, signIn, tab, writeState } from './_helpers'

test('Doctor acknowledges, accepts the referral and prescribes', async ({ page }) => {
  const { patient } = readState()
  if (!patient) throw new Error('Run scene 1 first')

  await open(page)
  await signIn(page, 'clinician')
  // Today: the visit the CHV booked.
  await expect(page.getByRole('button', { name: new RegExp(`^${patient}`) }).first()).toBeVisible({ timeout: 45_000 })
  await dwell(page, 2500)

  await tab(page, 'Inbox')
  const emergency = page.getByRole('button', { name: new RegExp(`Emergency · not acknowledged.*${patient}|${patient}.*Emergency · not acknowledged`) }).first()
  const emergencyAny = page.getByRole('button', { name: /Emergency · not acknowledged/ }).first()
  await expect(emergencyAny).toBeVisible()
  await dwell(page, 2500)
  await ((await emergency.count()) ? emergency : emergencyAny).click()
  await expect(page.getByRole('button', { name: "I'm on it" })).toBeVisible()
  await dwell(page, 2000)
  await page.getByRole('button', { name: "I'm on it" }).click()
  await expect(page.getByRole('button', { name: 'Mark as resolved' })).toBeVisible()
  await dwell(page, 2500)

  await back(page)
  await page.getByRole('button', { name: new RegExp(`^${patient}.*Referral ·`) }).first().click()
  await expect(page.getByRole('button', { name: 'Accept' })).toBeVisible()
  await dwell(page, 2000)
  await page.getByRole('button', { name: 'Accept' }).click()
  await expect(page.getByRole('button', { name: 'Open patient record' })).toBeVisible()
  await dwell(page, 1500)
  await page.getByRole('button', { name: 'Open patient record' }).click()
  await expect(page.getByRole('heading', { name: 'Latest readings' })).toBeVisible()
  await dwell(page, 2500)

  // Prescription with a one-time verification code.
  await tab(page, 'Prescribe')
  await page.getByRole('button', { name: patient, exact: true }).first().click()
  await page.getByLabel('Medicine').pressSequentially('Amlodipine 5 mg', { delay: 30 })
  await page.getByLabel('How much each time').fill('1 tablet')
  await page.getByLabel('How often').fill('each morning')
  await dwell(page, 1000)
  await page.getByRole('button', { name: 'Issue prescription' }).click()
  const code = page.locator('.rx-code')
  await expect(code).toBeVisible()
  writeState({ rxCode: (await code.innerText()).replace(/\s/g, '') })
  await page.mouse.move(206, 400)
  await page.mouse.wheel(0, 250)
  await dwell(page, 4000)

  await keepMockData(page)
})
