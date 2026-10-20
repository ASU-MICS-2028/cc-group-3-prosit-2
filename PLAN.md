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

**Status:** ✅ Done · 🔄 In progress · 🟢 Ready (nothing blocking) · ⛔ Blocked · ⚪ Optional · ❓ Confirm with the facilitator (S3)

### How every lab works

Each lab (5, 6, 7, 8) is graded on its own **and** feeds the Prosit 2 final report. Every lab is handed in as
**evidence (screenshots + terminal outputs) + a short report (usually 300 words)**, submitted as a PDF on Canvas.

1. **Whoever does a task captures its evidence at the same time**, using the file names in that lab's
   "Deliverables checklist" below. Many things can't be re-shot later: a failover only happens once, and
   resources get torn down to save money.
2. Screenshots must show the **resource name, the region (`af-south-1`) and the console page**, with no secrets on screen
   ([rules](./evidence/README.md)).
3. Tick the checklist row when the file is in `evidence/labN/`.
4. The report task for each lab (L5-R4, L6-R, …) starts only when every row is ticked. Its owner assembles the PDF and submits it.
5. The same evidence is reused in the final report (F1), so name things clearly.

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
| S3 | Ask the facilitator: Lab 5 on HealthConnect OK? Real due dates? Must AgroConnect's API stay live? Prosit 2 final format? Are the syllabus's weekly 500-word homework reports (L5-W, L6-W, L7-W) and the Week 8 milestone required? | Joseph | — | 🟢 Ready | Answers recorded in `docs/decisions.md` / `knowledge/` |
| S4 | Copy Terraform modules into `infra/`: new state key, VPC `10.30.0.0/16`, `Project=healthconnect` tags, `terraform validate` in CI | Eugene | — | 🟢 Ready | CI passes on a PR |
| S5 | HealthConnect subdomain + ACM certificate | Eugene | S4 | ⛔ Blocked | Certificate issued |
| S6 | Prosit 2 cost tracker (Resource Inventory + Weekly Log) + budget alarm | Eugene | — | 🟢 Ready | Alarm email confirmed |
| S7 | Rotate the Prosit 1 Lab 4 DB password (or delete that database) | Eugene | — | 🟢 Ready | Old password no longer works |
| S8 | Shared vocabulary in `knowledge/`: user roles (CHV, nurse, specialist, GHS official, admin) and data resources (Patient, Observation, Consent, AuditEvent) | Elise | — | 🟢 Ready | Merged |
| S9 | Fork the AgroConnect PWA into `frontend/` as the CHV app shell | Perfect | — | 🟢 Ready | Builds and runs offline locally |
| S10 | Scaffold `patient-record-service` in `backend/`: Express/TypeScript, `/health` (returns instance id), `/ready` (checks DB), Dockerfile | Joseph | — | ✅ Done | Container runs locally ([learnings](./learnings/patient-record-service.md)) |

## Phase 1: Lab 5 (on HealthConnect)

| ID | Task | Owner | Blocked by | Status | Done when |
|---|---|---|---|---|---|
| L5-A | VPC applied (2 public, 2 private-app, 2 private-data subnets, 2 AZs, IGW, fck-nat) + route-table proof | Eugene | S4 | ⛔ Blocked | `evidence/lab5/outputs_A_routes.txt` + VPC screenshot |
| L5-B1 | RDS in data subnets, not public, port 5432 open only to the app security group | Eugene | L5-A | ⛔ Blocked | Console screenshot; connection from outside fails |
| L5-B2 | 2 instances of the service behind the ALB; failover demo (stop one, 10/10 requests still succeed) | Eugene | L5-B1, S10 | ⛔ Blocked | Target-health screenshots + both script outputs |
| L5-C1 | Data residency: sharding design + diagram (country key, one DB per country, only anonymised aggregates cross borders) | Elise | — | 🟢 Ready | Draft in `docs/data-residency.md` |
| L5-C2 | Data residency: law per country (Ghana Act 843 + Kenya or Nigeria), one concrete control each, "needs legal review" list | Joseph | — | 🟢 Ready | Section added to `docs/data-residency.md`, clauses verified |
| L5-C3 | One-page residency PDF | Elise | L5-C1, L5-C2 | ⛔ Blocked | PDF in `evidence/lab5/` |
| L5-D | AgroConnect decommissioning: inventory, scale down, snapshot/stop RDS (note the 7-day restart), log spend | Eugene (Joseph reviews) | S3 | ⛔ Blocked | Checklist + spend figure in `evidence/lab5/` |
| L5-R1 | Consolidated architecture diagram (client → ALB → app → data → external APIs, subnet boundaries marked) | Perfect | — (finalise after L5-B2) | 🟢 Ready | PNG + draw.io in `docs/` |
| L5-R2 | PWA offline demo evidence (screenshots or short recording) | Perfect | S9 | ⛔ Blocked | Files in `evidence/lab5/` |
| L5-R3 | AgroConnect retrospective: one honest sentence each | Everyone | — | 🟢 Ready | Sentences in the "Lab 5" Google Doc tabs |
| L5-R4 | Lab 5 report (300 words) + package PDF | Joseph | L5-A, L5-B2, L5-C3, L5-D, L5-R1, L5-R2, L5-R3 | ⛔ Blocked | Submitted on Canvas |
| L5-H1 | Homework: egress audit + NAT cost comparison | Eugene | L5-B2 | ⚪ Optional | Note in `learnings/` |
| L5-H2 | Homework: CDN page-load before/after on Slow 3G | Perfect | S9 | ⚪ Optional | Numbers in the report |
| L5-H3 | Homework: second-country DB + one query that would need federation | Elise | L5-B1 | ⚪ Optional | Query + note in `learnings/` |
| L5-W | Syllabus homework: "Propose network architecture" (500 words) | Eugene | L5-B2 | ❓ Confirm | Submitted, if required |

