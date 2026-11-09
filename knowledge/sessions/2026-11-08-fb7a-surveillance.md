# 2026-11-08 · FB-7a: disease surveillance, from database to screen

**Who:** Elise, with Claude Code. **Summary of the session, not a transcript.**

## Goal

Make the GHS official's dashboard, map and outbreak alerts real (final sprint, Tier 1).

## What we found

- PR #51 (migration 004) was merged; Joseph's migrations 006 to 009 (login, sync, prescription checks, payments) are in his open PRs and leave 005 free. Surveillance took 005; E-M part 2 moves to 010.
- The DHS Program API gives two values per region; the preferred one (`IsPreferred = 1`) is "five years preceding the survey".
- Ranking regions by total cases put Greater Accra first only because it has four districts in the demo data; ranking per district matches the DHS pattern (the north highest).
- The app's passphrase can't be reset by design (D-031): forgetting it means wiping that account's local data.
- One app test (doctor sees the booked visit) can fail when the laptop is busy; it passed on clean reruns.

## What changed

- `db/migrations/005_surveillance.sql`, `db/seed/surveillance_synthetic.sql`, tests in `db/tests/verify_schema.sql`.
- `backend/src/routes/surveillance.ts` (+ tests), `frontend/src/data/surveillance.ts`, `frontend/src/screens/surveillance.tsx` (+ tests), a "Start the demo again" button in test mode.
- Evidence `evidence/final/FB-7-outbreak-*.png`; learnings, PLAN, README, BUILD-CHECKLIST.

## Next

- Merge; Eugene applies 005 on RDS (after his KMS change) and runs the seed on the demo database.
- Tick the checklist once it works on the live app.
- E-M part 2 as `010`.
