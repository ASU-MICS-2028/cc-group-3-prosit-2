# 2026-10-25 · API: transactions, sign-in, appointments, audited reads, Lambda handlers

**Who:** Joseph, with Claude Code. **Summary, not a transcript.**

## Goal

Joseph's open tasks: L6-D1 (audit logging in the API), L7-A4 (`POST /appointments`), L7-A2 (the two Lambda handlers).

## What we found

- Every write needs `app.user_id` set in the same transaction; with no user the database raises `42501`, with an unknown user `23503`.
- The API had no way to know who was calling, so the user can't come from anywhere but a verified token (D-026).
- CI would have silently *skipped* the database tests (no Postgres in the backend job). Fixed: Postgres service added, and CI now fails if those tests would be skipped.
- The API (TypeScript) and the functions (Python) could drift on event field names without any test noticing: now both test against one shared sample event.
- PR #10 (Lab 6 docs) was folded into this branch to avoid stacking PRs; ADR numbers renumbered so D-026 doesn't collide with #10's D-024/D-025.

## What we decided

D-026: signed tokens (HS256 JWT) checked against active practitioners on every request; fail closed without a key.

## What changed

`backend/src/db.ts` (`withTransaction`), `auth.ts`, `events.ts`, `audit.ts`, `routes/appointments.ts`, `routes/patients.ts`; `functions/` (two handlers, shared event code, contract fixture, tests); CI jobs; 34 API tests + 10 function tests, key ones mutation-checked; `learnings/patient-record-service.md` rewritten.

## Open questions / next steps

1. Eugene: L7-A1, plus `JWT_SECRET_ARN`, `APPOINTMENT_TOPIC_ARN` and the IAM permissions (learnings note §6), then deploy the new image.
2. Joseph: L7-A5 end-to-end run once L7-A1 exists.
3. Outbox for events lost while SNS is down (Lab 7 resilience question).