### Lab 5 deliverables checklist

**Submit:** one PDF (300-word report + retrospective + diagram + all screenshots below, with links) on Canvas. Due: "before the Week 6 lecture" per the handout; real date via S3.

| ✓ | What the lab asks for | Evidence file (`evidence/lab5/`) | From task | Who captures it |
|---|---|---|---|---|
| ☐ | **A.** VPC with at least 2 subnets (console resource map) | `A-vpc-resource-map.png` | L5-A | Eugene |
| ☐ | **A.** Route tables: public subnet → internet gateway; data subnet has **no** internet gateway route | `outputs_A_routes.txt` + `A-route-tables.png` | L5-A | Eugene |
| ☐ | **B.** Database in the private subnet: "Publicly accessible: No", data subnets, security group | `B-rds-private.png` | L5-B1 | Eugene |
| ☐ | **B.** Load balancer target health: **both instances healthy** | `B-targets-both-healthy.png` | L5-B2 | Eugene |
| ☐ | **B.** `test_load_balancer.sh` output **before** stopping an instance (both instance ids appear) | `outputs_B_lb_before.txt` | L5-B2 | Eugene |
| ☐ | **B.** Target health after stopping one: **one unhealthy/removed** | `B-targets-after-failover.png` | L5-B2 | Eugene |
| ☐ | **B.** `test_load_balancer.sh` output **after**: 10/10 succeed on the survivor | `outputs_B_lb_after.txt` | L5-B2 | Eugene |
| ☐ | **C.** One-page data residency design (diagram + text) | `lab5-data-residency.pdf` | L5-C3 | Elise |
| ☐ | **D.** Decommissioning checklist: what's still running for AgroConnect and why | `D-decommissioning.md` + `D-resource-inventory.png` | L5-D | Eugene |
| ☐ | **D.** Month-to-date spend (billing console or cost tracker) | `D-spend.png` | L5-D | Eugene |
| ☐ | **Package:** consolidated architecture diagram, public/private boundaries marked | `docs/architecture.png` | L5-R1 | Perfect |
| ☐ | **Package:** working PWA, including the offline demo (airplane mode) | `R-pwa-online.png`, `R-pwa-offline.png` | L5-R2 | Perfect |
| ☐ | **Package:** container registry (ECR repository with the image) | `R-ecr.png` | L5-B2 | Eugene |
| ☐ | **Package:** running load-balanced service (`curl https://…/health`) | covered by `outputs_B_lb_*.txt` | L5-B2 | Eugene |
| ☐ | **Report:** 300 words on the network setup and what changed from Prosit 1 | Lab 5 Google Doc → PDF | L5-R4 | Joseph |
| ☐ | **Report:** one honest retrospective paragraph | Lab 5 Google Doc | L5-R3 → L5-R4 | Everyone → Joseph |
| ☐ | *Optional:* CDN page-load before/after on Slow 3G, egress audit, NAT cost note | `H-cdn.png`, `learnings/` | L5-H1/H2/H3 | Eugene, Perfect, Elise |

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
| L6-W | Syllabus homework: "Develop a security plan" (500 words) | Perfect | L6-A2 | ❓ Confirm | Submitted, if required |

### Lab 6 deliverables checklist

**Submit:** PDF report + IAM policy file + schema file + screenshots from Parts A–D, on Canvas. Due: "before the Week 7 lecture" per the handout; real date via S3.

