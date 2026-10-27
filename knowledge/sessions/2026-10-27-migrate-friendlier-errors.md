# 2026-10-27 · `migrate.sh`: refuse a database that predates the logbook

**Who:** Elise, with Claude Code. **Summary of the session, not a transcript.**

## Goal

Act on Joseph's two non-blocking suggestions from the PR #12 review.

## What we found

- On a database with our tables but no logbook entries, a plain run failed on `001` with `function "current_actor" already exists`, and a dry run wrongly listed 001–003 as "would apply".
- Two runs at once could both try the same file. A Postgres advisory lock would fix it, but it only lasts one connection and our script uses one connection per file.
- Eugene's L6-B1b (own KMS key on RDS) replaces the database, so RDS will start empty; it then needs a normal `db/migrate.sh` run (no baseline) and the L7-A5 test data again.

## What changed

- `db/migrate.sh`: refuses (apply and dry run) when the logbook is empty but `patients` exists, and says to run `--baseline`.
- `learnings/database.md`: the new refusal, and "one person runs migrations at a time".

## Next

- Elise: the `004` LOINC migration (`14743-9`, glucometer glucose).
- Eugene: tell Elise before replacing RDS for L6-B1b.
