# HealthConnect Ghana — Group 3 (Highlanders)

ICS 534 Cloud Computing · PROSIT 2 · Joseph Etse · Eugene Sewor · Elise Kennedy-Angbo · Perfect Avugla

## The app

![Three HealthConnect phone screens: asking a patient's permission, recording vitals offline, and a patient record that flags a high blood pressure reading](docs/app-screens.png)

Three screens from the community health volunteer's visit to a patient, in order: **ask permission first**, then
**record vitals** (this works with no signal and syncs later), then the patient's record, which **flags a reading for a
clinician to check**. People and readings are made up; screens from 5 November.

These are three of about 60 screens. HealthConnect is one installable web app (PWA) with eight roles, and each person
sees only their own role's screens after signing in:

| Role | What they do in the app | State |
|---|---|---|
| **Community health volunteer** | Register patients, record permission and vitals offline, sync when there's signal, book visits, join video visits, refer, raise an emergency, surveys, mothers and babies, learning | Working with live data: patients, permission, vitals, sync, booking, video visits, photos. The rest are previews |
| **Patient** | Their visits, video visits, their permissions, paying the fee, health insurance, learning | Video visits work; the rest are previews |
| **Clinician** | Today's patients, patient records, shared images, video visits, referrals and emergencies, prescribing | Video visits work; prescribing is in review (#57) |
| **Pharmacist** | Verify a prescription, queue, stock | In review (#57) |
| **Traditional healer** | Their patients, remedies in use | Preview |
| **Ghana Health Service official** | Surveillance dashboard, disease map, outbreak alerts, policy and SDG 3 views | Surveillance, map and alerts work with synthetic data; policy and SDG views are previews |
| **Health centre admin** | Staff, stock, training, reports for their own facility | Preview |
| **Platform admin** | Users, roles, audit log, settings | In review (#59) |

"Preview" screens show sample rows and say so on the screen ("Test mode"); they are connected to the API task by task
(see the task tables below).

## Architecture

![HealthConnect Ghana AWS architecture: clients, CloudFront and S3 for the PWA, a two-zone VPC with the load balancer, API Auto Scaling group, call server and RDS PostgreSQL, and the SNS to SQS to Lambda event layer](docs/architecture-healthconnect.png)

What runs where, as deployed in `af-south-1`. To edit, open [`docs/architecture-healthconnect.drawio`](docs/architecture-healthconnect.drawio) in draw.io. Infrastructure details: [`infra/README.md`](infra/README.md).

## Try it live

| What | Link | Notes |
|---|---|---|
| **The app** (PWA) | https://app-hc.agroconnect.space | Open on a phone or laptop; "Add to home screen" installs it, and it keeps working offline |
| **Video call page** | https://call-hc.agroconnect.space | Open the same room link in two browsers; video goes directly between them |
| **API health** | https://api-hc.agroconnect.space/health · [`/ready`](https://api-hc.agroconnect.space/ready) | `/ready` also checks the database |

**Signing in:** one test account per role, all with synthetic data: `chv`, `patient`, `clinician`, `pharmacist`,
`healer`, `ghs` (surveillance dashboard), `facility_admin`, `platform_admin`. The password is not in this public repo;
the team shares it with the lecturer directly.

Everything runs in AWS `af-south-1` (Cape Town). No real patient data is stored anywhere.

## Everything to do now, and who does it

_Updated 9 Nov 2026 (RDS has migrations 001–007 and the surveillance demo data). **Final sprint: one week.** Midsem Thu 12 Nov. Freeze Tue 10 Nov, 23:59. Working deadline Fri 13 Nov (being confirmed). Full plan, with evidence file names: [`PLAN.md`](./PLAN.md#final-sprint-6-to-13-nov-one-week-to-finish-lab-8-and-prosit-2). Tier 1 comes before everything else._

### Joseph

| Task | Due | Tier | Status |
|---|---|---|---|
| X1 Ask the facilitator: final dates and format, Lab 8 session and partner team, Week 9 handout | Fri 6 | 1 | 🟢 Ready |
| L8-A2 Rehearse the walkthrough, timed; L8-A3 Eugene and Elise add their parts | Sun 8 | 1 | 🔄 In PR |
| FB-6 Prescriptions, fraud checks, pharmacist screen, image sharing | Mon 9 | 1 | 🔄 In PR #57 (migration 008) |
| SVC-4 Fee and premiums through votex365 test mode | Mon 9 | 2 | 🔄 In PR #58, after #57 (migration 009; votex365 secret still needs Terraform) |
| FB-9a Insurance, NHIS check (sandbox) | Tue 10 | 2 | 🔄 In PR #60, after #59 (migration 011) |
| FB-10a Platform admin, audit viewer, revenue view | Tue 10 | 3 | 🔄 In PR #59, after #58 |
| F1 Final report (outline Sun 8, finished Fri 13) | Fri 13 | 1 | 🔄 Draft in Drive, `prosit 2/Final/`; waiting on sections by Wed 11 |

### Eugene

| Task | Due | Tier | Status |
|---|---|---|---|
| D-035 Confirm or change "one API, not sixteen services" | Fri 6 | 1 | ✅ Confirmed 6 Nov (approved in #49) |
| E1 Run each merged migration on RDS, keep deploys working | Daily | 1 | 🔄 001–007 applied 9 Nov; 008, 009, 011 when #57, #58, #60 merge. Still to do: seed the test sign-ins |
| L6-B1b KMS key, `rds.force_ssl`, HTTPS-only bucket | Sat 7 | 1 | 🟢 Ready |
| L6-X Why the failover dropped requests; L8-C resource audit | Sun 8 | 1, 2 | 🟢 Ready |
| SVC-2 Media uploads to S3 | Mon 9 | 2 | 🟢 Ready |
| E2 Load test: 1,000 users, 50,000 records | Tue 10 | 1 | 🟢 Ready |
| E3 Uptime case: alarms, health checks, tested restore | Tue 10 | 1 | 🟢 Ready |
| FB-8 Education library, training, certificates | Tue 10 | 3 | 🟢 Ready |
| E4 Lab 9 / CI/CD evidence | Wed 11 | 1 | ⛔ Needs the handout (X1) |
| R-E Report section: architecture, cost, load test, TURN, platform choice | Wed 11 | 1 | 🟢 Ready |

### Elise

| Task | Due | Tier | Status |
|---|---|---|---|
| E-M part 2 (`010`, since 005 went to surveillance): surveys, pregnancies and children, courses, insurance, stock | Sat 7 | 2 | 🟢 Ready |
| S8 Shared vocabulary in `knowledge/` | Sat 7 | 2 | 🟢 Ready |
| FB-7b Surveys, maternal and child, decision support, forecasts | Tue 10 | 2 | 🟢 Ready |
| FB-9b Healers and supply chain | Tue 10 | 3 | 🟢 Ready |
| FB-10b SDG 3 dashboard, FHIR, DHIS2 and WHO exports | Tue 10 | 3 | 🟢 Ready |
| R-L Report section: FHIR, minimisation, HIPAA mapping, DHS data, community engagement | Wed 11 | 1 | 🟢 Ready |
| L8-B3 Written peer review, 200 words | End of Week 8 | 1 | ⛔ Needs the Lab 8 session |

### Perfect

| Task | Due | Tier | Status |
|---|---|---|---|
| P1 Phone checks on the live app; airplane-mode demo; tick the checklist | Sat 7 | 1 | 🟢 Ready |
| L8-A1 Update the diagram: the PWA box as built, before the session | Before the session | 1 | 🔄 Redrawn with AWS icons in #63; check it |
| P2 Point the app at real login and sync | Sun 8 | 1 | 🟢 Ready (J1, J2 live 9 Nov) |
| FB-5 Referrals, emergency button, auto-escalation | Mon 9 | 1 | 🟢 Ready (mock first) |
| FB-4b Recording with consent, QA list, fee screen | Tue 10 | 2 | 🟢 Ready |
| FB-10c Health centre admin, own facility only | Tue 10 | 3 | 🟢 Ready |
| FB-11 Languages, 200% text size | Tue 10 | 3 | 🟢 Ready |
| F2 Role screenshots, demo script, fallback recording, final deck with Joseph | Wed 11, Fri 13 | 1 | 🟢 Ready |
| R-P Report section: PWA, offline, WebRTC on 2G and 3G, accessibility | Wed 11 | 1 | 🟢 Ready |
| L8-B2 Before and after diagrams | Session day | 1 | ⛔ Needs the Lab 8 session |

### Everyone

| Task | Due | Status |
|---|---|---|
| L8-A3 Your answers in `docs/peer-review.md` | Sun 8 | 🟢 Ready |
| L8-B1 The Lab 8 session: present, answer, review, take notes | Session day | ⛔ Date from X1 |
| L8-X Teach-back sessions | Mon 9, Wed 11 | 🟢 Ready |
| F3 Peer assessment and AI sign-off | Fri 13 | ⛔ Needs F1 |

**Every day:** check in by 21:00 (done, next, stuck). Approve PRs within 3 hours. Save evidence as you go: [`evidence/final/`](./evidence/README.md#final-sprint-evidence). Progress: run `npm run progress` in `frontend/`, or see [`BUILD-CHECKLIST.md`](./BUILD-CHECKLIST.md).

---

Everything else: [`PLAN.md`](./PLAN.md) (all stages, done and to come) · [`CONTRIBUTING.md`](./CONTRIBUTING.md) (how we work, repo map) · [`AGENTS.md`](./AGENTS.md) (for coding assistants).
**This page lists only what's open now.** When a task changes state, update it here and in `PLAN.md` in the same PR; remove it from here once it's done.
