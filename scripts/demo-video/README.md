# Demo walkthrough video

Automated end-to-end walkthrough of the HealthConnect PWA, recorded with Playwright (one clip per scene) and
stitched with ffmpeg (title card + clip per scene, intro and outro cards). Output: `healthconnect-demo.mp4`,
1280×720, 30 fps, H.264, no audio (narrate live). Same approach as Group 3's Prosit 1 video.

**Live run, 12 Nov 2026 00:30:** all 10 scenes passed against app-hc; 4 min 20 s. The first live run (11 Nov) found a real bug: a patient with only a year of birth was refused by the API, fixed in #88. Role screenshots from this run: `evidence/final/F2-role-*.png`.

The mp4 is **not committed** (it's in `.gitignore`); the final copy lives in the group Google Drive.

## What the video shows (in order)

| # | Role (test user) | What happens |
|---|---|---|
| — | — | Intro: "HealthConnect Ghana — Group 3 Highlanders", live URL, "All data synthetic" |
| 1 | CHV (`chv`) | Phone goes offline (`context.setOffline(true)`). Registers a patient with a made-up name, records care consent, records vitals. Today shows "N waiting to send". Signal returns: "Everything is sent". |
| 2 | CHV (`chv`) | Fresh phone: the patient comes back from the server. Referral to Dr. Mensah with a danger sign (priority suggested from vitals + signs). Books a video visit with Dr. Mensah. Raises an emergency for the patient; shows the escalation timeline. |
| 3 | Doctor (`clinician`) | Today shows the booked visit. Inbox: emergency → "I'm on it"; referral → Accept → read-only patient record. Prescribe → prescription card with verification code + QR. |
| 4 | Pharmacist (`pharmacist`) | Types the code → Dispense → "Dispensed. This code can't be used again." Checks the same code again → "Already dispensed … Do not give the medicine", no Dispense button. Dispensed and Stock tabs. |
| 5 | Patient (`patient`) | Home → Your medicines → Visits → Pay. If a visit is booked for this patient, pays the ₵25 fee by mobile money (test mode settles after 3 s; live shows the votex365 approval step). Otherwise the empty state is shown as is. |
| 6 | CHV, then healer (`chv`, `healer`) | CHV picks Nana Yaw Asare in the healer directory, records the patient's consent for a healer referral, sends it. Signs out. Healer accepts, notes remedies, marks finished, refers back to the clinic. |
| 7 | GHS official (`ghs`) | Dashboard (cases this week, possible outbreak), disease map, outbreak alerts → "Confirm and alert the area" if one is waiting. |
| 8 | Health centre admin (`facility_admin`) | Facility home with the low-stock card, Stock levels, Quality review (recorded visits). |
| 9 | Platform admin (`platform_admin`) | Users, Audit log (live: the reads and writes from scenes 1–8), Settings → Revenue. |
| 10 | Patient (`patient`) | Me → Twi and text size. **Only if the build has them working**: the spec clicks Twi and looks for a text-size control; if neither changes anything, the test is skipped and `build-video.sh` leaves the scene and its card out. |
| — | — | Outro card |

Each scene signs in from a fresh browser profile, so each starts with the real first-time passphrase + PIN setup.
Scenes pass state forward in `.state/state.json` (patient name, prescription code and, in Test mode, the mock
"server" kept in browser storage).

## Rebuild

```
cd scripts/demo-video
npm install
npx playwright install chromium

# Live run (writes synthetic records to the LIVE database, see below)
TEST_PASSWORD='<the test users password>' ./build-video.sh

# Rehearsal against a local build in Test mode (no server, nothing written anywhere)
(cd ../../frontend && npm ci && npm run build && npx vite preview --port 4791) &
DEMO_URL=http://localhost:4791 DEMO_MODE=test ./build-video.sh
```

- `DEMO_URL`: defaults to `https://app-hc.agroconnect.space`.
- `TEST_PASSWORD`: read only in `tests/_helpers.ts` and typed into the masked password field. Never logged; traces and
  screenshots are off so it can't land on disk.
- `DEMO_MODE=test`: uses the app's "Use test mode (made-up people)" switch instead of real sign-in.

A failed or skipped scene is left out of the video (with its card); the rest still ship. The list reporter shows
which one failed.

## The live run writes to the live database

Every live run creates, under the seeded test accounts: one new patient (random made-up name from a fixed list),
a consent, vitals, a referral, a booked visit, an emergency (acknowledged, not resolved), a prescription
(dispensed), a healer referral and its referral back, possibly a confirmed outbreak alert and a test-mode payment.
All synthetic, but they stay. That is deliberate: scene 9's audit log then shows real activity.

## Deliberately skipped or limited

- **Patient booking a visit**: the patient's Visits screen is still a static prototype (its Book button does
  nothing), so the scene only shows it. Booking is shown from the CHV side (scene 2).
- **Patient medicines / fee**: the CHV's new patient isn't linked to the `patient` login, so the prescription from
  scene 3 doesn't appear there and there may be no visit to pay for. The video shows whatever the app shows.
- **Healer referring**: a healer can't start a referral to themselves; the CHV sends it (with consent) and the healer
  refers back. Scene 6 shows both.
- **Emergency escalation to facility admin / GHS**: needs 10–15 minutes unanswered; the doctor acknowledges at once.
- **Video call, recordings, QR scanning**: need a second device or a camera.
- **Language/text size**: scene 10 is skipped until the branch adding them lands.

## Layout

```
scripts/demo-video/
├── README.md
├── package.json            Playwright
├── playwright.config.ts    412×820 phone viewport, video on, trace/screenshot off
├── build-video.sh          runs the scenes, stitches healthconnect-demo.mp4
└── tests/
    ├── _helpers.ts         sign-in (live or Test mode), passphrase + PIN setup, tabs, state between scenes
    ├── 00-titles.spec.ts   renders the title cards to assets/titles/
    └── 01-… 10-*.spec.ts   one scene each
```

Not committed: `node_modules/`, `test-results/`, `build/`, `.state/`, `assets/titles/`, `*.mp4`.
