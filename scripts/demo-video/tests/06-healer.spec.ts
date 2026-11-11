import { expect, test } from '@playwright/test'
import { dwell, keepMockData, open, readState, signIn, signOut, tab } from './_helpers'

// The healer can't start a referral to themselves: a CHV (or doctor) sends it, and only with the patient's consent.
test('CHV refers to a healer with consent; healer accepts and refers back', async ({ page }) => {
  const { patient } = readState()
  if (!patient) throw new Error('Run scene 1 first')

  await open(page)
  await signIn(page, 'chv')
  await tab(page, 'Care')
  await page.getByRole('button', { name: 'Healers' }).click()
  await page.getByRole('button', { name: /^Nana Yaw Asare/ }).click()
  const chip = page.getByRole('button', { name: patient, exact: true }).first()
  await expect(chip).toBeVisible({ timeout: 45_000 })   // the patient comes down from the server first
  await chip.click()
  await expect(page.getByText('May we send your name and the reason below to this healer?')).toBeVisible()
  await dwell(page, 2500)
  await page.getByRole('button', { name: 'Record consent' }).click()
  await expect(page.getByText('Consent recorded for a healer referral.')).toBeVisible()
  await page.getByLabel('Reason for the referral').pressSequentially('Asks for herbal support alongside clinic care', { delay: 20 })
  await dwell(page, 1000)
  await page.getByRole('button', { name: 'Send to healer' }).click()
  await expect(page.getByRole('heading', { name: 'Sent and returned' })).toBeVisible()
  await page.getByRole('heading', { name: 'Sent and returned' }).scrollIntoViewIfNeeded()
  await dwell(page, 3000)
  await keepMockData(page)
  await signOut(page)

  // The healer.
  await signIn(page, 'healer')
  const card = page.locator('section').filter({ hasText: patient }).first()
  await expect(card).toBeVisible()
  await dwell(page, 2500)
  await card.getByRole('button', { name: 'Accept' }).click()
  await tab(page, 'Patients')
  const mine = page.locator('section').filter({ hasText: patient }).first()
  await mine.getByLabel('Remedies in use (optional)').pressSequentially('Ginger and lemongrass tea', { delay: 20 })
  await dwell(page, 1000)
  await mine.getByRole('button', { name: 'Mark finished' }).click()
  await dwell(page, 1500)
  await mine.getByLabel('Why refer back to the clinic').pressSequentially('Blood pressure still high, please review', { delay: 20 })
  await dwell(page, 1000)
  await mine.getByRole('button', { name: 'Refer back to the clinic' }).click()
  await expect(mine.getByLabel('Why refer back to the clinic')).toHaveValue('')
  await dwell(page, 3000)

  await keepMockData(page)
})
