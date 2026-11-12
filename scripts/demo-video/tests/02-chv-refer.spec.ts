import { expect, test, type Page } from '@playwright/test'
import { dwell, keepMockData, open, readState, signIn, tab } from './_helpers'

async function openPatient(page: Page, name: string) {
  await tab(page, 'Patients')
  await page.getByRole('button', { name: new RegExp(`^${name}`) }).first().click()
  await expect(page.getByRole('heading', { name: 'Latest readings' })).toBeVisible()
}

test('CHV refers, books a visit and raises an emergency', async ({ page }) => {
  const { patient } = readState()
  if (!patient) throw new Error('Run scene 1 first')

  await open(page)
  await signIn(page, 'chv')
  // A fresh phone: the patient comes back down from the server.
  await tab(page, 'Patients')
  await expect(page.getByRole('button', { name: new RegExp(`^${patient}`) }).first()).toBeVisible({ timeout: 45_000 })
  await openPatient(page, patient)
  await dwell(page, 1500)

  // Referral: readings are filled in, a danger sign raises the suggested priority.
  await page.getByRole('button', { name: 'Refer', exact: true }).click()
  await page.getByLabel('Reason').pressSequentially('Headache and high blood pressure for 3 days', { delay: 25 })
  await page.getByRole('button', { name: 'Severe pain' }).click()
  await expect(page.getByRole('button', { name: 'Send referral' })).toBeEnabled()
  await dwell(page, 1500)
  await page.mouse.move(206, 400)
  await page.mouse.wheel(0, 500)
  await dwell(page, 2500)
  await page.getByRole('button', { name: 'Send referral' }).click()
  await expect(page.getByText('pending')).toBeVisible()
  await dwell(page, 2500)

  // Video visit with the doctor, so the doctor can see the record.
  await openPatient(page, patient)
  await page.getByRole('button', { name: 'Book a visit' }).click()
  await page.getByRole('option').last().click()
  await page.locator('.slots button:enabled').first().click()
  await dwell(page, 1200)
  await page.getByRole('button', { name: 'Book visit' }).click()
  await expect(page.getByRole('heading', { name: 'Coming up' })).toBeVisible()
  await dwell(page, 2500)

  // Emergency for the same patient.
  await openPatient(page, patient)
  await page.getByRole('button', { name: 'Emergency', exact: true }).click()
  await page.getByRole('button', { name: 'Struggling to breathe' }).click()
  await page.getByLabel('Where (optional)').fill('House behind the chapel')
  await dwell(page, 1000)
  await page.getByRole('button', { name: 'Emergency', exact: true }).click()
  await dwell(page, 1500)
  await page.getByRole('button', { name: 'Yes, raise it' }).click()
  await expect(page.getByText('Raised by')).toBeVisible()
  await dwell(page, 3500)

  await keepMockData(page)
})
