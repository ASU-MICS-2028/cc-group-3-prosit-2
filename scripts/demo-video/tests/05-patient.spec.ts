import { expect, test } from '@playwright/test'
import { back, dwell, keepMockData, open, signIn, tab } from './_helpers'

test('Patient sees medicines, visits and pays the fee', async ({ page }) => {
  await open(page)
  await signIn(page, 'patient')
  await dwell(page, 1500)

  await page.getByRole('button', { name: 'Medicines' }).click()
  await expect(page.getByRole('heading', { name: 'Your medicines' })).toBeVisible()
  await dwell(page, 3500)
  await back(page)

  await tab(page, 'Visits')
  await dwell(page, 3000)

  // Fee for the next booked visit, if there is one. Whatever the app shows is what the video shows.
  await tab(page, 'Pay')
  await expect(page.getByRole('heading', { name: 'Receipts' })).toBeVisible()
  await dwell(page, 2000)
  const mtn = page.getByRole('button', { name: 'MTN' })
  if (await mtn.isVisible()) {
    await mtn.click()
    await page.getByLabel('Mobile money number').pressSequentially('244123456', { delay: 60 })
    await dwell(page, 1000)
    await page.getByRole('button', { name: /^Pay ₵/ }).click()
    await expect(page.getByText(/waiting for approval|Paid ₵|didn't go through|couldn't start/).first()).toBeVisible()
    await dwell(page, 6000)   // test mode settles after 3 s; live shows the votex365 approval step
  } else {
    await dwell(page, 2500)
  }

  await keepMockData(page)
})
