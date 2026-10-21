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

To see a patient's full history (as an admin):

```sql
SELECT occurred_at, table_name, action, changed_fields, old_values, new_values, actor
FROM audit_trail WHERE patient_id = '<patient uuid>' ORDER BY id;
```

## 5. What is NOT done, or is faked

- **Not on RDS yet.** Waits for Eugene's database (L5-B1).
- **LOINC codes not yet checked on loinc.org.** Do this before applying 002 to RDS.
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
| Act 843 | Ghana's Data Protection Act, 2012: the law our data handling must follow |

## 8. Lines ready for the report

- Our schema is shaped like FHIR R4: patients, observations, consents, practitioners, appointments and audit events each map to a FHIR resource, and readings carry LOINC codes with UCUM units.
- The database itself enforces consent, valid codes, correct-don't-delete and a full audit trail, so the rules hold for the API, `psql` and scripts alike; 25 forbidden writes were refused in testing.
- What still blocks real interoperability: no business identifier to match the same person across systems, validation against our own code list rather than the full LOINC catalogue, and no FHIR API yet.
