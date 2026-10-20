# Plan

**The plan we all follow:** who leads what, what we build, and every task in the order it happens,
with one owner, the tasks that block it, and a status. This file is the source of truth for
**who does what next**. Decisions behind it are in [`docs/decisions.md`](./docs/decisions.md).

## How to use this file

- **Pick up** a task only when everything in "Blocked by" is ✅ Done. Set it to 🔄 In progress, with your name.
- **Finish** a task: set it to ✅ Done, then check which tasks it was blocking and flip them from ⛔ Blocked to 🟢 Ready.
- **In the same PR, update the "Pending now" table in [`README.md`](./README.md)**, so the README always shows what's pending and who has it.
- "Done" means the evidence is in `evidence/` and the learnings note is written (see [`CONTRIBUTING.md`](./CONTRIBUTING.md)).
- New task? Add a row in the right place, with a new ID, an owner and its blockers.

**Status:** ✅ Done · 🔄 In progress · 🟢 Ready (nothing blocking) · ⛔ Blocked · ⚪ Optional

---

## Roles

Each lead owns their area. Each person also does one task outside their lane, so everyone can explain the whole system (decision D-006).

| Person | Lead role | Owns | Outside-lane task |
|---|---|---|---|
| **Joseph** | Project Manager / API | Plan and tracking, facilitator questions, repo, `patient-record-service` + audit logging, report editing, Act 843 legal grounding for the residency doc | Decommissioning review with Eugene; secrets rotation drill |
| **Eugene** | Cloud / DevOps | Terraform (VPC, ALB, ASG, RDS, S3, KMS), IAM role and policy, TLS certificate, failover demo, AgroConnect decommissioning, cost tracker, CI | FHIR managed-service sandbox comparison |
| **Elise** | Data | FHIR-aligned schema + migrations, FHIR mapping and gaps, data minimisation, RBAC table, sharding design | Verify and write up encryption at rest and in transit (Lab 6 Part B) |
| **Perfect** | Frontend | HealthConnect CHV PWA, offline demo, architecture diagrams, CDN measurement, WebRTC spike | Run the least-privilege checks and write "what IAM protects against" (Lab 6 Part A) |

**Everyone:** at least one reflection answer per lab, a daily learning log, the weekly peer evaluation, and a `learnings/` note for everything you own.

## Scope: build, design or skip

The brief is far bigger than four weeks (summary in [`knowledge/brief.md`](./knowledge/brief.md)). We build the foundation properly and document the rest honestly (decision D-008).

| Area | Decision |
|---|---|
| CHV offline PWA: register patient, vitals, photo, consent | **Build** (fork of the AgroConnect PWA) |
| Patient-record API (FHIR-shaped), audit log, RBAC | **Build** (Labs 5–6) |
| Security foundation: least privilege, TLS, encryption, private DB | **Build + evidence** (Labs 5–6) |
| Telemedicine: scheduling, reminders, one consult flow | **Build** (Lab 7); audio first, video if bandwidth allows |
| Mobile money fee, SMS reminders | **Reuse** Prosit 1 integrations (test mode) |
| Multi-country data residency | **Design doc** (+ optional second-region DB) |
| Real FHIR server | **Sandbox only** (Lab 6 homework) |
| Biometrics, voice-to-text, Dagbani/Hausa | **Design / ADR only** |
| Surveillance dashboard, ML, insurance, supply chain | **Design / defer**, unless a later lab requires them |
| Real patient data | **Never** (D-004) |

---

## Phase 0: Set up

| ID | Task | Owner | Blocked by | Status | Done when |
|---|---|---|---|---|---|
| S1 | Repo set up: README, CONTRIBUTING, CODEOWNERS, docs, learnings, knowledge, AGENTS.md | Joseph | — | ✅ Done | Pushed to `main` |
| S2 | Turn on branch protection for `main` (settings in CONTRIBUTING) | Joseph | — | ✅ Done | Direct pushes to `main` are refused (on since 2026-10-20: 1 approval, code-owner review, applies to admins too) |
| S3 | Ask the facilitator: Lab 5 on HealthConnect OK? Real due dates? Must AgroConnect's API stay live? Prosit 2 final format? | Joseph | — | 🟢 Ready | Answers recorded in `docs/decisions.md` / `knowledge/` |
| S4 | Copy Terraform modules into `infra/`: new state key, VPC `10.30.0.0/16`, `Project=healthconnect` tags, `terraform validate` in CI | Eugene | — | ✅ Done | CI passes on a PR |
| S5 | HealthConnect subdomain + ACM certificate | Eugene | S4 | 🟢 Ready | Certificate issued |
| S6 | Prosit 2 cost tracker (Resource Inventory + Weekly Log) + budget alarm | Eugene | — | 🔄 In progress (budget alarm applied; tracker sheet to do) | Alarm email confirmed |
| S7 | Rotate the Prosit 1 Lab 4 DB password (or delete that database) | Eugene | — | 🟢 Ready | Old password no longer works |
| S8 | Shared vocabulary in `knowledge/`: user roles (CHV, nurse, specialist, GHS official, admin) and data resources (Patient, Observation, Consent, AuditEvent) | Elise | — | 🟢 Ready | Merged |
| S9 | Fork the AgroConnect PWA into `frontend/` as the CHV app shell | Perfect | — | 🟢 Ready | Builds and runs offline locally |
| S10 | Scaffold `patient-record-service` in `backend/`: Express/TypeScript, `/health` (returns instance id), `/ready` (checks DB), Dockerfile | Joseph | — | ✅ Done | Container runs locally ([learnings](./learnings/patient-record-service.md)) |

