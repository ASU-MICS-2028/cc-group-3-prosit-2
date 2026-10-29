# Database: FHIR-shaped schema, consent, audit (Lab 6 Part C, Lab 7 Part A)

**Owner:** Elise · **Last updated:** 2026-10-21 · **Status:** working locally (tested on Postgres 16); not yet applied to RDS

> Written for a teammate who will never open `db/`. If something here is unclear, tell Elise and she fixes the note.

## 1. In one sentence

The database stores patients, their vital signs, their consent, health workers and appointments in tables shaped like the international health-data standard FHIR, and it enforces the safety rules itself (consent, valid codes, audit) so they hold whoever connects.

## 2. What I did, step by step

1. **Wrote three migration files** in `db/migrations/` (a migration = a SQL file that builds or changes the database; they run in number order):
   - `001_initial_schema.sql`: every table, and the rules that protect them.
   - `002_loinc_reference.sql`: the 9 measurement types we accept (temperature, blood pressure, etc.).
   - `003_audit_trail.sql`: the automatic history of every change.
2. **The tables**, and the FHIR "resource" each one copies the shape of:

   | Table | Holds | FHIR resource |
   |---|---|---|
   | `patients` | name, phone, date of birth, gender, country, region, language | Patient |
   | `practitioners` | health workers and their role (CHV, nurse, doctor, specialist, GHS official, admin) | Practitioner |
   | `consents` | each permission a patient gave, for one purpose, and when it was withdrawn | Consent |
   | `loinc_codes` | the measurement types we accept, with unit and sensible range | (a mini terminology server) |
   | `observations` | each reading: which patient, which measurement, the number, who took it, when | Observation |
   | `appointments` | patient, specialist, start, end, status | Appointment |
   | `access_log` | who **looked at** which patient record (written by the API) | AuditEvent |
   | `audit_trail` | who **changed** what, from what to what (written by the database itself) | AuditEvent + Provenance |

3. **Built the protections into the database**, not the API, so `psql` and scripts can't skip them:
   - A reading needs a valid consent for clinical care, belonging to the same patient and not withdrawn. Otherwise: *"Consent … was withdrawn on 05 Dec 2026. Obtain new consent before recording."*
   - A reading must use a known measurement code and a believable number (368 °C is rejected as a typo).
   - Consents, readings and both logs can't be deleted. Mistakes are marked `entered-in-error`.
   - Every row records who created and last changed it, and when. The database fills these in, not the app.
   - A specialist can't be double-booked.
4. **Wrote a test** (`db/tests/verify_schema.sql`, run by `db/tests/run_tests.sh`) that tries every rule with one write that should work and one that should be refused: **25 refused, 14 allowed, 0 problems**.
5. **Wrote the FHIR mapping, gap analysis and data minimisation** in [`docs/fhir-mapping.md`](../docs/fhir-mapping.md) (L6-C2).
6. **One reminder per appointment (L7-H2, decision [D-027](../docs/decisions.md)).** The same `appointment.created` event
   can arrive twice: an offline phone retries, and the API publishes again on a retry. On 26 Oct Abena got two
   reminders. Now the reminder function (`functions/reminder_function.py`) first *claims* the appointment id in a small
   DynamoDB table, `healthconnect-dev-reminders-sent` (`functions/sent_log.py`), with a write that only succeeds if
   the id isn't there yet. Already there: it logs `duplicate_skipped` and sends nothing. Sending fails: it removes the
   claim and raises, so SQS retries. Entries delete themselves after 30 days.
   Why DynamoDB and not our Postgres: the functions run outside the private network, and the lab wants them
   independent of the main database. Why not SQS's own deduplication: it only remembers for 5 minutes.

## 3. Why we did it this way

| Choice | Why | Rejected |
|---|---|---|
| Ids are UUIDs made by the app ([D-011](../docs/decisions.md)) | CHVs work offline. A retried upload carries the same id, so it can't create a duplicate patient | Database-made ids: a lost reply plus a retry = two copies of Ama |
| Consent checked by the database ([D-012](../docs/decisions.md)) | Survives `psql` and scripts; health data is special personal data under Act 843 | API-only check: anyone using `psql` skips it |
| Measurement codes in a lookup table ([DATA-002](../docs/data-decisions.md)) | Unknown codes are rejected; each code's unit is defined once; adding a measurement is one `INSERT` | Free text, or a fixed CHECK list |
| Audit by the database ([D-015](../docs/decisions.md)) | The client can't fake who or when; covers every route | App sends `created_by`: a bug or `psql` could write anything |
| Identity values redacted in the audit trail | The trail must not become a second copy of names and phone numbers | Full values (privacy risk), or names only (useless for investigations) |
| FHIR R4 ([D-016](../docs/decisions.md)) | AWS HealthLake only supports R4; it's what other systems use | R5: little adoption, being skipped on the way to R6 |

