# 2026-10-26 · Lab 7 event infrastructure (L7-A1) and the API redeploy

**Who:** Eugene, with Claude Code. **Summary of the session, not a transcript.**

## Goal

Unblock Joseph's L7-A5 (the Lab 7 report waits only on it): review his PR #11, then build and deploy L7-A1, the SNS → SQS → Lambda flow his API and functions expect.

## What we found

- PR #11 documented the exact contract (`APPOINTMENT_TOPIC_ARN`, `JWT_SECRET_ARN` as `{"secret"}`, Python 3.12 handlers zipped with `events.py`, batch size 1, DLQ); L7-A1 was built to it. Review nit: compiled `functions/__pycache__/*.pyc` files were committed.
- **An interrupted `terraform apply` half-creates things.** The first apply was stopped part-way: AWS had made 9 resources, the state didn't record them, and the state stayed locked. Recovered with `force-unlock` (after checking no apply was running) and `import` blocks; a second plan then showed no changes.
- **Unconfirmed alarm emails expire after 3 days.** Only Elise's survived; this apply re-sent the confirmation to Eugene, Joseph and Perfect.
- Local Docker (OrbStack) crashed twice during builds; the disk is ~96% full. Clearing Docker's build cache (1.9 GB) let the build finish.
- The Lab 6 lab environment in `us-east-1` is being torn down by someone: the Aurora instance was deleting, the EC2 server gone, but the **cluster** `healthconnect-db` was still "available" and must be deleted too.

## What we decided

- **D-010 accepted** (built as designed).

## What changed

- `infra/modules/events/` (new): topic, two queues + DLQs, raw-delivery subscriptions, two Lambda functions with their own roles. JWT secret container; API role gets `sns:Publish` (that topic) and `GetSecretValue` (that secret); both settings passed to the API container.
- AWS: 24 resources (9 of them imported after the interruption); JWT key set (64 random characters, never printed); API image rebuilt from `main` (`f3ff4ee`) and rolled out with an instance refresh.
- Checked: one published event fired both functions (same `appointmentId`); a bad event failed 3 times then sat in both DLQs; the refreshed API answers 10/10, rejects missing/bad tokens, and verifies a token signed with the real key. Evidence: `evidence/lab7/outputs_A1_event_infra.txt`.
- Docs: `learnings/infra.md`, `infra/README.md` (sign-in key runbook), PLAN (L7-A1 ✅, L7-A5 ready, L7-H1 evidence), README.

## Open questions / next steps

1. **Joseph (L7-A5):** RDS has the schema but no rows. He needs one active synthetic practitioner and one patient with reminder consent, then a token (`npm run token`, with the key from Secrets Manager) and one `POST /appointments`.
2. Not yet tested: the API itself publishing to SNS (that is L7-A5).
3. L7-H1: screenshot the DLQ message, then purge both DLQs.
4. Delete the Aurora cluster `healthconnect-db` in `us-east-1` once its instance is gone.
