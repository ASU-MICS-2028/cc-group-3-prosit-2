import { expect, test } from '@playwright/test'
import { back, dwell, keepMockData, open, signIn, tab } from './_helpers'

test('Health centre admin: facility, low stock, quality review', async ({ page }) => {
  await open(page)
  await signIn(page, 'facility_admin')
  await expect(page.getByText('Low stock')).toBeVisible()
  await dwell(page, 3500)

  await tab(page, 'Stock')
  await expect(page.getByRole('heading', { name: 'Levels' })).toBeVisible()
  await dwell(page, 3500)

  await tab(page, 'Home')
  await page.getByRole('button', { name: 'Quality review' }).click()
  await expect(page.getByRole('heading', { name: 'Quality review' })).toBeVisible()
  await dwell(page, 3500)
  await back(page)
  await dwell(page, 800)

  await keepMockData(page)
})