| ✓ | What the lab asks for | Evidence file (`evidence/lab6/`) | From task | Who captures it |
|---|---|---|---|---|
| ☐ | **A.** The least-privilege policy document | `A-policy.json` (copy of the one in `infra/`) | L6-A1 | Eugene |
| ☐ | **A.** Role attached to the service (instance profile on the EC2 instances, not embedded keys) | `A-role-attached.png` | L6-A1 | Eugene |
| ☐ | **A.** An **allowed** action succeeding (reading our own secret) | `outputs_A_least_privilege.txt` + `A-allowed.png` | L6-A2 | Perfect |
| ☐ | **A.** A **forbidden** action denied (`AccessDenied` deleting the DB, reading AgroConnect's secret) | same output file + `A-denied.png` | L6-A2 | Perfect |
| ☐ | **B.** Database encryption at rest **enabled** (console, with the KMS key) | `B-rds-encryption.png` | L6-B2 | Elise |
| ☐ | **B.** Bucket encryption + public access block (`get-bucket-encryption`, `get-public-access-block`) | `outputs_B_s3.txt` | L6-B2 | Elise |
| ☐ | **B.** Plaintext HTTP rejected or redirected (`curl -v http://…` → 301), HTTPS works (`curl -v https://…` → 200) | `outputs_B_tls.txt` | L6-B2 | Elise |
| ☐ | **B.** *Extra:* DB connection is encrypted (`SHOW rds.force_ssl`, `pg_stat_ssl`) | `outputs_B_db_ssl.txt` | L6-B2 | Elise |
| ☐ | **C.** The schema file | `db/migrations/*.sql` | L6-C1 | Elise |
| ☐ | **C.** FHIR mapping write-up + gaps + data minimisation (Act 843) | `docs/fhir-mapping.md` | L6-C2 | Elise |
| ☐ | **D.** Query result showing populated audit-log entries (a write by a CHV, a read by a doctor) | `outputs_D_audit.txt` + `D-audit-log.png` | L6-D2 | Joseph |
| ☐ | **D.** *Extra:* deleting from the audit log is refused | `outputs_D_append_only.txt` | L6-D2 | Joseph |
| ☐ | **Report:** 300 words: IAM and what it protects against · encryption · FHIR decisions and gaps · one ethics/consent point naming the Act 843 principle | Lab 6 Google Doc → PDF | L6-R | Joseph (paragraphs from Perfect, Elise) |
| ☐ | *Optional:* FHIR sandbox comparison (150 words), rotation-drill time, RBAC table | `learnings/`, `docs/` | L6-H1/H2/H3 | Eugene, Eugene + Joseph, Elise |

## Phase 3: Lab 7 prep (before Lab 7 is released)

| ID | Task | Owner | Blocked by | Status | Done when |
|---|---|---|---|---|---|
| L7-P1 | Check `af-south-1` support: API Gateway WebSockets, EventBridge Scheduler, Kinesis Video Streams WebRTC (otherwise plan a self-hosted TURN server) | Eugene | — | 🟢 Ready | Findings in `knowledge/` |
| L7-P2 | WebRTC spike: audio-first, works on a throttled network | Perfect | S9 | ⛔ Blocked | Demo + learnings note |
| L7-P3 | Appointment/referral data model + event flow (booked → SMS reminder → consult → prescription) | Joseph + Elise | L6-C1 | 🟢 Ready (draft `appointments` table already in `db/migrations/001_initial_schema.sql`) | Diagram + draft schema in `docs/` |

## Phase 4: Lab 7 (not released yet)

Expected from Lab 6's "Looking Ahead" and the syllabus: **serverless telemedicine**, meaning functions (Lambda), event-driven
appointment scheduling, and low-bandwidth WebRTC video. Expected deliverables: a working serverless function for the project,
evidence and a **300-word lab report**. When the handout is released, Joseph replaces this section with real tasks
and a deliverables checklist like Labs 5 and 6.

| ID | Task | Owner | Blocked by | Status | Done when |
|---|---|---|---|---|---|
| L7-0 | Read the Lab 7 handout; add its tasks and deliverables checklist here; assign owners | Joseph | Lab 7 release | ⛔ Blocked | This section rewritten |
| L7-R | Lab 7 report (300 words) + package | Joseph | L7 tasks | ⛔ Blocked | Submitted on Canvas |
| L7-W | Syllabus homework: "Justify serverless component" (500 words) | Joseph | L7 tasks | ❓ Confirm | Submitted, if required |

**Evidence to expect** (confirm against the handout): the function's code; console screenshots of the function and its trigger;
an invocation with its CloudWatch log; the scheduled/event-driven flow firing; a call working on a throttled network.

## Phase 5: Week 8 / Lab 8 (not released yet)

The syllabus says Week 8 is the **midterm**, a **project design milestone (1,000-word report)** and a **peer review of
another team's design (200 words)**. If a "Lab 8" handout appears, it replaces this section.

| ID | Task | Owner | Blocked by | Status | Done when |
|---|---|---|---|---|---|
| L8-0 | Read the Week 8 / Lab 8 handout; add its tasks and deliverables here | Joseph | Release | ⛔ Blocked | This section rewritten |
| L8-M | Project design milestone (1,000 words): each owner writes their section, Joseph edits | Joseph (editor) | L6-R | ❓ Confirm | Submitted |
| L8-P | Peer review of another team's design (200 words) | Everyone | Week 8 session | ❓ Confirm | Submitted |
| L8-X | Midterm revision: each person walks the others through their `learnings/` notes | Everyone | — | 🟢 Ready | One session held |

Week 9 (CI/CD + incident response) gets its own phase when released.

## Phase 6: Prosit 2 final package

The final report reuses every lab's evidence and report text. Nothing new should need to be screenshotted at the end.

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
