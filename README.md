# HealthConnect Ghana — Group 3 (Highlanders)

**Course:** ICS 534 Cloud Computing | **Milestone:** PROSIT 2
**Team:** Joseph Etse · Eugene Sewor · Elise Kennedy-Angbo · Perfect Avugla
**Plan:** [`PLAN.md`](./PLAN.md): roles, scope, and every task in order with its owner and blockers. This repo is the single source of truth.

HealthConnect Ghana is a cloud platform that helps Community Health Volunteers (CHVs) in rural Ghana
record patients and vital signs offline, and later connect those patients to specialists.
This repository is **separate from AgroConnect** (Prosit 1, [`cc-group-3-prosit-1`](https://github.com/ASU-MICS-2028/cc-group-3-prosit-1)).
We reuse its *patterns* (Terraform modules, offline PWA, API style), not its code.

---

## ⚠️ The one rule: explain everything, plainly

**Each of us owns a part, and the rest of the team will not touch that part. They will rely
entirely on what you write about it.** So for anything you work on, you MUST explain it as
bluntly and simply as possible:

- Write for a teammate who has never opened your folder and has no time to.
- Say **what you did**, **why**, **how to check it works** (exact commands), **what is not done**, and **what will bite us**.
- No unexplained jargon. If you use a term like "NAT", "FHIR" or "least privilege", say what it means in one line.
- Put it in a learnings note: copy [`learnings/TEMPLATE.md`](./learnings/TEMPLATE.md) to `learnings/<area>.md`.
- **A PR is not finished until its learnings note is updated.** Reviewers should reject PRs that leave the team guessing.

If a teammate has to ask you how your part works, the note was not simple enough. Fix the note, not just the answer.

---

## Pending now

**The full ordered task list, with blockers, is in [`PLAN.md`](./PLAN.md).** This table shows only
what can be worked on **right now** (nothing blocking it) or is in progress.
**Whenever you change a task in PLAN.md, update this table in the same PR.**

_Last updated: 2026-10-21_

| Owner | Task (ID in PLAN.md) | Status | Unblocks |
|---|---|---|---|
| Joseph | S3 Ask the facilitator the open questions | 🟢 Ready | L5-D, F1 |
| Joseph | L5-C2 Data residency: law per country | 🟢 Ready | L5-C3 |
| Joseph | L7-A2 The two Lambda function handlers (Lab 7) | 🟢 Ready | L7-A5 |
| Eugene | S4 Copy Terraform modules into `infra/` | 🟢 Ready | S5, L5-A → most of Labs 5 and 6 |
| Eugene | S6 Cost tracker + budget alarm | 🟢 Ready | — |
| Eugene | S7 Rotate the Prosit 1 Lab 4 DB password | 🟢 Ready | — |
| Elise | S8 Shared vocabulary | 🟢 Ready | — |
| Elise | L5-C1 Data residency: sharding design | 🟢 Ready | L5-C3 |
| Elise | L6-C1 FHIR-aligned schema migrations | 🟢 Ready | L6-C2, L6-D1, L6-H3, L7-A3 → most of Lab 7 A/B |
| Perfect | S9 Fork the PWA into `frontend/` | 🟢 Ready | L5-R2, L5-H2 |
| Perfect | L5-R1 Consolidated architecture diagram (draft) | 🟢 Ready | L5-R4, L8-A1 |
| Perfect | L7-C1 WebRTC signaling server + client over HTTPS (Lab 7) | 🟢 Ready | L7-C2 → C3, C4 |
| Everyone | L5-R3 One retrospective sentence each · L6-H4 Lambda reading · L8-X walk each other through your learnings notes (midterm prep) | 🟢 Ready | L5-R4 |

**Lab submissions:** each lab is evidence (screenshots + outputs) + a ~300-word report. What to capture, file by file and by whom, is in each lab's **Deliverables checklist** in [`PLAN.md`](./PLAN.md). Capture it while you do the task.

**Critical path:** S4 → L5-A → L5-B1 → L5-B2 → most of Lab 6. Eugene's S4 unblocks the most work, so it goes first.

---

## Repository layout

Folders are created when their first real content lands.

| Path | What goes here | Owner |
|---|---|---|
| `PLAN.md` | **The ordered task list:** owner, blockers and status of every task | Joseph (everyone updates their own rows) |
| `infra/` | Terraform for AWS `af-south-1`: VPC, ALB, ASG, RDS, S3, IAM, KMS | Eugene |
| `backend/` | `patient-record-service`: Node/TypeScript API, audit logging | Joseph |
| `db/migrations/` | SQL schema (FHIR-aligned) | Elise |
| `frontend/` | CHV offline PWA (forked from the AgroConnect PWA) | Perfect |
| `docs/` | Formal documentation and **decisions** ([`decisions.md`](./docs/decisions.md)): FHIR mapping, data residency, AI disclosure | Joseph (editor) |
| `learnings/` | **What each of us did and learned**, in plain words, so nobody has to redo it to understand it ([how](./learnings/README.md)) | Each owner |
| `knowledge/` | **Project context** for teammates and coding assistants: the brief, the labs, Prosit 1, where materials live, summarised work sessions ([start here](./knowledge/README.md)) | Everyone |
| `AGENTS.md` / `CLAUDE.md` | Instructions for coding assistants (any tool) working in this repo | Joseph |
| `evidence/labN/` | Lab evidence: terminal outputs and screenshots ([conventions](./evidence/README.md)) | Whoever ran it |

---

## Ground rules

- **Synthetic data only.** No real patient information goes anywhere.
- **No secrets in the repo or in Drive.** Use AWS Secrets Manager and instance roles.
- **Every resource you create goes into the cost tracker the same day.**
- **AI use is declared** in [`docs/ai-tools-usage.md`](./docs/ai-tools-usage.md).

How to contribute (branches, PRs, reviews): [`CONTRIBUTING.md`](./CONTRIBUTING.md).
