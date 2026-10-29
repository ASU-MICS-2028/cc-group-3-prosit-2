# 2026-10-29 · L7-H2: one reminder per appointment

**Who:** Elise, with Claude Code. **Summary of the session, not a transcript.**

## Goal

Stop duplicate reminders. On 26 Oct, Abena's booking was retried and published twice, so she got two reminders.

## What we found

- Duplicates are expected, not a bug: the API re-publishes on a retry (to recover a lost event) and SQS redelivers after a timeout. The consumer has to skip them.
- The Lambda functions run outside the VPC, so they can't reach RDS without network changes.
- SNS/SQS FIFO deduplication only remembers for 5 minutes; a phone can retry hours later.

## What we decided

D-027 (Proposed): the reminder function claims each appointment id in a DynamoDB table with a conditional write before sending; it skips ids already claimed and releases the claim if sending fails. Rejected: a Postgres table, and FIFO deduplication.

## What changed

- `functions/sent_log.py` (new), `functions/reminder_function.py`, `functions/test_functions.py` (8 new tests, 18 in all; the new ones fail with the check disabled).
- `infra/modules/events/main.tf`: table `healthconnect-dev-reminders-sent` (pay per request, 30-day TTL), write access for the reminder role only, `SENT_TABLE` setting. `terraform fmt` and `validate` pass; **not applied**.
- `docs/decisions.md` (D-027), `learnings/database.md`, PLAN, README; `__pycache__/` added to `.gitignore` and the committed cache files removed.

## Next

- Eugene: review and apply the Terraform; add the table to the cost tracker.
- Elise: book the same appointment twice on the live API and capture `duplicate_skipped` in the reminder logs (the "after" evidence).
- Optional: the same check for specialist-notify.
