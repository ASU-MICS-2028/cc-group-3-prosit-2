# 2026-10-30: FB-4 part 1, the video call in the app

**Goal:** put the Lab 7 call (which worked, with a rough page) into the real app, in the design system, and handle weak networks.

**What we found**
- The Lab 7 signaling server is hosted and healthy, so the app reuses it unchanged.
- A real call between two browsers works through the new screens. The bottom navigation covered the call buttons, so a live call is now full-screen.
- Payments already exist from Prosit 1 (votex365), so we don't mock them.

**What we decided**
- No payments mock: Joseph integrates the existing votex365 code as `payments-service` (SVC-4); noted in PLAN and README.
- Weak-network rules (suggest audio after 4 s of weak readings, switch after 10 s) are settings from the Lab 7 throttling tests, not facts.
- No new ADR: it follows D-023 (hosted call page) and D-029.

**What changed:** `frontend/src/call/` (engine, quality, network, stats, signaling), `components/live.tsx`, `screens/call.tsx`, 53 new tests (229 total). Branch `feat/fb4-appointments-calls`, started from the FB-3 branch.

**Open:** booking appointments, recording with consent, the QA list, the fee (Joseph), a TURN relay for calls across mobile networks, restarting the connection after a drop.

**31 Oct, part 2: appointments and downloading.** Booking (rules from the database, UTC with local display, reminder status, double-booking refused for good and explained), and a download direction for sync so the doctor's phone gets what was booked with them (D-032, Proposed). Three sync bugs found by tests and fixed. 266 tests. Joseph needs a role-filtered download endpoint and the 409 on double booking in the real API. Still open: recording with consent, the QA list, the fee (Joseph).

**31 Oct, fixes after the phone check.** Perfect found: a patient appearing twice, a cramped cancel dialog, letters accepted in number fields, and a missed offline notice. Fixed: validation rules in one file used by forms and repository (the phone box had been silently dropping letters), a duplicate-name warning with record tags, the confirm dialog as a bottom sheet, a prominent offline notice. 342 tests.
