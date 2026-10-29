# 2026-10-29 · Lab 7 report: the open resilience question

**Who:** Elise, with Claude Code. **Summary of the session, not a transcript.**

## Goal

Write Elise's paragraph for the Lab 7 report (L7-R): one resilience question we still need to answer.

## What we found

- `POST /appointments` publishes `appointment.created` after the booking commits. If SNS fails, the API still answers 201 with `"event": "not_published"`, but nothing retries, and a crash between commit and publish leaves no signal at all.
- The textbook fix, an outbox table, delivers at least once, which turns lost reminders into duplicate ones: the same problem as Abena's two reminders on 26 Oct (L7-H2).

## What changed

- `learnings/database.md` §8: the paragraph (about 85 words), where it happens in the code, and two new terms (outbox table, at-least-once delivery).
- README: Elise's L7-R paragraph row removed (done).

## Next

- Joseph assembles L7-R. Optional: L7-H2, make the reminder function skip duplicates.
