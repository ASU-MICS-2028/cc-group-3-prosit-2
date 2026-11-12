import { test } from '@playwright/test'
import { dwell, open, signIn, tab } from './_helpers'

// Only shown if the app really switches language or text size. Otherwise the scene is left out of the video.
test('Me: Twi and text size', async ({ page }) => {
  await open(page)
  await signIn(page, 'patient')
  await tab(page, 'Me')
  await dwell(page, 1500)

  const before = await page.locator('body').innerText()
  const twi = page.getByText('Twi', { exact: true }).first()
  if (await twi.isVisible()) { await twi.click(); await dwell(page, 1500) }
  const translated = (await page.locator('body').innerText()) !== before
  const textSize = page.getByText(/text size/i).first()
  const hasTextSize = await textSize.isVisible()

  // build-video.sh leaves a skipped scene (and its card) out of the video.
  test.skip(!translated && !hasTextSize, 'No working language switch or text size control in this build')
  await dwell(page, 3000)
  if (hasTextSize) {
    await textSize.scrollIntoViewIfNeeded()
    // Pick the largest option the control offers, whatever its shape (buttons or a range).
    const slider = page.getByRole('slider').first()
    const radios = page.getByRole('radio')
    if (await slider.isVisible()) await slider.press('End')
    else if (await radios.count()) await radios.last().check().catch(() => {})
    else await page.getByRole('button', { name: /large|bigger|A\+/i }).last().click().catch(() => {})
    await dwell(page, 3500)
  }
})
