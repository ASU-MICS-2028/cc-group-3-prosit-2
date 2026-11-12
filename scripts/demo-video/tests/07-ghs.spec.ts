import { expect, test } from '@playwright/test'
import { dwell, keepMockData, open, signIn, tab, tour } from './_helpers'

test('GHS official: surveillance dashboard and outbreak alert', async ({ page }) => {
  await open(page)
  await signIn(page, 'ghs')
  await expect(page.getByRole('heading', { name: 'Needs a decision' })).toBeVisible()
  await dwell(page, 3000)

  await tab(page, 'Map')
  await expect(page.getByRole('heading', { name: /by district/ })).toBeVisible()
  await tour(page)

  await tab(page, 'Alerts')
  await expect(page.getByText(/Synthetic data|No possible outbreaks/).first()).toBeVisible()
  await dwell(page, 3000)
  const confirm = page.getByRole('button', { name: 'Confirm and alert the area' }).first()
  if (await confirm.isVisible()) {
    await confirm.click()
    await expect(page.getByText(/community alert was logged|Confirmed/).first()).toBeVisible()
    await dwell(page, 3500)
  }

  await keepMockData(page)
})
