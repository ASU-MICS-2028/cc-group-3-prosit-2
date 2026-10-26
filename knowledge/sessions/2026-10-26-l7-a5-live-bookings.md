# 2026-10-26 · L7-A5: live bookings against the real API

**Who:** Joseph, with Claude Code. **Summary of the session, not a transcript.**

## Goal

Book real (synthetic) appointments through `https://api-hc.agroconnect.space/appointments` with the test data Eugene
added, and try the paths that can go wrong.

## What we found

- All 7 paths answered as expected on the live system: two bookings 201 with `"event":"published"`, the same booking
  sent again 200, a second booking for the same specialist and slot 409 `double_booked`, an unknown patient 404, a bad
  date 400 naming `starts_at`, no token 401 (and earlier, a forged token 401).
- **A retried booking publishes the event again.** That's deliberate (it's how an event lost while SNS was down gets
  recovered), but it means Abena gets two reminders. This is the live "before" for Elise's L7-H2.
- macOS ships bash 3.2, where an empty array under `set -u` counts as unset; `${arr[@]+"${arr[@]}"}` works on both.

## What changed

- `evidence/lab7/a5_run.sh` (reads the token from the gitignored `.env`) and its output
  `evidence/lab7/outputs_A_create_appointment.txt` (checked: no token in it).
- README: Lab 6 section removed (submitted); Lab 7 split into one row per person. PLAN: L6-R done, L7-A5 in progress.

## Open questions / next steps

1. Eugene screenshots both log groups for `4f530cae…` (Abena, expect 2× reminder_logged) and `390e40f9…` (Yaw, expect skipped).
2. Paragraphs from Eugene, Perfect and Elise, then Joseph assembles L7-R.
