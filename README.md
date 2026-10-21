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

**Find your name.** "Now" means you can start today; "Next" is what's coming, and what it's waiting on.
Task IDs link to the full detail in [`PLAN.md`](./PLAN.md): blockers, "done when", and each lab's screenshot checklist.
**Whenever a task changes state, update this section in the same PR.**

_Last updated: 2026-10-21_

| Who | Now | Next (waiting on) |
|---|---|---|
| **Joseph** | S3 Ask the facilitator the open questions · L5-C2 Data residency: law per country (also confirm the Act 843 sections Elise flagged) · **L6-D1 Audit logging: `withTransaction` helper first** · L7-A2 The two Lambda handlers · L7-A4 `POST /appointments` | L6-D2 Audit evidence (Eugene's L5-B2) · L7-A5 End-to-end event run (Eugene's L7-A1) · L8-A2 Peer-review walkthrough (Perfect's L8-A1) · Lab reports L5-R4, L6-R, L7-R (each lab's checklist) |
| **Eugene** | **S4 Copy Terraform into `infra/` (first: most of Labs 5–7 waits on it)** · S6 Cost tracker + budget alarm · S7 Rotate the Prosit 1 Lab 4 DB password | S5 Certificate, L5-A VPC, L7-A1 SNS/SQS/Lambda (S4) → L5-B1 RDS → L5-B2 Failover demo, L6-A1 IAM role, L6-B1 Encryption · L5-D AgroConnect decommissioning (S3) |
| **Elise** | **Review + approve [PR #2](https://github.com/ASU-MICS-2028/cc-group-3-prosit-2/pull/2)** (your review is addressed) · L6-C2 FHIR mapping (🔄 waiting on D-018 + LOINC check) · L5-C1 Sharding design · S8 Shared vocabulary · *optional:* L6-H3 RBAC table | L5-C3 Residency PDF (L5-C1 + Joseph's L5-C2) · L6-B2 Encryption evidence (Eugene's L6-B1) · L8-B3 Written peer review (Lab 8 session) · *optional:* L7-H2 Idempotency (L7-A5) |
| **Perfect** | **Review [PR #3](https://github.com/ASU-MICS-2028/cc-group-3-prosit-2/pull/3)** (after #2 merges) · **L7-C1 WebRTC signaling + client over HTTPS** · S9 Fork the PWA · L5-R1 Architecture diagram | L7-C2 → C3, C4 Call tests + stats (L7-C1) · L5-R2 PWA offline evidence (S9) · L6-A2 Allow/deny checks (Eugene's L6-A1) · L8-A1 Diagrams for peer review (L5-R1) → L8-B2 Revision |
| **Everyone** | **Confirm or reject D-018** (Elise's proposed fourth purpose, in `docs/decisions.md`) · L5-R3 One retrospective sentence each · L6-H4 Lambda reading · L8-X Teach-back of your `learnings/` notes (midterm prep) | L8-A3 Answers to the four review questions, L8-B1 Lab 8 session (in class) |

**Critical path:** Eugene's S4 unblocks the most work (Labs 5, 6 and 7 A/B all wait on it), so it goes first. Elise's schema (L6-C1) is ✅ done.

**Lab submissions:** each lab is evidence (screenshots + outputs) + a ~300-word report. Every screenshot, its file name and who takes it are in each lab's **Deliverables checklist** in [`PLAN.md`](./PLAN.md). Capture them while you do the task.

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
