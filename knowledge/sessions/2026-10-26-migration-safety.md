# 2026-10-26 · Migration safety: a logbook for migrations, and a test script that can't hit RDS

**Who:** Elise, with Claude Code. **Summary of the session, not a transcript.**

## Goal

Close two gaps Eugene found when he applied 001–003 to RDS (PR #6): the test script's RDS guard only checked the hostname, and nothing recorded which migrations a database already had.

## What we found

- Through the SSM tunnel, RDS answers on `localhost`, so `run_tests.sh` (which drops databases) would have run against it.
- Only RDS has a role called `rds_superuser`, so asking the server is a reliable check, whatever the hostname.
- Re-running every `.sql` file (the old loop in `infra/README.md`) fails on `001` once a `004` exists.
- psql fills in `:'variables'` only in input it reads (a file or stdin), not in `-c` commands.
- LOINC cross-check: all 9 codes are active and correctly labelled. `14743-9` (capillary blood by glucometer) fits a CHV finger-prick reading better than `15074-8`; FHIR R4 wants `2708-6` for oxygen saturation, with our `59408-5` as an extra code at export.

## What we decided

No new ADR: this follows the existing rule "never edit an applied migration" and makes the database enforce it.

## What changed

- New `db/migrate.sh`: `schema_migrations` logbook with a checksum per file; `--dry-run`, `--baseline NNN`; refuses edited or missing applied files.
- `db/tests/run_tests.sh`: refuses servers with `rds_superuser`; builds its test database through `migrate.sh`, so CI tests it.
- `learnings/database.md`, `db/AGENTS.md`, `infra/README.md` (migration steps), `PLAN.md` (S12).

## Still open

- Eugene: run `db/migrate.sh --baseline 003` on RDS once, through the tunnel.
- Elise: a `004` migration adding LOINC `14743-9`, after the baseline.
