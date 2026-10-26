# db/: schema and migrations

**Owner:** Elise (backup reviewer: Joseph). Plain-language note: [`../learnings/database.md`](../learnings/database.md).
Data-layer ADRs: [`../docs/data-decisions.md`](../docs/data-decisions.md) (DATA-0xx); team-wide ones in [`../docs/decisions.md`](../docs/decisions.md) (D-011 to D-018).
Follow the root [`../AGENTS.md`](../AGENTS.md) first; this adds what's specific to the database.

## Commands

```bash
# LOCAL Postgres only: the test script drops and recreates a database.
docker run -d --name hc-pg -e POSTGRES_PASSWORD=test -p 5432:5432 postgres:16
PGHOST=localhost PGUSER=postgres PGPASSWORD=test db/tests/run_tests.sh     # run from the repo root
# expected last line: "<n> deny checks, <m> allow checks, 0 problems"

db/migrate.sh --dry-run    # what would be applied (changes nothing)
db/migrate.sh              # apply the migrations this database hasn't had yet
```

`run_tests.sh` refuses RDS by hostname and by asking the server (only RDS has the `rds_superuser` role), so a tunnel on
`localhost` is refused too. `migrate.sh` records each applied file in the `schema_migrations` table and refuses to run if an
applied file was edited.

## Rules

- **Never edit a migration that has been applied** (001–003 are applied on RDS). Change the schema with a new numbered file: `004_<what>.sql`.
- **Every rule gets a test in `tests/verify_schema.sql`**, both ways: a `SHOULD FAIL` step proving the guard refuses bad data, and a `SHOULD PASS` step proving good data still goes in. A guard with no failing test isn't proven.
- **Diverging paths to test for any new table or rule:** missing required value · wrong patient's consent · withdrawn consent · duplicate id (retry) · overlapping time (double-booking) · `DELETE`/`TRUNCATE` attempt · write with no acting user · write by a user from another facility, once RBAC exists.
- **Write in the patterns already there:** UUID primary keys (D-011), consent checked by the database (D-012), correct-don't-delete (D-013), consent per purpose (D-014), audit by trigger with `app.user_id` (D-015).
- Regenerate the evidence file only on purpose: `run_tests.sh` overwrites `evidence/lab6/outputs_C_schema_tests.txt` by default. When you're just checking, give it another output file as its only argument: `db/tests/run_tests.sh /tmp/schema_check.txt` (this is what CI does).

## Applying migrations to AWS

With `db/migrate.sh` through an SSM tunnel: steps in [`../infra/README.md`](../infra/README.md#running-database-migrations).
Ask the infra owner first. RDS needs `db/migrate.sh --baseline 003` once (001-003 were applied before the logbook existed).
