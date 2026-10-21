# Data-layer decisions

Decisions that only concern the database (`db/`). Anything that changes how a teammate's part must behave
goes in the team file, [`decisions.md`](./decisions.md), instead: the data layer's team-wide ones are D-011 to D-018.

Same rules as the team file: one entry each, newest at the bottom. To change a decision, add a new entry that
replaces the old one (mark the old one **Replaced by DATA-0XX**); never rewrite history.
Plain-language explanation of all of it: [`learnings/database.md`](../learnings/database.md).

**Owner:** Elise · **Created:** 2026-10-20 · **Last updated:** 2026-10-21

---

## DATA-001: Build to the team plan, not the lab's starter schema

- **Date:** 2026-10-19 · **Status:** Accepted
- **Decision:** Lab 6's starter uses integer ids, free-text measurement names and an unenforced consent column. We built UUIDs (D-011), LOINC codes (DATA-002) and enforced consent (D-012) from the start.
- **Why:** Building the starter and upgrading later would rewrite every table. The lab asks us to *name* these gaps; closing them moves our gap analysis on to the harder problems.
- **Gave up:** a schema that matches the handout line for line.

## DATA-002: LOINC codes live in a lookup table with their unit and plausible range

- **Date:** 2026-10-20 · **Status:** Accepted
- **Decision:** `loinc_codes` holds each permitted code with its label, UCUM unit, category and a plausible range. `observations.loinc_code` is a foreign key to it, and a trigger rejects values outside the range.
- **Why:** A LOINC code says *what* was measured (body temperature = `8310-5`); the reading is a separate number. The foreign key rejects unknown codes from every route. The unit is defined once per code, so it can't drift between rows. A new measurement is one `INSERT`, not a schema change. The plausible range catches typing errors (368 °C for 36.8), not illness.
- **Rejected:** a free-text column (anything can be typed) and a CHECK list (units drift; every new code is an `ALTER TABLE`).
- **Gave up:** only knowing the codes on *our* list, not the full LOINC catalogue. Only an admin role should write to this table. **Codes must be verified on loinc.org before migration 002 is applied to RDS.**

## DATA-003: A `practitioners` table replaces free-text `recorded_by`

- **Date:** 2026-10-20 · **Status:** Accepted
- **Decision:** Health workers live in `practitioners` with a role: `chv`, `nurse`, `doctor`, `specialist`, `ghs_official`, `admin` (plus `system`, which owns rows written by migrations). Observations, consents and appointments point at it. Staff are deactivated, never deleted.
- **Why:** Free text ("Nurse Abena", "A. Mensah") can't be traced to one accountable person, and Lab 7's appointments need a real specialist to point at.
- **Gave up:** one person holding several roles (FHIR allows it via PractitionerRole).

## DATA-004: `access_log` has no foreign key to `patients`

- **Date:** 2026-10-20 · **Status:** Accepted
- **Decision:** `access_log.patient_id` is a plain UUID. `accessed_by` may be NULL for unauthenticated callers, and every row has an `outcome` (`success`, `denied`, `not_found`, `error`).
- **Why:** The API logs a request before it knows whether the patient exists. With a foreign key, a request for a non-existent id (a 404, or someone probing for records) couldn't be logged, so the most suspicious events would leave no trace. Matches L6-D1's "404 still logged".
- **Gave up:** a guarantee that every logged id matches a real patient. That's by design.

## DATA-005: Observation category is held per LOINC code

- **Date:** 2026-10-21 · **Status:** Accepted
- **Decision:** `loinc_codes.category` is `vital-signs` or `laboratory`, and becomes FHIR `Observation.category`.
- **Why:** FHIR's vital-signs profile requires a category. Holding it on the code means nobody types it for each reading.
- **Gave up:** nothing significant.
