# HealthConnect Ghana — Group 3 (Highlanders)

**Course:** ICS 534 Cloud Computing | **Milestone:** PROSIT 2
**Team:** Joseph Etse · Eugene Sewor · Elise Kennedy-Angbo · Perfect Avugla
**Team plan:** [Prosit 2 – HealthConnect Team Plan](https://docs.google.com/document/d/1xh4xjIjsVPbG_20lsi52Yoe4uCil6TJ7qjoM1yfgmcY/edit) (Google Doc: scope, phases, owners)

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
- Put it in a findings note: copy [`docs/findings/TEMPLATE.md`](./docs/findings/TEMPLATE.md) to `docs/findings/<area>.md`.
- **A PR is not finished until its findings note is updated.** Reviewers should reject PRs that leave the team guessing.

If a teammate has to ask you how your part works, the note was not simple enough. Fix the note, not just the answer.

---

## Status

| Lab | Topic | Owner(s) | Status | Findings |
|---|---|---|---|---|
| Lab 5 | VPC, load balancer, private DB, data residency, AgroConnect decommissioning | Eugene, Elise, Joseph | Not started | — |
| Lab 6 | Least-privilege IAM, encryption, FHIR-aligned schema, audit logging | Eugene, Elise, Joseph, Perfect | Not started | — |
| Lab 7 | Serverless telemedicine (expected) | TBD | Not released | — |

Update this table whenever a lab part changes state. Link the findings note.

---

## Repository layout

Folders are created when their first real content lands.

| Path | What goes here | Owner |
|---|---|---|
| `infra/` | Terraform for AWS `af-south-1`: VPC, ALB, ASG, RDS, S3, IAM, KMS | Eugene |
| `backend/` | `patient-record-service`: Node/TypeScript API, audit logging | Joseph |
| `db/migrations/` | SQL schema (FHIR-aligned) | Elise |
| `frontend/` | CHV offline PWA (forked from the AgroConnect PWA) | Perfect |
| `docs/findings/` | One plain-language note per area (see the rule above) | Each owner |
| `docs/` | Architecture decisions, FHIR mapping, data residency, AI disclosure | Joseph (editor) |
| `evidence/labN/` | Lab evidence: terminal outputs and screenshots ([conventions](./evidence/README.md)) | Whoever ran it |

---

## Ground rules

- **Synthetic data only.** No real patient information goes anywhere.
- **No secrets in the repo or in Drive.** Use AWS Secrets Manager and instance roles.
- **Every resource you create goes into the cost tracker the same day.**
- **AI use is declared** in [`docs/ai-tools-usage.md`](./docs/ai-tools-usage.md).

How to contribute (branches, PRs, reviews): [`CONTRIBUTING.md`](./CONTRIBUTING.md).
