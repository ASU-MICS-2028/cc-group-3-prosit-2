# Decisions

Every decision that shapes HealthConnect, newest at the bottom. One entry each: what we decided,
why, and what we gave up. If you change a decision, add a new entry that replaces the old one;
don't edit history.

Status: **Accepted** (we're doing it), **Proposed** (needs the team or the facilitator), **Replaced** (see the entry that replaces it).

---

## D-001: Lab 5 is done on HealthConnect, not AgroConnect

- **Date:** 2026-10-18 · **Status:** Accepted (facilitator confirmation pending)
- **Decision:** Build HealthConnect's VPC, load balancer and private database for Lab 5. Only the decommissioning checklist (Part D) and the retrospective stay about AgroConnect.
- **Why:** Lab 5 is written as the AgroConnect wrap-up, but Lab 6 says to carry "your Week 5 VPC design" into HealthConnect. Building it once, on HealthConnect, serves both labs.
- **Gave up:** fresh AgroConnect evidence for Lab 5. If the facilitator wants it, it's cheap to capture before AgroConnect is decommissioned.

## D-002: HealthConnect is a separate repository that reuses Prosit 1 patterns

- **Date:** 2026-10-18 · **Status:** Accepted
- **Decision:** New repo (`cc-group-3-prosit-2`). Copy Terraform modules and the PWA/API patterns from `cc-group-3-prosit-1`; don't import its code wholesale.
- **Why:** Lab 6 requires it: the health data domain and its risk are different enough to need their own codebase.
- **Gave up:** a shared codebase; fixes made in one repo must be copied to the other by hand.

## D-003: Same AWS region and a non-overlapping network

- **Date:** 2026-10-18 · **Status:** Proposed (Eugene to confirm)
- **Decision:** AWS `af-south-1` (Cape Town), VPC `10.30.0.0/16`.
- **Why:** `af-south-1` had the lowest measured latency from Ghana in Prosit 1 (74 ms median). AgroConnect uses `10.20.0.0/16`; not overlapping keeps peering possible later.
- **Gave up:** there is no AWS region in Ghana, so health data leaves the country. The data residency doc (Lab 5 Part C) must deal with this openly.

## D-004: Synthetic data only

- **Date:** 2026-10-18 · **Status:** Accepted
- **Decision:** No real patient data anywhere, in any environment.
- **Why:** We have no ethics approval, and health data is sensitive under Ghana's Data Protection Act, 2012 (Act 843). This is also our consent/ethics point for the Lab 6 report.
- **Gave up:** testing with real CHVs and patients. The brief asks for it; we say openly that we didn't.

## D-005: Act 843 is the governing law; HIPAA is only a reference checklist

- **Date:** 2026-10-18 · **Status:** Accepted
- **Decision:** We design for Ghana's Act 843 and cite it. Where the brief says "HIPAA-compliant", we treat HIPAA (a US law) as a checklist of good controls, and say so.
- **Why:** HIPAA doesn't apply in Ghana; claiming "HIPAA compliance" would be inaccurate.

## D-006: Keep Prosit 1 leads, with light rotation

- **Date:** 2026-10-18 · **Status:** Accepted
- **Decision:** Joseph (PM/API), Eugene (Cloud/DevOps), Elise (Data), Perfect (Frontend). Each person also takes one task outside their lane. Details are in [`PLAN.md`](../PLAN.md) (Roles).
- **Why:** Each lead already knows the code and infrastructure in their lane; the rotation means everyone can explain the whole system.

## D-007: Every area is explained in plain words in `learnings/`

- **Date:** 2026-10-18 · **Status:** Accepted
- **Decision:** Nobody re-does someone else's part to understand it. Each owner writes a plain-language note in `learnings/`, and a PR isn't done without it.
- **Why:** We split the work strictly, so the notes are the only way the rest of us will know what happened.

## D-008: Build the foundation; design the rest

- **Date:** 2026-10-18 · **Status:** Accepted
- **Decision:** Build the offline CHV app, the FHIR-shaped patient API, audit logging and the security controls properly, and one telemedicine slice in Lab 7. Design and document the rest (biometrics, voice, surveillance, ML, insurance). Scope table: [`PLAN.md`](../PLAN.md).
- **Why:** The brief is far bigger than four weeks. Depth on the parts the labs grade beats a thin attempt at everything.
- **Gave up:** most of brief weeks 3 and 4 as working features.

## D-009: The repo is the single source of truth

- **Date:** 2026-10-20 · **Status:** Accepted
- **Decision:** The plan, roles, tasks and their status live in [`PLAN.md`](../PLAN.md), and the README's "Pending now" table reflects it. The "Prosit 2 – HealthConnect Team Plan" Google Doc was only for agreeing the plan; it is retired and no longer updated.
- **Why:** One place to look; it changes in the same PR as the work it tracks.
- **Gave up:** editing the plan in a Google Doc. Changes now go through PRs.

---

> **D-011 to D-018** come from Elise's data-layer work (L6-C1, L6-C2). Each one changes how a teammate's part must behave, so they live here.
> Decisions that only concern the database are in [`data-decisions.md`](./data-decisions.md) (`DATA-001`…).
> Full reasoning and the expected Lab 8 questions are in [`learnings/database.md`](../learnings/database.md).

## D-011: Record ids are UUIDs created by the app, not the database

- **Date:** 2026-10-20 · **Status:** Accepted
- **Affects:** Perfect (the PWA creates the id when a CHV registers a patient or records a reading), Joseph (the API accepts the client's id)
- **Decision:** Every patient, consent, observation and appointment has a UUID primary key generated on the device. Uploads use `INSERT … ON CONFLICT (id)`: if the id already exists with identical data, it was a retry and the API returns 200; if the data differs, 409.
- **Why:** CHVs work offline. If the upload succeeds but the reply is lost, the app retries; with a database-made id that retry creates a duplicate patient. A device-made id also lets offline readings and appointments point at a patient before anything has synced.
- **Gave up:** short, readable ids. UUIDs stop duplicate *records*, not duplicate *people*: two CHVs registering the same person still create two patients (see the gap analysis in [`fhir-mapping.md`](./fhir-mapping.md)).

## D-012: The database enforces consent before any clinical reading is stored

- **Date:** 2026-10-20 · **Status:** Accepted
- **Affects:** Joseph (handle the "consent withdrawn" error), Perfect (show the prompt to seek fresh consent)
- **Decision:** Every observation names the consent it relies on. A composite foreign key proves that consent exists **and belongs to the same patient**; a trigger proves it was given before the reading and has not been withdrawn. Withdrawal sets `withdrawn_at`; consent rows are never deleted. Readings taken before a withdrawal are kept, but excluded from advisories and analytics.
- **Why:** Health data is special personal data under Act 843. A check only in the API is skipped by anyone using `psql` or a script; the database applies to every route.
- **Gave up:** simplicity. A trigger is harder to read than an `if` in the API. Exact retention rules for withdrawn patients: needs legal review.

## D-013: Clinical records are corrected, never deleted

- **Date:** 2026-10-20 · **Status:** Accepted
- **Affects:** Joseph (no DELETE endpoints for observations, consents or logs)
- **Decision:** The database refuses `DELETE` and `TRUNCATE` on observations, consents, `access_log` and `audit_trail`. A wrong reading is marked `status = 'entered-in-error'`, FHIR's own mechanism.
- **Why:** A deleted reading leaves no trace it existed, which breaks the medical record and the audit trail.
- **Gave up:** a simple "delete" for mistakes. Act 843 deletion requests will need a separate, deliberate process (needs legal review).

## D-014: Consent is recorded per purpose

- **Date:** 2026-10-20 · **Status:** Accepted
- **Affects:** Perfect (the PWA consent screen asks for each purpose separately), Joseph (reminder and advisory code checks its own purpose)
- **Decision:** Each consent row has one `purpose`: `clinical_care`, `appointment_reminders` or `health_advisory`. Recording vitals requires `clinical_care`.
- **Why:** Act 843's purpose principle: agreeing to SMS reminders does not authorise recording someone's vitals.
- **Gave up:** a single "I consent" tick box.

## D-015: Audit is done by the database: who/when on every row, plus a full change history

- **Date:** 2026-10-20 · **Status:** Accepted
- **Affects:** Joseph (L6-D1: every request must run in one transaction that first sets the user, see below)
- **Decision:**
  - Every table has `created_at`, `created_by`, `updated_at`, `updated_by`, stamped by a trigger, never taken from the client. A write with no acting user is refused.
  - `audit_trail` records every insert, update and delete automatically: table, row, patient, changed fields, old and new values, acting user, database login. Values of identity fields (`full_name`, `phone`, `date_of_birth`) are stored as `[redacted]`; clinical values are kept. Nobody can edit, delete or truncate it.
  - `access_log` (written by the API) records reads; `audit_trail` records changes.
  - **How the API tells the database who is acting:** inside each transaction, `SELECT set_config('app.user_id', '<practitioner uuid>', true)`, taking the id from the verified login, never from a header. This needs one connection per transaction (`pool.connect()`), not `pool.query()`.
- **Why:** The data is sensitive, so every change must be traceable. Values stamped by the database can't be faked by a client, and cover `psql` and scripts too. Storing every identity value in the trail would make it a second copy of patients' details.
- **Gave up:** speed and storage (every write adds a trail row; a retention period is needed). A database superuser can still disable triggers; shipping logs to a write-once store is a later step.

## D-016: FHIR mapping targets FHIR R4 (4.0.1)

- **Date:** 2026-10-21 · **Status:** Accepted
- **Affects:** Joseph (any FHIR-shaped API output), Eugene (L6-H1 sandbox comparison)
- **Decision:** `docs/fhir-mapping.md` maps our tables to FHIR R4 resources.
- **Why:** AWS HealthLake, the managed FHIR store on our platform, supports R4 only. R4 is the most widely deployed version; R5 saw limited adoption and R6 is not yet in production use. Patient and Observation are already stable ("normative") in R4.
- **Gave up:** R5's better Consent model. Our tables aren't tied to R4: moving later changes the translation layer, not the schema.

## D-017: Appointments have an end time, and Postgres blocks double-booking

- **Date:** 2026-10-21 · **Status:** Accepted
- **Affects:** Joseph (L7-A4 `POST /appointments`: column is `starts_at`, ids are UUIDs; a clash returns a constraint error to turn into 409)
- **Decision:** `appointments.ends_at` defaults to `starts_at` + 30 minutes. An exclusion constraint stops a specialist having two overlapping `booked` appointments; cancelling frees the slot. Needs the `btree_gist` extension (available on RDS).
- **Why:** FHIR Appointment has an end, and without one a clash can't even be detected. Enforced in the database, so two CHVs booking the same slot at the same moment can't both succeed.
- **Gave up:** Lab 7's starter column name `time` and integer ids: its `INSERT` needs a one-line change.

## D-018: A fourth stated purpose: public health reporting, aggregated and anonymised only

- **Date:** 2026-10-21 · **Status:** Proposed (team to confirm in the L6-C1 review)
- **Affects:** everyone: the Lab 6 report, the data residency design (L5-C1/C2), the Lab 8 defence
- **Decision:** HealthConnect's stated purposes become: triage support, appointment scheduling, health advisory, and **public health reporting limited to aggregated, anonymised counts** (e.g. "42 fever cases in Volta this month"), never individual records.
- **Why:** The data minimisation pass found that the real reasons for collecting `region` (planning resources, seeing where illnesses are more common) are reporting, which wasn't a stated purpose. Under Act 843 an unstated purpose can't justify collection. Stating it, and limiting it to aggregates, also matches the residency rule that only anonymised aggregates cross borders.
- **Gave up:** using identifiable records for reporting.
