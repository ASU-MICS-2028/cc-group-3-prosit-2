# Architecture Decision Records (team-wide)

Every decision that shapes HealthConnect, one ADR each, newest at the bottom: what we decided, why, and what we gave
up. Format, template and rules: [`README.md`](./README.md). Never edit an accepted decision; add a new ADR that
replaces it.

Status: **Accepted** (we're doing it), **Proposed** (needs the team or the facilitator), **Replaced** (see the ADR that replaces it).

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

- **Date:** 2026-10-18 · **Status:** Accepted (Eugene, 2026-10-22: built this way in S4)
- **Decision:** AWS `af-south-1` (Cape Town), VPC `10.30.0.0/16`.
- **Why:** `af-south-1` had the lowest measured latency from Ghana in Prosit 1 (74 ms median). AgroConnect uses `10.20.0.0/16`; not overlapping keeps peering possible later.
- **Gave up:** there is no AWS region in Ghana, so health data leaves the country. The data residency doc (Lab 5 Part C) must deal with this openly.

## D-004: Synthetic data only

- **Date:** 2026-10-18 · **Status:** Accepted
- **Decision:** No real patient data anywhere, in any environment.
- **Why:** We have no ethics approval, and health data is sensitive under Ghana's Data Protection Act, 2012 (Act 843). This is also our consent/ethics point for the Lab 6 report.
- **Gave up:** testing with real CHVs and patients. The brief asks for it; we say openly that we didn't.

## D-005: Act 843 is the governing law; HIPAA is only a reference checklist

- **Date:** 2026-10-18 · **Status:** Replaced by D-028
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

- **Date:** 2026-10-18 · **Status:** Replaced by D-029
- **Decision:** Build the offline CHV app, the FHIR-shaped patient API, audit logging and the security controls properly, and one telemedicine slice in Lab 7. Design and document the rest (biometrics, voice, surveillance, ML, insurance). Scope table: [`PLAN.md`](../PLAN.md).
- **Why:** The brief is far bigger than four weeks. Depth on the parts the labs grade beats a thin attempt at everything.
- **Gave up:** most of brief weeks 3 and 4 as working features.

## D-009: The repo is the single source of truth

- **Date:** 2026-10-20 · **Status:** Accepted
- **Decision:** The plan, roles, tasks and their status live in [`PLAN.md`](../PLAN.md), and the README's "Pending now" table reflects it. The "Prosit 2 – HealthConnect Team Plan" Google Doc was only for agreeing the plan; it is retired and no longer updated.
- **Why:** One place to look; it changes in the same PR as the work it tracks.
- **Gave up:** editing the plan in a Google Doc. Changes now go through PRs.

## D-010: Appointment events fan out through SNS to one SQS queue per consumer

- **Date:** 2026-10-20 · **Status:** Accepted (Eugene, 2026-10-26: built this way in L7-A1, `infra/modules/events`)
- **Decision:** `POST /appointments` publishes `appointment.created` to one SNS topic. The topic delivers a copy to two SQS queues (`reminders`, `specialist-notify`). Each queue triggers its own Lambda function and has its own dead-letter queue.
- **Why:** Lab 7 needs two independent functions to both react to one event. Two functions reading one SQS queue would compete, so each message would reach only one of them. SNS → SQS gives every consumer its own copy, and the queues keep messages safe if a function is down. Adding a third consumer later is just one more queue.
- **Gave up:** the handout's simpler single queue. EventBridge (one bus, two rules) would also work, but SNS → SQS is the more common pattern and keeps a queue (with retries and a DLQ) in front of each function.

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

- **Date:** 2026-10-21 · **Status:** Accepted (team vote 2026-10-31: 4 yes, 0 no)
- **Affects:** everyone: the Lab 6 report, the data residency design (L5-C1/C2), the Lab 8 defence
- **Decision:** HealthConnect's stated purposes become: triage support, appointment scheduling, health advisory, and **public health reporting limited to aggregated, anonymised counts** (e.g. "42 fever cases in Volta this month"), never individual records.
- **Why:** The data minimisation pass found that the real reasons for collecting `region` (planning resources, seeing where illnesses are more common) are reporting, which wasn't a stated purpose. Under Act 843 an unstated purpose can't justify collection. Stating it, and limiting it to aggregates, also matches the residency rule that only anonymised aggregates cross borders.
- **Gave up:** using identifiable records for reporting.

## D-019: Our own FHIR-shaped Postgres now; AWS HealthLake for demo day

- **Date:** 2026-10-22 · **Status:** Proposed (Eugene)
- **Decision:** Until demo day, patient data lives in our own RDS Postgres with the FHIR-shaped schema (`db/migrations/`), served by `patient-record-service`. For demo day we add AWS HealthLake (AWS's managed FHIR server) and show the same records there. This answers the brief's "choose and justify a cloud healthcare platform".
- **Why:** The labs grade our own schema, audit log and security controls, which a managed service would hide. HealthLake is not offered in `af-south-1` (checked 2026-10-22: no endpoint there; it answers in `eu-west-1`, `eu-west-2`, `us-east-1`), so it would sit in another region from the rest of the system. Building on Postgres first keeps the core in one region and lets HealthLake be added once, near the end, without paying for it for weeks.
- **Gave up:** a real FHIR server from day one. Our schema is FHIR-*shaped*, not a FHIR API; the gaps are in `docs/fhir-mapping.md`.
- **Watch:** HealthLake data stores may bill for as long as they exist, not per request. Check the pricing page and create the data store only close to demo day, then delete it.

## D-020: The README shows only the current stage

- **Date:** 2026-10-23 · **Status:** Replaced by D-025
- **Affects:** everyone: whoever changes a task's state updates the README table in the same PR; whoever submits a stage replaces the table with the next stage
- **Decision:** `README.md` holds one table: the current stage's tasks, who has each, status and blocker. Done stages and later stages live only in `PLAN.md`. The rules and repo map moved to `CONTRIBUTING.md` and `AGENTS.md`. Refines D-009 (the repo is still the single source of truth).
- **Why:** The README had grown to every person's "now" and "next" across four labs. A glance should answer "what stage are we at, and who's on what?" and nothing else.
- **Gave up:** seeing upcoming work on the front page; it's one click away in `PLAN.md`.

## D-021: One approval from any teammate merges a PR

- **Date:** 2026-10-23 · **Status:** Accepted
- **Affects:** everyone reviewing PRs
- **Decision:** Branch protection on `main` keeps "1 approval required" but no longer requires the approval to come from the path's code owner. `CODEOWNERS` still requests the right reviewers automatically.
- **Why:** Nobody can approve their own PR, so a code-owner rule made each PR wait on one specific person; PRs #2 and #3 sat approved-but-blocked while Lab 5's deadline closed in.
- **Gave up:** a guarantee that the area's owner has seen every change to it. Reviewers should still ping the owner for changes in their folder.


## D-022: HealthConnect's public names are subdomains of `agroconnect.space`

- **Date:** 2026-10-23 · **Status:** Accepted (Eugene, owner of S5)
- **Affects:** Everyone who calls the API or opens the call page: use `https://api-hc.agroconnect.space` and `https://call-hc.agroconnect.space`, not the load balancer's AWS name. Elise's L6-B2 checks HTTPS on these names.
- **Decision:** One ACM certificate covers `api-hc.agroconnect.space` (the API) and `call-hc.agroconnect.space` (the Lab 7 call page). DNS is at Hostinger, outside Terraform: two CNAMEs to the load balancer and two certificate-validation CNAMEs. The load balancer serves TLS 1.3 on `:443` and redirects `:80` to it.
- **Why:** HTTPS needs a domain (S5 blocked L6-B1 and phones refuse the camera without it). `agroconnect.space` is already the team's, already at Hostinger, and paid until October 2027, so this costs nothing and takes minutes.
- **Gave up:** a HealthConnect-branded domain (would cost money and a purchase). The name says "agroconnect"; the `-hc` suffix keeps it apart from Prosit 1's old `api` and `app` records, which now point at deleted resources and can be removed.

## D-023: The Lab 7 call page runs on one dedicated server behind the shared load balancer

- **Date:** 2026-10-23 · **Status:** Accepted (Perfect confirmed 2026-10-27 after opening the hosted page on a phone: camera works)
- **Affects:** Perfect (L7-C1 to C4): test with `https://call-hc.agroconnect.space` instead of a tunnel. `webrtc-spike/` gains a `Dockerfile` and a 25-second signaling heartbeat.
- **Decision:** `webrtc-spike/` is built into its own image (ECR `healthconnect-dev-call`) and runs on **one** `t3.micro` in a private subnet, with its own IAM role (pull its image, write its logs, SSM; nothing else). The load balancer forwards requests for `call-hc.agroconnect.space` to it (a host-header rule), and the WebSocket (`wss://…/ws`) goes through the same way. The signaling server pings each socket every 25 seconds. Torn down after Lab 7.
- **Why:** The signaling server keeps rooms in memory, so both people in a call must reach the **same** process; behind the API's two servers they could land on different ones and never meet. A load balancer closes any connection silent for 60 seconds, and a caller waiting in a room is silent, so without the ping the doctor would join an empty room. A fixed `https://` address works on any phone, without a laptop running a tunnel whose address changes on every restart.
- **Gave up:** about $9/month while it runs; a single point of failure (if the server dies, calls stop until it's replaced). Rooms in a shared store (e.g. Redis) would allow more servers but are more than a lab spike needs.

## D-024: Lab 6 was demonstrated in a separate, handout-style lab environment

- **Date:** 2026-10-25 · **Status:** Accepted
- **Affects:** everyone writing reports or defending Lab 6 in Lab 8; Eugene and Joseph (carried-forward tasks L6-A1b, L6-B1b, L6-D1)
- **Decision:** The Lab 6 steps were run exactly as the handout gives them, in a separate setup in `us-east-1` (team account): an Aurora PostgreSQL cluster `healthconnect-db` (so the handout's RDS Data API policy works), one EC2 server with `healthconnect-service-role`, the handout's schema and audit middleware. The report presents that run beside our own system's stronger design (schema in `db/`, HTTPS and encryption in `infra/`).
- **Why:** Much of Lab 6 already existed in our codebase in a different shape (UUIDs, enforced consent, database-level audit, RDS rather than Aurora). Reproducing the handout literally in our system would have meant weakening it; a separate run shows every required step without that.
- **Gave up:** evidence from the production system itself. Three pieces of the real system are still open and tracked: the API's own IAM role (L6-A1b), the customer-managed key / forced database TLS / HTTPS-only bucket (L6-B1b), and audit logging inside the API (L6-D1). The lab environment bills while it runs and must be torn down.

## D-025: The README lists everything open now, and who does it

- **Date:** 2026-10-25 · **Status:** Accepted · **Replaces:** D-020
- **Affects:** everyone; whoever changes a task's state updates the README in the same PR and removes the row once it's done
- **Decision:** The README lists every task that is open right now, grouped: today's deadline items, the current stage, items carried over from earlier labs, and preparation for the next session. Finished work never appears there; it lives in `PLAN.md`.
- **Why:** With Lab 6 wrapping up, Lab 7 starting and Lab 8 a week away, "current stage only" hid work people had to do this week. The point of the README is a quick glance at what's open and who owns it.
- **Gave up:** a single table; the README is now a few short ones.

## D-026: Callers are identified by signed tokens, checked against active practitioners

- **Date:** 2026-10-25 · **Status:** Accepted
- **Affects:** Perfect (the PWA sends `Authorization: Bearer <token>`), Eugene (a `JWT_SECRET_ARN` secret and IAM permission to read it), everyone testing the API
- **Decision:** Every protected API route requires a JWT signed with HS256 by our own secret (≥ 32 characters, from Secrets Manager), with issuer `healthconnect`, an expiry, and `sub` = a practitioner's UUID. On each request the API also checks that practitioner exists and is active. Without a configured secret, protected routes refuse everyone (the server still starts, so health checks pass). Until a login screen exists, `npm run token` signs tokens for demos.
- **Why:** The database stamps and audits every write with the acting user (D-015), so the API must know reliably who is calling. A header such as `x-user-id` can be forged by anyone. One shared secret is enough while one service both signs and checks tokens.
- **Gave up:** a real login flow (PIN or password, refresh tokens) for now, and asymmetric keys (RS256), which we'd want if other services ever check our tokens.


## D-027: The reminder function remembers sent reminders in a DynamoDB table

- **Date:** 2026-10-29 · **Status:** Accepted (live since Eugene applied it on 2026-10-29)
- **Affects:** Eugene (a new table in `infra/modules/events`, `terraform apply`, a cost-tracker line), Joseph (`functions/reminder_function.py` now needs `SENT_TABLE`), the Lab 7 report and Lab 8 defence
- **Decision:** Before sending, the reminder function claims the appointment id in a DynamoDB table, `healthconnect-dev-reminders-sent`, with one conditional write ("only if this id isn't there yet"). Claimed already: it logs `duplicate_skipped` and sends nothing. Sending fails: it releases the claim and raises, so SQS retries. Entries expire after 30 days (TTL). Only the reminder function's role may write to the table. Without `SENT_TABLE` the function refuses to run rather than risk duplicates.
- **Why:** The API and SQS both deliver at least once (an offline retry, or SQS redelivering after a timeout), and the API deliberately re-publishes on a retry so a lost event can be recovered (`learnings/database.md` §8). So duplicates are expected, and the consumer must skip them: on 26 Oct, Abena's booking produced two reminders. A conditional write is atomic, so two copies arriving together can't both send. DynamoDB needs no network changes (our functions run outside the VPC), costs fractions of a cent at our volume, and keeps the functions independent of the main database, which is the decoupling Lab 7 is about.
- **Rejected:** a table in our Postgres (the function would have to join the VPC and hold database credentials, coupling it to RDS); SNS/SQS FIFO deduplication (it only remembers for 5 minutes, while a phone can retry hours later, and the topic and queues would have to be rebuilt).
- **Gave up:** a guaranteed reminder in one rare case: if the function dies after claiming but before sending, the retry sees the claim and skips. We chose "at most one reminder" over "sometimes two" for that case. The specialist-notify function still has no deduplication.

## D-028: We design for Act 843 as the law and the HIPAA Security Rule as the safeguards

- **Date:** 2026-10-30 · **Status:** Accepted (team vote 2026-10-31: 3 yes, 0 no; Elise added her yes on #49, 2026-11-06, so 4 yes) · **Replaces:** D-005
- **Affects:** everyone; Perfect (consent, PIN lock, device encryption), Joseph (access control, audit), Eugene (encryption, backup), Elise (data minimisation)
- **Decision:** Act 843 is the legal basis for every health-data decision. We also design against the HIPAA Security Rule's safeguard groups (access control, audit controls, integrity, person authentication, transmission security, backup) and map each to a control in the report. We write "designed against HIPAA safeguards", never "HIPAA-compliant" or "certified".
- **Why:** The brief asks for HIPAA compliance (p.2, p.7, p.9) and the rubric scores it, but HIPAA is a US law and doesn't apply in Ghana. Using both is accurate and scores.
- **Gave up:** D-005's "reference checklist only" wording. Open question: the checklist mentions collecting real patient data with consent, but D-004 (synthetic data only, public repo) still stands. Real data would need ethics approval and a private store. Settled by D-034: we stay synthetic.

## D-029: The full brief is in scope: built breadth first, with sandbox mode for partner systems

- **Date:** 2026-10-30 · **Status:** Accepted (team vote 2026-10-31: 3 yes, 0 no; Elise added her yes on #49, 2026-11-06, so 4 yes; Eugene confirmed the AWS budget 2026-11-01) · **Replaces:** D-008
- **Affects:** everyone; Perfect (all screens), Joseph (splits the new backend services), Eugene (hosting and cost of the services)
- **Decision:** Every requirement in Weeks 1–4 is Build, Build (sandbox), Design or Process, as listed in [`REQUIREMENTS-CHECKLIST.md`](../REQUIREMENTS-CHECKLIST.md); nothing is "deferred". We build in the 11 steps of [`PLAN.md`](../PLAN.md) Phase 6, breadth first: a basic screen for every role before depth anywhere, and each step proven on a real phone before the next starts. Services that need a partner system (NHIS, DHIS2, WHO, hospitals, pharmacies, SMS, payments) get a real interface and a labelled mock mode. Must-implement items on p.3 (prescription fraud checks, emergency escalation) are core.
- **Why:** The scope changed: the brief's weeks have passed and the whole brief must be shown. Partner systems can't be reached by a student team, so a mock with the real interface is the honest way.
- **Gave up:** depth on the lab-graded foundation, and a calm budget: sixteen new services strain the $400 credits and the fleet (hosting is decided before FB-3). The report must say plainly what is basic or mock.

## D-030: One CI/CD pipeline: every change tested and scanned, and merging to main is what deploys

- **Date:** 2026-10-30 · **Status:** Accepted (Eugene; live since 2026-10-30)
- **Affects:** everyone (every PR now also runs secret, dependency and misconfiguration scans; a merge to `main` deploys), Eugene (`.github/`, `infra/modules/cicd`, `.trivyignore.yaml`), Joseph (`backend/Dockerfile` drops npm from the runtime image)
- **Decision:** `.github/workflows/ci.yml` runs on every PR and every push to `main`: the existing tests (Terraform, API, schema, Lambda functions) plus the frontend and the call page, then a **security** job: **gitleaks** over the whole git history, **Trivy** on every lockfile (HIGH/CRITICAL with a fix fails) and on the Terraform and Dockerfiles (anything not listed with a reason in `.trivyignore.yaml` fails). On `main`, only what changed is deployed, and only after the jobs it depends on pass: the API image is built, **scanned by Trivy before it is pushed** (a hard gate), pushed to ECR as `:<sha>`, the SHA pinned in SSM, the servers replaced, and `/health` and `/ready` smoke-tested; the call page is built, scanned (report only), pushed and restarted through SSM. **CodeQL** scans our TypeScript and Python on every PR and weekly; **Dependabot** opens weekly update PRs. AWS access is by OIDC: the deploy role trusts only a run on `main` of this repo, and each permission names its resource.
- **Why:** We deferred deployment to the Week 9 lab, and it cost us: every deploy went through one laptop (it broke when the disk filled), Perfect's call-page change sat invisible because nobody redeployed, and the frontend and call-page tests never ran in CI. Phase 6 (D-029) multiplies the deployables, which manual steps can't keep up with. The repo is public, so a leaked secret or a known-vulnerable package is the cheapest mistake to make and to catch. Week 9 then becomes evidence of a pipeline that already runs.
- **Not in the pipeline (yet):** `terraform apply` stays manual, after a human reads the plan (AGENTS.md), so the deploy role cannot change infrastructure; the Lambda functions ship with that apply. The frontend deploy comes with its hosting (S3 + CloudFront, next PR). The call image is scanned but doesn't block, because the Lab 7 spike keeps its dev tools in the image and is being retired into SVC-3.
- **Gave up:** a few minutes on every PR (the scans), and a red build whenever a new vulnerability is published, even if our code didn't change: that is the point, but it can block an unrelated merge until someone bumps a package or adds a justified line to `.trivyignore.yaml`.

## D-031: Patient data on the phone is locked by a passphrase; the PIN only guards the screen

- **Date:** 2026-10-30 · **Status:** Accepted (team vote 2026-10-31)
- **Affects:** Perfect (PWA lock and set-up screens), Joseph (the real auth-service must later be able to bring a person's data back after a wipe), everyone writing the security part of the report
- **Decision:** Records saved on the phone are encrypted with a random key. That key is locked with a **passphrase of at least 10 characters** (PBKDF2-SHA256, 600,000 rounds), typed only when the app starts cold (after a restart). A **4 to 6 digit PIN** opens the 5-minute screen lock while the key is still in memory. Fingerprint (staff) works only for that screen lock. Wrong PINs and wrong passphrases share one count of **five tries; the fifth wipes that person's local data** (key, PIN, fingerprint, database) and signs them out. Anything not yet sent is lost, until the real login service can restore it.
- **Why:** A 4 to 6 digit PIN has only 10,000 possibilities, so anyone who copies the phone's storage could open the data. A long passphrase makes that guess impractical, and typing it rarely keeps it usable for volunteers. The wipe limits guessing on a lost phone. The brief's target is zero breaches (p.7).
- **Gave up:** convenience (a longer secret at set-up and after restarts); unsent records after five wrong tries; a stronger option still, a key held in the phone's secure hardware, which browsers don't offer reliably.

## D-032: Each phone downloads what the signed-in role may see, and the server decides

- **Date:** 2026-10-31 · **Status:** Proposed
- **Affects:** Joseph (the real sync API needs a download endpoint), Perfect (the PWA downloads on every sync), Elise (the rules mirror the consent and role tables)
- **Decision:** Besides sending, every sync also **downloads** the records the signed-in person is allowed to see that others created, resuming from a bookmark so nothing is fetched twice. The **server** decides what each role may download: a person always gets what they created (so a replaced phone gets its data back); a CHV also gets what others added about their patients; a doctor gets the visits booked with them and those patients' records; other roles get nothing until a rule is written for them. Two booked visits for one specialist at the same time are refused for good (409 `double_booked`, D-017) and the phone shows the person why. In test mode the browser's mock server follows the same rules.
- **Why:** Referrals, visits, prescriptions and emergencies all pass between people, so the receiver's phone must be able to get them. The app only hides screens; the server must enforce who may read what (Lab 6 lesson).
- **Gave up:** simplicity (a second direction of sync with its own bookmark); a download of everything about a patient is wider than a single request would need, to be narrowed later by purpose (D-014).

## D-033: The PWA is static files on S3 behind CloudFront, deployed by the pipeline

- **Date:** 2026-11-05 · **Status:** Proposed (Eugene; Perfect reviews, it is where the app lives)
- **Affects:** Perfect (every merge to `frontend/` goes live at `https://app-hc.agroconnect.space` in a few minutes), Eugene (`infra/modules/frontend`, the `deploy PWA` job), Joseph (when the app calls the real API it is a different origin, so the API needs CORS for `app-hc`, or `/api/*` gets routed through CloudFront)
- **Decision:** `npm run build` makes plain files, so they are served with no servers: a **private S3 bucket** that only CloudFront may read (Origin Access Control), **CloudFront** with the African edges (`PriceClass_200`), an **ACM certificate in us-east-1** (CloudFront takes no other region), TLS 1.2+, the AWS managed security headers (HSTS, nosniff, frame-options) and a tiny **CloudFront Function** that sends app routes (`/login`, `/app/...`) `index.html` while real files 404 normally. On a merge to `main` that changes `frontend/`, the pipeline tests and builds it, uploads the hashed files first (cached a year, never deleted, so a phone on the old version still loads), then `index.html`, `sw.js` and the rest with `no-cache`, clears the CDN and smoke-tests `/`, `/login`, `/sw.js`.
- **Why:** Cheapest and simplest that is correct: about **$0/month** at our traffic (CloudFront's always-free tier is 1 TB and 10 million requests a month; S3 storage is pennies), nothing to patch, and an edge in Lagos is closer to Ghana than our servers in Cape Town. HTTPS was the blocker for the FB-2 to FB-4 phone checks (fingerprint, microphone, install, offline start all need a secure origin). Serving the files from the API containers would tie a frontend release to an 8-minute server swap and spend server time on files; Amplify Hosting adds build minutes and a second CI for the same result.
- **Gave up:** a WAF (about $8/month, nothing to protect on public static files; accepted in `.trivyignore.yaml`); same-origin API calls for now (CORS or a `/api/*` route when the app stops using its mock server); a few hundred KB of old hashed files kept per release.

## D-034: Patients stay synthetic; published DHS regional figures make them realistic

- **Date:** 2026-11-06 · **Status:** Accepted (Joseph; reaffirms D-004)
- **Affects:** everyone; whoever builds `surveillance-service` (SVC-8) and the seed data, Joseph (the report says what real data would need)
- **Decision:** We collect no real patient data, which answers the open question in D-028. Field testing uses team members or consenting volunteers with made-up patients. To make the synthetic data believable, we may use **published regional figures** from the [DHS Program API](https://api.dhsprogram.com/) (Ghana 2022 DHS, which covers the 16 current regions), cited in the code or data file that uses them. We don't use DHS individual-level files.
- **Why:** Real records would need a partner facility, ethics approval, Act 843 steps and a private store, and we have no ethics approval (D-004) and no time for it. Regional percentages identify nobody and come from a public API, so they are safe in a public repo. [DHS's terms of use](https://dhsprogram.com/data/terms-of-use.cfm) (read 2026-11-06) forbid re-distributing micro-level data, "directly or within any tool/dashboard", which is why we keep to the published figures. They cover downloaded datasets and don't mention the API's figures, so we still cite the source.
- **Gave up:** testing on real records. The report explains the choice and what real data would require. DHS figures are survey percentages from 2022, not live case counts, so **anything derived from them is labelled as synthetic** wherever it is shown, including the dashboard.

## D-035: One API with route modules, not sixteen services

- **Date:** 2026-11-06 · **Status:** Accepted (confirmed by Eugene, 2026-11-06: no new hosting needed) · **Changes:** the services list in PLAN Phase 6
- **Affects:** everyone building a feature (add a route module, not a new service), Eugene (nothing new to host), Perfect (one API address)
- **Decision:** The new backend features (SVC-1 to SVC-16) are route modules inside `patient-record-service`, sharing its database, sign-in, audit and deployment. Partner systems stay behind a small adapter with a mock mode. The event functions stay as they are.
- **Why:** We have one week. Sixteen services would need sixteen pipelines, images and health checks, and would strain the servers and the budget for no gain at our traffic. Each module can still be split out later, and the report describes that split as the target design.
- **Gave up:** independent scaling and deployment per service, and isolation: a bad deploy or a crash affects every feature. A larger target architecture goes in the report as design, not build.

## D-036: Sign-in with a username, a hashed password and one-use refresh tokens

- **Date:** 2026-11-07 · **Status:** Accepted (Joseph, API owner) · **Changes:** `npm run token` is now only for tests; the brief's login is real
- **Affects:** Perfect (the app's sign-in screen needs a password field), Eugene (run the migration and the seed on RDS), everyone demoing the app
- **Decision:** `POST /auth/login` checks a scrypt-hashed password and returns a one-hour token plus a 30-day refresh token that works once. Five wrong passwords lock the account for 15 minutes. Migration `006`, not `005`, because `005` is reserved for E-M part 2.
- **Why:** Scrypt is built into Node, so no new package. A short token limits what a stolen one can do, and a long refresh lets a CHV stay signed in through weeks offline. The API still checks the role in the database on every request, so the token is never trusted for permissions.
- **Trade-off:** The test accounts share one password, kept out of the repo. That's acceptable for synthetic data only, and would have to change before real patients (D-034). A phone that loses the reply to a refresh has to sign in again.
- **Check:** `evidence/final/J1-login-roles.txt`.

## D-037: Sync keeps the phone's record and writes it to the proper table too

- **Date:** 2026-11-07 · **Status:** Accepted (Joseph, API owner) · **Builds on:** D-011, D-032
- **Affects:** Perfect (the app's `SyncApi` can now call the real server), Elise (her rules decide what sync accepts), Eugene (a Postgres-heavy path for the load test)
- **Decision:** `POST /sync/push` saves each record twice in one transaction: the exact FHIR copy with its version in `sync_records`, and a row in `patients`, `consents`, `observations` or `appointments`. `GET /sync/pull` uses a running number as the bookmark and filters by role on the server.
- **Why:** The phone needs its record back exactly as sent, or versions and conflicts stop working. The tables are where the consent, range and double-booking rules live, and reports need them. Saving to one only would lose one or the other.
- **Trade-off:** The same data is held twice. The last step of each push takes one lock so that bookmarks can't skip a record, which limits writes per second; the load test measures it. Photos stay in Postgres until SVC-2.
- **Check:** `evidence/final/J2-sync.txt`.

## D-038: Prescription fraud checks raise flags a pharmacist must read; the licence register is a sandbox

- **Date:** 2026-11-07 · **Status:** Accepted (Joseph, API owner) · **Builds on:** D-034, D-035
- **Affects:** Perfect (the app's prescription screens switch to the API with P2), Elise (migration `008` adds to her prescriptions table), whoever demos this
- **Decision:** Duplicate, repeated, high-rate and unlicensed-prescriber checks raise flags rather than refuse. A pharmacist must acknowledge them before dispensing, and we record who did. Licences and pharmacies come from our own test data. Issuing and dispensing need a signal.
- **Why:** A patient can genuinely need the same medicine twice, so a hard block would stop real care; the person at the counter decides, and it's on record. Fraud checks can't run offline, so an offline prescription could be dispensed twice at two pharmacies. We have no access to the GMDC register or a pharmacy network.
- **Trade-off:** A doctor with no signal can't issue a prescription. The thresholds are illustrative, and no regulator or medical partner has reviewed them.
- **Check:** `evidence/final/FB-6-api.txt`, `evidence/final/FB-6-*.png`.

## D-039: Payments through votex365, simulated and labelled until a test key is set

- **Date:** 2026-11-07 · **Status:** Accepted (Joseph, API owner) · **Builds on:** D-035
- **Affects:** Perfect (the fee screen is built), Eugene (the secret and its permission), anyone demoing payments
- **Decision:** The API uses the Prosit 1 votex365 client: hosted checkout and a signed webhook. Without `VOTEX_SECRET_ARN`, every payment is simulated, and the API and the app both say so. Amounts are set on the server; the phone number isn't stored.
- **Why:** The money path should be real code rather than a mock, but the demo mustn't depend on a partner's key or uptime. A simulated payment that's clearly labelled is honest; one presented as real isn't.
- **Trade-off:** Until a test key is set, nothing has run against votex365 from this project. The example prices aren't based on anything.
- **Check:** `evidence/final/SVC-4-api.txt`, `evidence/final/SVC-4-*.png`.