Lab requirement: Lab 6 Part C (FHIR-aligned schema + mapping + minimisation), Part D (audit), Lab 7 Part A (appointments table).

## 4. How to check it works

You need a local Postgres (never point this at RDS: it drops and recreates a test database). With Docker:

```bash
docker run -d --name hc-pg -e POSTGRES_PASSWORD=test -p 5432:5432 postgres:16
PGHOST=localhost PGUSER=postgres PGPASSWORD=test db/tests/run_tests.sh
# expected last line:
# 25 deny checks, 14 allow checks, 0 problems
```

Each `SHOULD FAIL` step in the output is followed by the database's refusal message; each `SHOULD PASS` step has none.
Evidence file: `evidence/lab6/outputs_C_schema_tests.txt`.

The test script refuses to run on RDS, even through a tunnel: it asks the server whether it has the `rds_superuser`
role, which only RDS has. It used to check only the hostname, which a tunnel (`localhost`) slipped past.

### Applying migrations: `db/migrate.sh`

Never run the `.sql` files by hand. `db/migrate.sh` keeps a logbook table in the database, `schema_migrations`:
one row per file already applied (name, when, who, and a checksum of the file). Each run applies only the files not
in the logbook, in order, and stops at the first error.

```bash
db/migrate.sh --dry-run        # list what would be applied; changes nothing
db/migrate.sh                  # apply what's missing
db/migrate.sh --baseline 003   # one-off for RDS: 001-003 ran before the logbook existed, so record them without running them
```

It connects with the usual `PGHOST`, `PGUSER`, `PGPASSWORD`… variables. It **refuses** when:
- an applied file was edited or deleted (its checksum no longer matches the logbook): put the change in a new numbered file instead
- `--baseline` is used on a database that already has a logbook, or that has no `patients` table (001 never ran there)
- the database already has our tables but an empty logbook (migrations were applied before `migrate.sh` existed): it tells
  you to run `--baseline` first, instead of failing on 001 with a confusing `function "current_actor" already exists`

Tried on local Postgres 16: fresh apply, rerun (applies nothing), a new `004`, an edited `002` (refused), a failing
migration (stops, not recorded, nothing after it runs), baseline on a populated and on an empty database, dry run,
and `run_tests.sh` against a fake RDS (refused before dropping anything). `run_tests.sh` builds its test database with
`migrate.sh`, so CI tests the script on every PR.

To see a patient's full history (as an admin):

```sql
SELECT occurred_at, table_name, action, changed_fields, old_values, new_values, actor
FROM audit_trail WHERE patient_id = '<patient uuid>' ORDER BY id;
```

### Checking the one-reminder rule (L7-H2)

```bash
cd functions && python3 -m unittest -v     # 18 tests; the ReminderSentOnce ones are L7-H2
```

They use a fake DynamoDB, so they need no AWS. They cover: a repeat in the same batch and in a later one (skipped),
two different appointments (both sent), no consent (nothing claimed), a failed send (claim released, the retry sends),
DynamoDB failing (raises, so SQS retries), `SENT_TABLE` missing (refuses), and the 30-day expiry. With the claim check
switched off, the duplicate tests fail, so they really test it. Live check once Eugene has applied it: book the same
appointment twice, then look for `duplicate_skipped` in `/aws/lambda/healthconnect-dev-reminders`.

## 5. What is NOT done, or is faked

- **RDS logbook:** Eugene ran `db/migrate.sh --baseline 003` on RDS on 26 Oct, so `schema_migrations` there holds 001–003.
- **L7-H2 is not live yet.** The table and permissions are in Terraform (`infra/modules/events`) but not applied:
  Eugene applies them. Until then the deployed reminder function is the old one. No "after" evidence yet.
- **The specialist-notify function still has no duplicate check.** A repeated event notifies the specialist twice.
- **LOINC codes:** all 9 are active and correctly labelled (cross-checked against the HL7 terminology server). Blood glucose
  has a more exact code for a finger-prick glucometer reading (`14743-9`); adding it is a future `004` migration.
