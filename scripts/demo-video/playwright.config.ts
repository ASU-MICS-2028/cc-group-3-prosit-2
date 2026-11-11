import { defineConfig, devices } from '@playwright/test'

// One clip per scene. Phone-sized portrait viewport, letterboxed into 1280x720 by build-video.sh (as in Prosit 1).
export default defineConfig({
  testDir: './tests',
  timeout: 240_000,
  expect: { timeout: 20_000 },
  retries: 0,
  workers: 1,            // scenes run in order: later ones use what earlier ones created
  reporter: [['list']],
  use: {
    baseURL: process.env.DEMO_URL || 'https://app-hc.agroconnect.space',
    viewport: { width: 412, height: 820 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: devices['Pixel 7'].userAgent,
    locale: 'en-GB',
    timezoneId: 'Africa/Accra',
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
    trace: 'off',        // a trace would keep typed values; the password must not land on disk
    screenshot: 'off',
    video: { mode: 'on', size: { width: 412, height: 820 } },
  },
  projects: [{ name: 'chromium', use: {} }],
})
