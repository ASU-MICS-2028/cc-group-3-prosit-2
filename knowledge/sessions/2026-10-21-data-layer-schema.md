# 2026-10-20 to 2026-10-21 · Data layer: FHIR schema, consent, audit

**Who:** Elise, with Claude. **Summary of the sessions, not a transcript.**

## Goal

Design and build the FHIR-aligned schema (L6-C1), the appointments table (L7-A3), and the FHIR mapping, gap analysis and data minimisation (L6-C2), understanding every decision well enough to defend it in Lab 8.

## What we found

- A LOINC code identifies the *kind* of measurement, not the value. Everyone's temperature uses `8310-5`; the reading is a separate number. That's why the unit belongs with the code.
- A plain foreign key to a consent row can't see a withdrawal: a January reading pointing at consent withdrawn in December would be accepted. It also can't check that the consent belongs to the same patient. A composite foreign key plus a trigger closes both holes.
- The Lab 6 starter's audit code logs before checking the patient exists, so a foreign key on `access_log.patient_id` would make 404s unloggable.
- AWS HealthLake supports FHIR R4 only; R6 is expected around late 2026, with production use around late 2027.
- Region was being justified by public health reporting, which wasn't a stated purpose.
- PR #2 (API scaffold) uses `pool.query()`, which can't hold the per-transaction user setting the audit design needs. Raised in the review.

## What we decided

Team-wide: D-011 to D-018 in [`../../docs/decisions.md`](../../docs/decisions.md) (UUIDs, consent enforcement, correct-don't-delete, per-purpose consent, database audit, FHIR R4, appointment end + double-booking guard, fourth stated purpose).
Data-layer only: DATA-001 to DATA-005 in [`../../docs/data-decisions.md`](../../docs/data-decisions.md).

## What changed

- `db/migrations/001_initial_schema.sql`, `002_loinc_reference.sql`, `003_audit_trail.sql`
- `db/tests/verify_schema.sql`, `db/tests/run_tests.sh` → `evidence/lab6/outputs_C_schema_tests.txt` (25 deny, 14 allow, 0 problems)
- `docs/fhir-mapping.md`: mapping, gap analysis, data minimisation
- `learnings/database.md`

## Open questions / next steps

- Team to confirm D-018 (fourth purpose) in review.
- Verify LOINC codes on loinc.org; Joseph to confirm Act 843 section numbers (L5-C2).
- Joseph: `withTransaction(actorId, fn)` in the API before L6-D1; update Lab 7's `INSERT` for `starts_at` and UUIDs (L7-A4).
- Next for Elise: S8 shared vocabulary, L5-C1 sharding design, L6-H3 RBAC table (database roles).
