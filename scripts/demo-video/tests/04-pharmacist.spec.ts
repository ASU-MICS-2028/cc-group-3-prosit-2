import { expect, test } from '@playwright/test'
import { dwell, keepMockData, open, readState, signIn, tab } from './_helpers'

test('Pharmacist verifies, dispenses, and a second dispense is refused', async ({ page }) => {
  const { rxCode } = readState()
  if (!rxCode) throw new Error('Run scene 3 first')

  await open(page)
  await signIn(page, 'pharmacist')

  const code = page.getByLabel('Verification code')
  await code.pressSequentially(rxCode, { delay: 80 })
  await page.getByRole('button', { name: 'Check code' }).click()
  await expect(page.getByRole('button', { name: 'Dispense', exact: true })).toBeVisible()
  await dwell(page, 3000)
  await page.getByRole('button', { name: 'Dispense', exact: true }).click()
  await expect(page.getByText("Dispensed. This code can't be used again.")).toBeVisible()
  await dwell(page, 3000)

  // The same code again.
  await page.getByRole('button', { name: 'Check code' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Already dispensed' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Dispense', exact: true })).toHaveCount(0)
  await dwell(page, 4000)

  await tab(page, 'Dispensed')
  await dwell(page, 2500)
  await tab(page, 'Stock')
  await dwell(page, 3000)

  await keepMockData(page)
})