## Phase 1: Lab 5 (on HealthConnect)

| ID | Task | Owner | Blocked by | Status | Done when |
|---|---|---|---|---|---|
| L5-A | VPC applied (2 public, 2 private-app, 2 private-data subnets, 2 AZs, IGW, fck-nat) + route-table proof | Eugene | S4 | 🔄 In progress (applied; routes proof in; VPC screenshot to do) | `evidence/lab5/outputs_A_routes.txt` + VPC screenshot |
| L5-B1 | RDS in data subnets, not public, port 5432 open only to the app security group | Eugene | L5-A | 🔄 In progress (applied; screenshot + outside-connection test to do) | Console screenshot; connection from outside fails |
| L5-B2 | 2 instances of the service behind the ALB; failover demo (stop one, 10/10 requests still succeed) | Eugene | L5-B1, S10 | ⛔ Blocked | Target-health screenshots + both script outputs |
| L5-C1 | Data residency: sharding design + diagram (country key, one DB per country, only anonymised aggregates cross borders) | Elise | — | 🟢 Ready | Draft in `docs/data-residency.md` |
| L5-C2 | Data residency: law per country (Ghana Act 843 + Kenya or Nigeria), one concrete control each, "needs legal review" list | Joseph | — | 🟢 Ready | Section added to `docs/data-residency.md`, clauses verified |
| L5-C3 | One-page residency PDF | Elise | L5-C1, L5-C2 | ⛔ Blocked | PDF in `evidence/lab5/` |
| L5-D | AgroConnect decommissioning: everything was destroyed with `terraform destroy` on 2026-10-15 (74 resources, no DB snapshot); write the checklist note and log the spend | Eugene (Joseph reviews) | — | 🟢 Ready | Checklist + spend figure in `evidence/lab5/` |
| L5-R1 | Consolidated architecture diagram (client → ALB → app → data → external APIs, subnet boundaries marked) | Perfect | — (finalise after L5-B2) | 🟢 Ready | PNG + draw.io in `docs/` |
| L5-R2 | PWA offline demo evidence (screenshots or short recording) | Perfect | S9 | ⛔ Blocked | Files in `evidence/lab5/` |
| L5-R3 | AgroConnect retrospective: one honest sentence each | Everyone | — | 🟢 Ready | Sentences in the "Lab 5" Google Doc tabs |
| L5-R4 | Lab 5 report (300 words) + package PDF | Joseph | L5-A, L5-B2, L5-C3, L5-D, L5-R1, L5-R2, L5-R3 | ⛔ Blocked | Submitted on Canvas |
| L5-H1 | Homework: egress audit + NAT cost comparison | Eugene | L5-B2 | ⚪ Optional | Note in `learnings/` |
| L5-H2 | Homework: CDN page-load before/after on Slow 3G | Perfect | S9 | ⚪ Optional | Numbers in the report |
| L5-H3 | Homework: second-country DB + one query that would need federation | Elise | L5-B1 | ⚪ Optional | Query + note in `learnings/` |

## Phase 2: Lab 6

