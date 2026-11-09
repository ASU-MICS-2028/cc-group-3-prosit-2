# 2026-11-07: SVC-4 payments

Joseph, with Claude Code. Task SVC-4 (D-039).

- Ported the votex365 client from Prosit 1: hosted checkout and a signed webhook. Added `POST /payments`, status, receipts, migration `009` and the patient's Pay screen.
- No votex365 key was available, so payments are simulated and labelled. The real client is only tested against a stand-in. The steps to turn it on are in `learnings/patient-record-service.md`.
- A browser run caught a render loop in the form: it told its parent about the result on every render. Fixed, with a test.
- One older test (`visitsScreens.test.tsx`) fails now and then, on `main` too. Passed to Perfect.
