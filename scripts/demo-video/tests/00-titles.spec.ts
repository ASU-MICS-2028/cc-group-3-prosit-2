import { test } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync } from 'node:fs'

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'titles')
mkdirSync(OUT, { recursive: true })

const LIVE_URL = 'app-hc.agroconnect.space'
// file name = scene slug used by build-video.sh
const CARDS: Array<{ file: string; kicker: string; title: string; watch: string[] }> = [
  { file: 'intro', kicker: 'ICS 534 · Prosit 2', title: 'HealthConnect Ghana — Group 3 Highlanders', watch: [LIVE_URL, 'All data synthetic'] },
  { file: '01-chv-register', kicker: 'Scene 1 · Community health volunteer', title: 'Register a patient with no signal', watch: ['Phone goes offline', 'Patient, consent and vitals saved on the phone', 'Signal returns: everything sends by itself'] },
  { file: '02-chv-refer', kicker: 'Scene 2 · Community health volunteer', title: 'Refer, book, raise an emergency', watch: ['Priority suggested from vitals and danger signs', 'Video visit booked with Dr. Mensah', 'Emergency with escalation timeline'] },
  { file: '03-clinician', kicker: 'Scene 3 · Doctor', title: 'Inbox, acknowledge, prescribe', watch: ['Emergency and referral arrive in the inbox', '"I\'m on it" stops the escalation', 'Prescription with a one-time code'] },
  { file: '04-pharmacist', kicker: 'Scene 4 · Pharmacist', title: 'Verify and dispense once', watch: ['Code checked against the prescription', 'Dispensed', 'Same code again: refused'] },
  { file: '05-patient', kicker: 'Scene 5 · Patient', title: 'Medicines, visits, fees', watch: ['Their own prescriptions', 'Visits screen', 'Consultation fee by mobile money (test mode)'] },
  { file: '06-healer', kicker: 'Scene 6 · Traditional healer', title: 'Referral only with consent', watch: ['CHV records the patient\'s consent first', 'Healer accepts, notes remedies', 'Refers back to the clinic'] },
  { file: '07-ghs', kicker: 'Scene 7 · Ghana Health Service', title: 'Surveillance and outbreak alerts', watch: ['Regional dashboard', 'Disease map by district', 'Confirm a possible outbreak'] },
  { file: '08-facility', kicker: 'Scene 8 · Health centre admin', title: 'Facility, stock, quality review', watch: ['Facility home with low-stock card', 'Stock levels', 'Recorded visits for quality review'] },
  { file: '09-platform', kicker: 'Scene 9 · Platform admin', title: 'Users, audit, revenue', watch: ['Every account and its role', 'Audit log: who opened what, no health data', 'Revenue from payments'] },
  { file: '10-language', kicker: 'Scene 10 · Patient', title: 'Twi and larger text', watch: ['Me screen: language set to Twi', 'Text size'] },
  { file: 'outro', kicker: 'Thank you', title: 'HealthConnect Ghana — Group 3 Highlanders', watch: [LIVE_URL, 'All data synthetic'] },
]

test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false, video: 'off' })

test('generate title cards', async ({ page }) => {
  for (const c of CARDS) {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;height:100%;background:#1d2b4f;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}
      .wrap{display:flex;flex-direction:column;justify-content:center;height:100vh;padding:0 96px;box-sizing:border-box}
      .kicker{font-size:26px;letter-spacing:.12em;text-transform:uppercase;opacity:.8;margin-bottom:20px}
      h1{font-size:60px;line-height:1.1;margin:0 0 36px;font-weight:800}
      ul{list-style:none;padding:0;margin:0;font-size:32px;line-height:1.6}
      li:before{content:"›  ";opacity:.6}
      .bar{width:160px;height:6px;background:#f2b84b;border-radius:3px;margin-bottom:32px}
    </style></head><body><div class="wrap">
      <div class="bar"></div>
      <div class="kicker">${esc(c.kicker)}</div>
      <h1>${esc(c.title)}</h1>
      <ul>${c.watch.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>
    </div></body></html>`)
    await page.screenshot({ path: path.join(OUT, `${c.file}.png`) })
  }
})