- **No database roles yet.** Everything runs as one user. The plan is: the app's role can't `ALTER`, can't write `loinc_codes`, can't read `audit_trail`. That's the RBAC table (L6-H3).
- **No real FHIR server or API.** The tables are FHIR-*shaped*; nothing serves FHIR JSON yet (gap #3 in the gap analysis).
- **Act 843 section numbers** in the minimisation section need Joseph's clause check (L5-C2).
- All test data is invented (Ama, Kofi, `+233000000001`, which isn't a real number).

## 6. What will bite us

- **Every write must say who is acting.** The API must run each request in one transaction that starts with `SELECT set_config('app.user_id', '<practitioner uuid>', true)`. Using `pool.query()` alone sends statements on random connections, and the database will refuse the write with *"No acting user set"*. The user id must come from the verified login, never a request header.
- **Lab 7's starter code won't work unchanged:** the column is `starts_at` (not `time`) and ids are UUIDs (not `1`, `2`).
- **A double-booking or withdrawn consent comes back as a database error.** The API should turn it into a clear 409 / 403, not a 500.
- **`btree_gist`** must be allowed on RDS (it is by default for RDS PostgreSQL).
- **`audit_trail` grows forever.** It needs a retention and archiving rule (legal review).
- **A database superuser can disable triggers.** Nobody should use one day to day.
- **One rare gap in `migrate.sh`:** each migration file commits by itself, and the logbook row is written a moment later.
  If the connection drops in between, the change is in but not recorded, and the next run fails with "already exists".
  Fix: check the change is really there, then add its row to `schema_migrations` by hand.
- **A reminder can be skipped in one rare case (L7-H2).** If the function dies after claiming an appointment but
  before sending (e.g. it times out), SQS's retry sees the claim and skips it. We chose at most one reminder over
  sometimes two. To fix it later: store a "sending" status with a time, and let a retry take over an old one.
- **Deploying the new reminder function without the table breaks reminders.** Without `SENT_TABLE` it refuses every
  message (so they end in the dead-letter queue) rather than risk duplicates. Terraform creates both together.
- **One person runs migrations at a time.** Two runs at the same moment could both try the same file; the second fails
  on "already exists" (nothing breaks, but it's confusing). Say in the team chat before running `migrate.sh` on RDS.
  The proper fix is a Postgres *advisory lock* (a named lock only one connection can hold), but our script runs each file
  on its own connection, so it would need restructuring first. Not worth it for a four-person team.

## 7. Terms used

| Term | Plain meaning |
|---|---|
| FHIR | The international standard for the shape of health data and how systems exchange it. "Resources" are its building blocks (Patient, Observation…) |
| LOINC code | A standard id for *what* was measured (`8310-5` = body temperature). The reading itself is a separate number |
| UCUM | The standard way to write units (`Cel` = °C, `mm[Hg]` = mmHg) |
| UUID | A random 128-bit id that any device can create without asking a server, with no realistic chance of two clashing |
| Foreign key | A column whose value must match a row in another table, enforced by the database |
| Trigger | Code inside the database that runs automatically before or after a write, and can refuse it |
| Migration | A numbered SQL file that builds or changes the database |
| `psql` | A program for typing SQL straight into the database, bypassing the API |
| Idempotent | Safe to repeat: doing it twice has the same effect as once |
| Checksum (sha256) | A short code computed from a file's exact contents; change one character and the code changes |
| Baseline | Telling the logbook "these migrations already ran here" without running them again |
| DynamoDB | AWS's serverless key–value database: you store items by a key and pay per request, with no server to run |
| Conditional write | A write that only happens if a condition holds ("only if this id isn't there yet"); the database checks and writes in one step, so two at once can't both succeed |
| TTL (time to live) | A date on an item after which DynamoDB deletes it by itself |
| Act 843 | Ghana's Data Protection Act, 2012: the law our data handling must follow |

## 8. Lines ready for the report

- Our schema is shaped like FHIR R4: patients, observations, consents, practitioners, appointments and audit events each map to a FHIR resource, and readings carry LOINC codes with UCUM units.
- The database itself enforces consent, valid codes, correct-don't-delete and a full audit trail, so the rules hold for the API, `psql` and scripts alike; 25 forbidden writes were refused in testing.
- What still blocks real interoperability: no business identifier to match the same person across systems, validation against our own code list rather than the full LOINC catalogue, and no FHIR API yet.
