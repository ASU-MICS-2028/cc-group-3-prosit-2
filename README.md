# HealthConnect Ghana — Group 3 (Highlanders)

ICS 534 Cloud Computing · PROSIT 2 · Joseph Etse · Eugene Sewor · Elise Kennedy-Angbo · Perfect Avugla

## Everything to do now, and who does it

_Updated 6 Nov 2026. **Final sprint: one week.** Midsem Thu 12 Nov. Freeze Tue 10 Nov, 23:59. Working deadline Fri 13 Nov (being confirmed). Full plan, with evidence file names: [`PLAN.md`](./PLAN.md#final-sprint-6-to-13-nov-one-week-to-finish-lab-8-and-prosit-2). Tier 1 comes before everything else._

### Joseph

| Task | Due | Tier | Status |
|---|---|---|---|
| X1 Ask the facilitator: final dates and format, Lab 8 session and partner team, Week 9 handout | Fri 6 | 1 | 🟢 Ready |
| L7-R Submit the Lab 7 report if not yet in | Fri 6 | 1 | 🟢 Ready |
| J1 Login, eight roles in tokens, CORS for the app | Sat 7 | 1 | 🔄 In PR; live check needs 004 and 006 on RDS |
| J2 Real sync: upload, role-filtered download, 409 on double booking | Sat 7 | 1 | 🟢 Ready |
| L8-A2 Commit and rehearse the walkthrough; L8-A3 collate answers and our questions for the partner team | Sun 8 | 1 | 🟢 Ready |
| FB-6 Prescriptions, fraud checks, pharmacist screen, image sharing | Mon 9 | 1 | ⛔ Needs migration 004 |
| SVC-4 Fee and premiums through votex365 test mode | Mon 9 | 2 | 🟢 Ready |
| FB-9a Insurance, NHIS check (sandbox) | Tue 10 | 2 | ⛔ Needs migration 004 |
| FB-10a Platform admin, audit viewer, revenue view | Tue 10 | 3 | 🟢 Ready |
| F1 Final report (outline Sun 8, finished Fri 13) | Fri 13 | 1 | 🟢 Ready |

### Eugene

| Task | Due | Tier | Status |
|---|---|---|---|
| D-035 Confirm or change "one API, not sixteen services" | Fri 6 | 1 | ✅ Confirmed 6 Nov (approved in #49) |
| E1 Run migration 004 on RDS, keep deploys working, watch the first automatic PWA deploy | Sat 7, then daily | 1 | ⛔ Needs migration 004 |
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
| E-M part 1 (`004`): roles, patient logins, facilities, referrals, emergencies, prescriptions | Fri 6 | 1 | 🔄 In PR |
| E-M part 2 (`005`): surveys, pregnancies and children, courses, insurance, stock | Sat 7 | 2 | 🟢 Ready |
| S8 Shared vocabulary in `knowledge/` | Sat 7 | 2 | 🟢 Ready |
| FB-7a Surveillance: DHS-shaped synthetic cases, dashboard, map, outbreak rule, alert | Mon 9 | 1 | 🟢 Ready |
| FB-7b Surveys, maternal and child, decision support, forecasts | Tue 10 | 2 | 🟢 Ready |
| FB-9b Healers and supply chain | Tue 10 | 3 | 🟢 Ready |
| FB-10b SDG 3 dashboard, FHIR, DHIS2 and WHO exports | Tue 10 | 3 | 🟢 Ready |
| R-L Report section: FHIR, minimisation, HIPAA mapping, DHS data, community engagement | Wed 11 | 1 | 🟢 Ready |
| L8-B3 Written peer review, 200 words | End of Week 8 | 1 | ⛔ Needs the Lab 8 session |

### Perfect

| Task | Due | Tier | Status |
|---|---|---|---|
| P1 Phone checks on the live app; airplane-mode demo; tick the checklist | Sat 7 | 1 | 🟢 Ready |
| L8-A1 Update the diagram: the PWA box as built, before the session | Before the session | 1 | 🟢 Ready |
| P2 Point the app at real login and sync | Sun 8 | 1 | ⛔ Needs J1, J2 |
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
