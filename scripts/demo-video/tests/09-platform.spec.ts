import { expect, test } from '@playwright/test'
import { dwell, keepMockData, open, signIn, tab, tour } from './_helpers'

test('Platform admin: users, audit log, revenue', async ({ page }) => {
  await open(page)
  await signIn(page, 'platform_admin')
  await expect(page.getByRole('button', { name: /^Switch (off|on) / }).first()).toBeVisible()
  await tour(page, 1200)

  // Live, these rows include the reads and writes from the earlier scenes.
  await tab(page, 'Audit')
  await expect(page.getByRole('heading', { name: 'Sign-ins, last 7 days' })).toBeVisible()
  await tour(page, 1800)

  await tab(page, 'Settings')
  await page.getByRole('button', { name: 'Revenue' }).click()
  await expect(page.getByRole('heading', { name: 'Simulated, not real money' })).toBeVisible()
  await dwell(page, 3500)

  await keepMockData(page)
})
