# Plan

**The plan we all follow:** who leads what, what we build, and every task in the order it happens,
with one owner, the tasks that block it, and a status. This file is the source of truth for
**who does what next**. Decisions behind it are in [`docs/decisions.md`](./docs/decisions.md).

## How to use this file

- **Pick up** a task only when everything in "Blocked by" is ✅ Done. Set it to 🔄 In progress, with your name.
- **Finish** a task: set it to ✅ Done, then check which tasks it was blocking and flip them from ⛔ Blocked to 🟢 Ready.
- **In the same PR, update [`README.md`](./README.md)**, which lists **everything open now** and who has it (D-025): add new open items, remove finished ones.
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
| Telemedicine: appointments, event-driven reminders, a WebRTC video-call proof of concept | **Build** (Lab 7) |
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
| S4 | Copy Terraform modules into `infra/`: new state key, VPC `10.30.0.0/16`, `Project=healthconnect` tags, `terraform validate` in CI | Eugene | — | ✅ Done | Applied to `af-south-1` on 22 Oct (PR #6); `terraform validate` in CI |
| S5 | HealthConnect subdomain + ACM certificate | Eugene | S4 | ✅ Done (2026-10-23, D-022: `api-hc` + `call-hc.agroconnect.space`, TLS 1.3, HTTP→HTTPS 301) | Certificate issued |
| S6 | Prosit 2 cost tracker (Resource Inventory + Weekly Log) + budget alarm | Eugene | — | 🔄 In progress (budget alarm applied) | Alarm email confirmed |
| S7 | Rotate the Prosit 1 Lab 4 DB password (or delete that database) | Eugene | — | ✅ Done | Moot: the Lab 4 database no longer exists (checked 22 Oct) |
| S8 | Shared vocabulary in `knowledge/`: user roles (CHV, nurse, specialist, GHS official, admin) and data resources (Patient, Observation, Consent, AuditEvent) | Elise | — | 🟢 Ready | Merged |
| S9 | Fork the AgroConnect PWA into `frontend/` as the CHV app shell | Perfect | — | 🟢 Ready (`frontend/` not created yet; the Lab 5 offline evidence came from the AgroConnect PWA) | Builds and runs offline locally |
| S10 | Scaffold `patient-record-service` in `backend/`: Express/TypeScript, `/health` (returns instance id), `/ready` (checks DB), Dockerfile | Joseph | — | ✅ Done | Container runs locally ([learnings](./learnings/patient-record-service.md)) |
| S11 | Agent files for every assistant (`AGENTS.md` root + per area, `CLAUDE.md`), CI for API and schema tests, PR template, README = current stage only, ADR index | Joseph | — | ✅ Done | Tested from root, `backend/`, `db/`, `infra/` ([learnings](./learnings/repo-and-tooling.md)) |
| S12 | Migration safety: `db/migrate.sh` with a `schema_migrations` logbook; `run_tests.sh` refuses RDS through a tunnel too | Elise | — | ✅ Done (RDS baselined 26 Oct by Eugene: `schema_migrations` holds 001–003, dry run says 0 to apply) | Every case tested locally ([learnings](./learnings/database.md)); CI runs it |

## Phase 1: Lab 5 (on HealthConnect) ✅ submitted 22 Oct

| ID | Task | Owner | Blocked by | Status | Done when |
|---|---|---|---|---|---|
| L5-A | VPC applied (2 public, 2 private-app, 2 private-data subnets, 2 AZs, IGW, fck-nat) + route-table proof | Eugene | S4 | ✅ Done (submitted 22 Oct) | `evidence/lab5/outputs_A_routes.txt` + VPC screenshot |
| L5-B1 | RDS in data subnets, not public, port 5432 open only to the app security group | Eugene | L5-A | ✅ Done (submitted 22 Oct) | Console screenshot; connection from outside fails |
| L5-B2 | 2 instances of the service behind the ALB; failover demo (stop one, 10/10 requests still succeed) | Eugene | L5-B1, S10 | ✅ Done (submitted 22 Oct) | Target-health screenshots + both script outputs |
| L5-C1 | Data residency: sharding design + diagram (country key, one DB per country, only anonymised aggregates cross borders) | Elise | — | ✅ Done (covered by Joseph, submitted 22 Oct) | Draft in `docs/data-residency.md` |
| L5-C2 | Data residency: law per country (Ghana Act 843 + Kenya or Nigeria), one concrete control each, "needs legal review" list | Joseph | — | ✅ Done (submitted 22 Oct) | Section added to `docs/data-residency.md`, clauses verified |
| L5-C3 | One-page residency PDF | Elise | L5-C1, L5-C2 | ✅ Done (covered by Joseph, submitted 22 Oct) | PDF in `evidence/lab5/` |
| L5-D | AgroConnect decommissioning: everything was destroyed with `terraform destroy` on 2026-10-15 (74 resources, no DB snapshot); write the checklist note and log the spend | Eugene (Joseph reviews) | — | ✅ Done (submitted 22 Oct) | Checklist + spend figure in `evidence/lab5/` |
| L5-R1 | Consolidated architecture diagram (client → ALB → app → data → external APIs, subnet boundaries marked) | Perfect | — (finalise after L5-B2) | ✅ Done (covered by Joseph, submitted 22 Oct) | PNG + draw.io in `docs/` |
| L5-R2 | PWA offline demo evidence (screenshots or short recording) | Perfect | S9 | ✅ Done (covered by Joseph, submitted 22 Oct) | Files in `evidence/lab5/` |
| L5-R3 | AgroConnect retrospective: one honest sentence each | Everyone | — | ✅ Done (covered by Joseph, submitted 22 Oct) | Sentences in the "Lab 5" Google Doc tabs |
| L5-R4 | Lab 5 report (300 words) + package PDF | Joseph | L5-A, L5-B2, L5-C3, L5-D, L5-R1, L5-R2, L5-R3 | ✅ Done (submitted 22 Oct) | Submitted on Canvas |
| L5-H1 | Homework: egress audit + NAT cost comparison | Eugene | L5-B2 | ⚪ Skipped | Note in `learnings/` |
| L5-H2 | Homework: CDN page-load before/after on Slow 3G | Perfect | S9 | ⚪ Skipped | Numbers in the report |
| L5-H3 | Homework: second-country DB + one query that would need federation | Elise | L5-B1 | ⚪ Skipped | Query + note in `learnings/` |
| L5-W | Syllabus homework: "Propose network architecture" (500 words) | Eugene | L5-B2 | ❓ Confirm | Submitted, if required |

### Lab 5 deliverables checklist

**Submitted 22 Oct** (`evidence/lab5/CC GROUP 3 Highlanders Lab 5 Report.pdf`). One PDF (300-word report + retrospective + diagram + all screenshots below, with links) on Canvas. Due: "before the Week 6 lecture" per the handout; real date via S3.

| ✓ | What the lab asks for | Evidence file (`evidence/lab5/`) | From task | Who captures it |
|---|---|---|---|---|
| ✅ | **A.** VPC with at least 2 subnets (console resource map) | `A-vpc-resource-map.png` | L5-A | Eugene |
| ✅ | **A.** Route tables: public subnet → internet gateway; data subnet has **no** internet gateway route | `outputs_A_routes.txt` + `A-route-tables.png` | L5-A | Eugene |
| ✅ | **B.** Database in the private subnet: "Publicly accessible: No", data subnets, security group | `B-rds-private.png` | L5-B1 | Eugene |
| ✅ | **B.** Load balancer target health: **both instances healthy** | `B-targets-both-healthy.png` | L5-B2 | Eugene |
| ✅ | **B.** `test_load_balancer.sh` output **before** stopping an instance (both instance ids appear) | `outputs_B_lb_before.txt` | L5-B2 | Eugene |
| ✅ | **B.** Target health after stopping one: **one unhealthy/removed** | `B-targets-after-failover.png` | L5-B2 | Eugene |
| ✅ | **B.** `test_load_balancer.sh` output **after**: 10/10 succeed on the survivor | `outputs_B_lb_after.txt` | L5-B2 | Eugene |
| ✅ | **C.** One-page data residency design (diagram + text) | `lab5-data-residency.pdf` | L5-C3 | Elise |
| ✅ | **D.** Decommissioning checklist: what's still running for AgroConnect and why | `D-decommissioning.md` + `D-resource-inventory.png` | L5-D | Eugene |
| ✅ | **D.** Month-to-date spend (billing console or cost tracker) | `D-spend.png` | L5-D | Eugene |
| ✅ | **Package:** consolidated architecture diagram, public/private boundaries marked | `docs/architecture.png` | L5-R1 | Perfect |
| ✅ | **Package:** working PWA, including the offline demo (airplane mode) | `R-pwa-online.png`, `R-pwa-offline.png` | L5-R2 | Perfect |
| ✅ | **Package:** container registry (ECR repository with the image) | `R-ecr.png` | L5-B2 | Eugene |
| ✅ | **Package:** running load-balanced service (`curl https://…/health`) | covered by `outputs_B_lb_*.txt` | L5-B2 | Eugene |
| ✅ | **Report:** 300 words on the network setup and what changed from Prosit 1 | Lab 5 Google Doc → PDF | L5-R4 | Joseph |
| ✅ | **Report:** one honest retrospective paragraph | Lab 5 Google Doc | L5-R3 → L5-R4 | Everyone → Joseph |
| ⚪ skipped | *Optional:* CDN page-load before/after on Slow 3G, egress audit, NAT cost note | `H-cdn.png`, `learnings/` | L5-H1/H2/H3 | Eugene, Perfect, Elise |

## Phase 2: Lab 6 ✅ report drafted 25 Oct (run in a separate lab environment, see the report §2)

| ID | Task | Owner | Blocked by | Status | Done when |
|---|---|---|---|---|---|
| L6-C1 | FHIR-aligned schema migrations: UUID ids, LOINC code + UCUM unit on observations, consent required before writes, append-only `access_log` | Elise | — | ✅ Done | `db/migrations/*.sql` applies cleanly to an empty Postgres (`db/tests/run_tests.sh`: 25 deny, 14 allow, 0 problems) |
| L6-C2 | FHIR mapping + gaps + data minimisation (one justification per `patients` column under Act 843) | Elise | L6-C1 | ✅ Done (D-018 still needs the team vote) | `docs/fhir-mapping.md` |
| L6-A1 | `healthconnect-service` IAM role + least-privilege policy (only its own secret, bucket, logs, ECR) | Eugene | L5-B1 | ✅ Done in the lab environment (Eugene, 25 Oct) | `evidence/lab6/iam-policy.json` + Figures 1–5 of the report |
| L6-A2 | Run allow/deny checks (allowed: our secret; denied: delete DB, AgroConnect's secret) + "what it protects against" paragraph | Eugene (covered for Perfect) | L6-A1 | ✅ Done in the lab environment (Eugene, 25 Oct) | Allow (`SELECT 1`) and deny (`DeleteDBCluster`) in Figure 5 |
| L6-B1 | Encryption build: customer-managed KMS key, S3 policy denying non-HTTPS, HSTS header, `rds.force_ssl` on | Eugene | L5-B1, S5 | ✅ Done in the lab environment (Eugene, 25 Oct); the HealthConnect build is L6-B1b | Figures 6–12 |
| L6-B2 | Encryption verification evidence: RDS at rest, DB connection uses SSL, HTTP→HTTPS redirect, S3 encrypted + not public | Eugene (covered for Elise) | L6-B1 | ✅ Done in the lab environment (Eugene, 25 Oct) | Figures 6–12 |
| L6-D1 | Audit logging in the service: identity from the session (not a header), data + audit write in one transaction, 404 still logged, denied attempts logged | Joseph | S10, L6-C1 | ✅ Done (25 Oct): audited reads and writes in the API | 34 API tests pass ([learnings](./learnings/patient-record-service.md)) |
| L6-D2 | Deploy the service and capture audit evidence (POST as a CHV, GET as a doctor, last 5 log rows, failed DELETE on the log) | Joseph | L6-D1, L5-B2 | ✅ Done in the lab environment (Eugene, 25 Oct) with the handout middleware | Figures 14–15 |
| L6-X | Find out why about half the requests failed during the Lab 5 failover test (timeouts and 504s even 30 s after the stopped target left rotation; cross-zone load balancing is on). Check deregistration and stopped-vs-unhealthy behaviour, then re-test | Eugene | — | 🟢 Ready | Cause explained in `learnings/infra.md`; a re-run with 10/10 succeeding |
| L6-A1b | HealthConnect system: the API's **own** IAM role in Terraform (today it shares the NAT server's role and has broad ECR read) | Eugene | — | ✅ Done (26 Oct: NAT has its own SSM-only role; API pulls only its own image; 10/10 simulator checks + fresh servers healthy, `evidence/lab6/outputs_A1b_least_privilege.txt`) | `terraform plan` shows only the new role; API still healthy |
| L6-B1b | HealthConnect system: customer-managed KMS key, `rds.force_ssl = 1`, bucket policy denying non-HTTPS (HSTS already sent) | Eugene | — | 🟢 Ready | Applied; checks in `learnings/infra.md` |
| L6-R | Lab 6 report (300 words) + package (PDF, policy, schema, screenshots) | Joseph | — | ✅ Submitted | `prosit 2/Labs/lab6/CC GROUP 3 Highlanders Lab 6 Report.pdf` |
| L6-H1 | Homework: FHIR managed-service sandbox + 150-word comparison (check whether it exists in `af-south-1`) | Eugene | — | ⚪ Optional | Note in `learnings/` |
| L6-H2 | Homework: secrets rotation drill, timed | Eugene + Joseph | L6-D2 | ⚪ Optional | Time recorded in `learnings/` |
| L6-H3 | Homework: RBAC table (CHV / specialist / GHS official × patients / observations / access_log) | Elise | L6-C1 | ⚪ Optional (unblocked) | Table in `docs/` |
| L6-H4 | Read the Lambda "Getting Started" docs | Everyone | — | 🟢 Ready | — |
| L6-W | Syllabus homework: "Develop a security plan" (500 words) | Perfect | L6-A2 | ❓ Confirm | Submitted, if required |

### Lab 6 deliverables checklist

**Submit:** PDF report + IAM policy file + schema file + screenshots from Parts A–D, on Canvas. **Due: 25 October.**

| ✓ | What the lab asks for | Evidence file (`evidence/lab6/`) | From task | Who captures it |
|---|---|---|---|---|
| ✅ | **A.** The least-privilege policy document | `A-policy.json` (copy of the one in `infra/`) | L6-A1 | Eugene |
| ✅ | **A.** Role attached to the service (instance profile on the EC2 instances, not embedded keys) | `A-role-attached.png` | L6-A1 | Eugene |
| ✅ | **A.** An **allowed** action succeeding (reading our own secret) | `outputs_A_least_privilege.txt` + `A-allowed.png` | L6-A2 | Perfect |
| ✅ | **A.** A **forbidden** action denied (`AccessDenied` deleting the DB, reading AgroConnect's secret) | same output file + `A-denied.png` | L6-A2 | Perfect |
| ✅ | **B.** Database encryption at rest **enabled** (console, with the KMS key) | `B-rds-encryption.png` | L6-B2 | Elise |
| ✅ | **B.** Bucket encryption + public access block (`get-bucket-encryption`, `get-public-access-block`) | `outputs_B_s3.txt` | L6-B2 | Elise |
| ✅ | **B.** Plaintext HTTP rejected or redirected (`curl -v http://…` → 301), HTTPS works (`curl -v https://…` → 200) | `outputs_B_tls.txt` | L6-B2 | Elise |
| ☐ not done | **B.** *Extra:* DB connection is encrypted (`SHOW rds.force_ssl`, `pg_stat_ssl`) | `outputs_B_db_ssl.txt` | L6-B2 | Elise |
| ✅ | **C.** The schema file | `db/migrations/*.sql` | L6-C1 | Elise |
| ✅ | **C.** FHIR mapping write-up + gaps + data minimisation (Act 843) | `docs/fhir-mapping.md` | L6-C2 | Elise |
| ✅ | **D.** Query result showing populated audit-log entries (a write by a CHV, a read by a doctor) | `outputs_D_audit.txt` + `D-audit-log.png` | L6-D2 | Joseph |
| ✅ | **D.** *Extra:* deleting from the audit log is refused | `outputs_D_append_only.txt` | L6-D2 | Joseph |
| ✅ | **Report:** 300 words: IAM and what it protects against · encryption · FHIR decisions and gaps · one ethics/consent point naming the Act 843 principle | Lab 6 Google Doc → PDF | L6-R | Joseph (paragraphs from Perfect, Elise) |
| ⚪ skipped | *Optional:* FHIR sandbox comparison (150 words), rotation-drill time, RBAC table | `learnings/`, `docs/` | L6-H1/H2/H3 | Eugene, Eugene + Joseph, Elise |

## Phase 3: Lab 7: serverless reminders + a telemedicine video call

Two halves that don't depend on each other: **A/B** (Joseph, Eugene, Elise) and **C** (Perfect). Neither needs the Lab 5/6
AWS setup to be finished: the service can run locally and publish to AWS, as the handout's own example does.
Design for A/B is decision D-010 (one SNS topic fanning out to two SQS queues).

| ID | Task | Owner | Blocked by | Status | Done when |
|---|---|---|---|---|---|
| L7-A1 | Infra: SNS topic `appointment-events` → 2 SQS queues (`reminders`, `specialist-notify`), each with a dead-letter queue; 2 Lambda functions with their own scoped roles, each triggered by its queue; the service role may only `sns:Publish` to that topic | Eugene | S4 | ✅ Done (2026-10-26; `infra/modules/events`, D-010; checked: `evidence/lab7/outputs_A1_event_infra.txt`) | `terraform apply` done; the trigger shows on each function in the console |
| L7-A2 | The two function handlers (Python, as in the handout): reminder (logs "reminder for <phone> at <time>"; real SMS through the Prosit 1 provider is optional) and specialist-notify; both log the `appointmentId` | Joseph | — | ✅ Done (25 Oct) | 10 tests pass (`functions/`); handler names in the learnings note |
| L7-A3 | `appointments` table migration (UUID id, patient, specialist, `starts_at`/`ends_at`, status) | Elise | L6-C1 | ✅ Done | In `db/migrations/001_initial_schema.sql`; Postgres blocks double-booking (D-017) |
| L7-A4 | `POST /appointments` in `patient-record-service`: save the appointment (UUID id, `starts_at`; a double-booking clash → 409, per D-017), then publish `appointment.created` to the topic | Joseph | S10, L7-A3 | ✅ Done (25 Oct) | 201/200/409/404/403/401/400 all tested |
| L7-A5 | End-to-end run: create one appointment → **both** functions fire from that one event; capture evidence A and B | Joseph | L7-A1, L7-A2, L7-A4 | 🔄 Live bookings done 26 Oct: 7 paths on the real API (201 ×2, retry 200, double-booking 409, unknown patient 404, bad date 400, no token 401) in `evidence/lab7/outputs_A_create_appointment.txt`. Waiting on Eugene's log screenshots for the two appointment ids | Checklist rows A and B ticked |
| L7-C1 | Signaling server + browser client from the handout's starter code, served over **HTTPS/WSS** (phones only allow the camera on secure pages), e.g. through a Cloudflare tunnel or our domain | Perfect | — | ✅ Done (26 Oct): calls work over HTTPS on the hosted page | Opens on a phone; camera works. Code in `webrtc-spike/` (TypeScript + React) builds and passes tests. **Hosted at `https://call-hc.agroconnect.space`** (D-023, Eugene; signaling checked: `evidence/lab7/outputs_C_signaling_hosted.txt`); phone + camera test still to do ([learnings](./learnings/lab7-webrtc.md)) |
| L7-C2 | Call on the **same network**: both video feeds connect | Perfect + one teammate | L7-C1 | ✅ Done (26 Oct, Joseph): laptop ↔ phone on one Wi-Fi | `evidence/lab7/C2-same-network-*-stats.png` |
| L7-C3 | Call across **two different networks** (campus Wi-Fi vs a phone hotspot); record whether it connected directly or needed a relay (TURN), from `chrome://webrtc-internals` | Perfect + one teammate | L7-C2 | ✅ Done (26 Oct, Joseph + Eugene): Oyibi ↔ Ho, direct (srflx), no relay | `evidence/lab7/C3-cross-network-*-stats.png` |
| L7-C4 | Real call stats (packet loss, jitter, round-trip time) on the same network vs Slow 3G throttling, with the numbers written down | Perfect (done by Joseph + Elise) | — | ✅ Done (26 Oct): baseline vs throttled (macOS dummynet, ~3G) | `evidence/lab7/C4-*-stats.png`, `outputs_C4_throttle_check.txt` |
| L7-R | Lab 7 report (300 words) + package (PDF + code snippets + screenshots A–C) | Joseph (paragraphs: serverless fit, Eugene; WebRTC and TURN, Perfect; resilience question, Elise) | L7-A5, L7-C3, L7-C4 | ⛔ Blocked (all three paragraphs ✅: serverless fit in `learnings/infra.md` §8, TURN, resilience; waiting on the screenshots `A-event-published.png`, `B-both-functions.png`, `H-dlq.png`) | Submitted on Canvas **before the Week 8 exam** |
| L7-H1 | Homework: break the reminder function on a bad message; show it landing in the dead-letter queue | Eugene | L7-A5 | 🔄 Evidence captured (bad event: 3 tries, then 1 message in each DLQ; `evidence/lab7/outputs_A1_event_infra.txt`); DLQ console screenshot to do | DLQ config + screenshot |
| L7-H2 | Homework: publish the same event twice; make the reminder send only once (idempotency check) | Elise | — | 🔄 In progress (29 Oct: code, tests and Terraform done, D-027; waiting for Eugene to apply, then the "after" logs. "Before": Abena's booking `4f530cae…` was sent twice on 26 Oct) | Before/after logs + learnings note |
| L7-H3 | Homework: TURN relay cost for 50 calls a day × 15 minutes (managed service vs self-hosted coturn) | Perfect | L7-C3 | 🔄 Drafted (Perfect): worst case 337 GB a month; Cloudflare about $0, Twilio about $135; self-hosted total needs the AWS Cape Town egress rate | Number + sources in `learnings/`; reused in Week 11 |
| L7-W | Syllabus homework: "Justify serverless component" (500 words) | Joseph | L7-A5 | ❓ Confirm | Submitted, if required |

### Lab 7 deliverables checklist

**Submit:** PDF report + code snippets + screenshots/recording from Parts A–C, on Canvas, before the Week 8 exam.

| ✓ | What the lab asks for | Evidence file (`evidence/lab7/`) | From task | Who captures it |
|---|---|---|---|---|
| ✅ | **A.** Appointment created (the `curl` and its 201 response) | `outputs_A_create_appointment.txt` + `A-create-appointment.png` | L7-A5 | Joseph |
| ☐ | **A.** Event published (service log line, or SNS "messages published" metric) | `A-event-published.png` | L7-A5 | Joseph |
| ✅ | **A.** Reminder function triggered and the reminder logged/sent (CloudWatch log) | `A-reminder-logs.png` + `outputs_A_reminder_logs.txt` | L7-A5 | Joseph |
| ☐ | **B.** **Both** functions fired from the same single event (same `appointmentId` in both log groups) | `B-both-functions.png` + `outputs_B_logs.txt` | L7-A5 | Joseph |
| ✅ | **C1.** Call connected on the same network, both video feeds visible | `C1-same-network.png` | L7-C2 | Perfect |
| ✅ | **C2.** Connection state across two different networks (direct, or relay needed) | `C2-cross-network.png` | L7-C3 | Perfect |
| ✅ | **C3.** Real stats (packet loss, jitter, round-trip time) from the Slow 3G test, plus the same-network baseline | `C3-stats-slow3g.png`, `C3-stats-baseline.png` | L7-C4 | Perfect |
| ✅ | **C.** Written notes on what happened across networks and under throttling, **quoting the numbers** | `learnings/lab7-webrtc.md` | L7-C3, L7-C4 | Perfect |
| ☐ | **Code snippets:** the endpoint, both functions, the signaling server, the client | links to files in the repo | L7-A2, L7-A4, L7-C1 | Joseph, Perfect |
| ☐ | **Report:** what we moved to serverless and one thing we deliberately didn't (and why) · the cross-network result and what TURN means for architecture and budget · one open resilience question | Lab 7 Google Doc → PDF | L7-R | Joseph |
| ☐ | *Optional:* dead-letter queue screenshot, duplicate-event test, TURN cost figure | `H-dlq.png`, `learnings/` | L7-H1/H2/H3 | Eugene, Elise, Perfect |

**Rubric:** event flow end-to-end with 2 independent consumers 35% · WebRTC call established and tested under throttling 35% · report reasoning about serverless fit and network reality 30%.

## Phase 4: Lab 8: peer review + midterm preparation

No new code. In class, we present HealthConnect to a partner team and answer four set questions, review their design, then
revise our diagram. **60% of the grade is live:** the questions we ask (30%) and how well we answer theirs (30%). Everyone must be
able to explain every part, which is what the `learnings/` notes are for.

| ID | Task | Owner | Blocked by | Status | Done when |
|---|---|---|---|---|---|
| L8-A1 | Current HealthConnect architecture diagram (client → API → data → security layer → event/serverless layer), plus the AgroConnect diagram from Lab 5, ready to show | Perfect | L5-R1 | ✅ Done (27 Oct): built from the Terraform as applied; dashed boxes = not built (PWA, TURN) | `docs/architecture-healthconnect.png` + draw.io file |
| L8-A2 | 5-minute walkthrough script: the diagram, one decision we're proud of, one known weakness | Joseph | L8-A1 | 🟢 Ready | Script in `docs/peer-review.md`; rehearsed once |
| L8-A3 | Our answers to the four questions, each lead for their area: where it breaks at 10× load · the weakest security link · what happens if the network drops mid-consultation or the DB is unreachable · likely open questions | Everyone (Joseph collates) | L8-A1 | 🟢 Ready | Answers in `docs/peer-review.md` |
| L8-B1 | In class: present, answer, then review the partner team with the same four questions; everyone takes notes | Everyone | Lab 8 session | ⛔ Blocked | Notes in `docs/peer-review.md` |
| L8-B2 | Round 3 revision: the "before" diagram with the gap circled, and the "after" diagram with the change highlighted and a one-line caption | Perfect | L8-B1 | ⛔ Blocked | Screenshots B1 and B2 |
| L8-B3 | Written peer review of the partner team (200 words): one strength, one risk (using the four questions), one question for their final grading; names the team reviewed | Elise (from everyone's notes) | L8-B1 | ⛔ Blocked | PDF submitted by the end of Week 8 |
| L8-C | Pre-midterm resource audit (`pre_midterm_audit.sh` across AWS + the two other accounts), clean up anything forgotten, after checking with the team | Eugene | — | ⚪ Optional | Output + one-line note |
| L8-X | Midterm prep: each person walks the others through their `learnings/` notes (teach-back); practice scenarios from the Week 8 lecture | Everyone | — | 🟢 Ready | One session held |
| L8-M | Syllabus: project design milestone (1,000 words) | Joseph (editor) | L8-B2 | ❓ Confirm | Submitted, if required |

### Lab 8 deliverables checklist

**Submit:** one PDF per team, naming the team we reviewed: the 200-word written review + screenshots B1/B2, by the end of Week 8.

| ✓ | What the lab asks for | Evidence file (`evidence/lab8/`) | From task | Who captures it |
|---|---|---|---|---|
| ☐ | **B1.** "Before" architecture diagram (as presented), with the gap from review circled or annotated | `B1-before.png` | L8-B2 | Perfect |
| ☐ | **B2.** "After" diagram, change highlighted, one-sentence caption on what changed and why | `B2-after.png` | L8-B2 | Perfect |
| ☐ | **Written peer review:** 200 words, specific, cites their actual design | `lab8-peer-review.pdf` | L8-B3 | Elise |
| ☐ | *Optional:* audit script output + one-line cleanup note | `outputs_C_audit.txt` | L8-C | Eugene |

**Rubric:** quality of our live questions 30% · quality of our answers 30% · written feedback 30% · real revision based on feedback 10%.

After the midterm, **Week 9 (CI/CD) completes Prosit 2**. It gets its own phase when its handout is released.

## Phase 5: Prosit 2 final package

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