| ID | Task | Owner | Blocked by | Status | Done when |
|---|---|---|---|---|---|
| L6-C1 | FHIR-aligned schema migrations: UUID ids, LOINC code + UCUM unit on observations, consent required before writes, append-only `access_log` | Elise | — | ✅ Done | `db/migrations/*.sql` applies cleanly to an empty Postgres (`db/tests/run_tests.sh`: 25 deny, 14 allow, 0 problems) |
| L6-C2 | FHIR mapping + gaps + data minimisation (one justification per `patients` column under Act 843) | Elise | L6-C1 | 🔄 In progress (Elise): written; waiting on D-018 and LOINC code check | `docs/fhir-mapping.md` |
| L6-A1 | `healthconnect-service` IAM role + least-privilege policy (only its own secret, bucket, logs, ECR) | Eugene | L5-B1 | ⛔ Blocked | Policy JSON in `infra/` + `evidence/lab6/` |
| L6-A2 | Run allow/deny checks (allowed: our secret; denied: delete DB, AgroConnect's secret) + "what it protects against" paragraph | Perfect | L6-A1 | ⛔ Blocked | `evidence/lab6/outputs_A_least_privilege.txt` + learnings note |
| L6-B1 | Encryption build: customer-managed KMS key, S3 policy denying non-HTTPS, HSTS header, `rds.force_ssl` on | Eugene | L5-B1, S5 | ⛔ Blocked | Applied via Terraform |
| L6-B2 | Encryption verification evidence: RDS at rest, DB connection uses SSL, HTTP→HTTPS redirect, S3 encrypted + not public | Elise | L6-B1 | ⛔ Blocked | Screenshots + outputs in `evidence/lab6/` |
| L6-D1 | Audit logging in the service: identity from the session (not a header), data + audit write in one transaction, 404 still logged, denied attempts logged | Joseph | S10, L6-C1 | 🟢 Ready (needs `withTransaction` first; see Elise's PR #2 review) | Tests pass locally |
| L6-D2 | Deploy the service and capture audit evidence (POST as a CHV, GET as a doctor, last 5 log rows, failed DELETE on the log) | Joseph | L6-D1, L5-B2 | ⛔ Blocked | `evidence/lab6/outputs_D_audit.txt` |
| L6-R | Lab 6 report (300 words) + package (PDF, policy, schema, screenshots) | Joseph | L6-A2, L6-B2, L6-C2, L6-D2 | ⛔ Blocked | Submitted on Canvas |
| L6-H1 | Homework: FHIR managed-service sandbox + 150-word comparison (check whether it exists in `af-south-1`) | Eugene | — | ⚪ Optional | Note in `learnings/` |
| L6-H2 | Homework: secrets rotation drill, timed | Eugene + Joseph | L6-D2 | ⚪ Optional | Time recorded in `learnings/` |
| L6-H3 | Homework: RBAC table (CHV / specialist / GHS official × patients / observations / access_log) | Elise | L6-C1 | ⚪ Optional (unblocked) | Table in `docs/` |
| L6-H4 | Read the Lambda "Getting Started" docs | Everyone | — | 🟢 Ready | — |

## Phase 3: Lab 7 prep (before Lab 7 is released)

| ID | Task | Owner | Blocked by | Status | Done when |
|---|---|---|---|---|---|
| L7-P1 | Check `af-south-1` support: API Gateway WebSockets, EventBridge Scheduler, Kinesis Video Streams WebRTC (otherwise plan a self-hosted TURN server) | Eugene | — | 🟢 Ready | Findings in `knowledge/` |
| L7-P2 | WebRTC spike: audio-first, works on a throttled network | Perfect | S9 | ⛔ Blocked | Demo + learnings note |
| L7-P3 | Appointment/referral data model + event flow (booked → SMS reminder → consult → prescription) | Joseph + Elise | L6-C1 | 🟢 Ready (draft `appointments` table already in `db/migrations/001_initial_schema.sql`) | Diagram + draft schema in `docs/` |

Lab 7, Week 8 and Week 9 tasks get added here when those labs are released.

## Phase 4: Prosit 2 final package

| ID | Task | Owner | Blocked by | Status | Done when |
|---|---|---|---|---|---|
| F1 | Final report (Prosit 1 template structure; each owner writes their sections) | Joseph (editor) | Lab tasks, S3 | ⛔ Blocked | Submitted |
| F2 | Presentation + live demo script + fallback recording | Perfect + Joseph | F1 draft | ⛔ Blocked | Rehearsed once |
| F3 | Peer assessment + AI disclosure sign-off | Everyone | F1 | ⛔ Blocked | All four signed |

---

## Risks

| Risk | What we do about it |
|---|---|
| The facilitator expects Lab 5 on AgroConnect | S3 asks early. AgroConnect evidence is cheap to capture **before** L5-D decommissions it |
| A scoped-down IAM role breaks the service | Find the exact denied action in CloudTrail; add only that one |
| Budget overrun from running AgroConnect and HealthConnect at once | Do L5-D promptly; one NAT instance; small instances; budget alarm (S6) |
| A stopped RDS instance restarts by itself after 7 days | Snapshot and delete, or set a reminder |
| The brief's scope spreads us thin | Stick to the scope table above |
| Legal claims stated wrongly | Cite exact sections; mark "needs legal review"; verify before quoting |
| Someone's part is a black box | Their `learnings/` note is required before the PR merges |
