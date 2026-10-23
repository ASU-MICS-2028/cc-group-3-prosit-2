# Contributing

How we work on HealthConnect. Using a coding assistant? It follows [`AGENTS.md`](./AGENTS.md), which builds on this file.

## The one rule: explain everything, plainly

**Each of us owns a part, and the rest of the team will not touch that part. They rely entirely on what you
write about it.** So whatever you work on, explain it as bluntly and simply as possible:

- Write for a teammate who has never opened your folder and has no time to.
- Say **what you did**, **why**, **how to check it works** (exact commands), **what is not done**, and **what will bite us**.
- No unexplained jargon. If you use a term like "NAT", "FHIR" or "least privilege", say what it means in one line.
- Put it in a learnings note: copy [`learnings/TEMPLATE.md`](./learnings/TEMPLATE.md) to `learnings/<area>.md`.
- **A PR is not finished until its learnings note is updated.** Reviewers reject PRs that leave the team guessing.

If a teammate has to ask you how your part works, the note was not simple enough. Fix the note, not just the answer.

## Where things go

| Path | What goes here | Owner |
|---|---|---|
| `README.md` | **Only the current stage**: its tasks, who has each, status. Nothing done, nothing later | Whoever changes a task's state |
| `PLAN.md` | Every stage and task in order, with owners, blockers, "done when" and each lab's deliverables checklist | Joseph (everyone updates their own rows) |
| `docs/` | **Architecture Decision Records (ADRs)** and the documents they point to ([index](./docs/README.md)) | Joseph (editor); each decision's author |
| `learnings/` | **What each of us did and learned**, in the simplest words, so nobody has to redo it to understand it ([how](./learnings/README.md)) | Each owner |
| `knowledge/` | **Background:** the brief, the labs, course and lecture notes, Prosit 1, where files live, summarised work sessions ([start here](./knowledge/README.md)) | Everyone |
| `evidence/labN/` | Lab evidence: screenshots, terminal outputs, the scripts that produced them, the submitted PDF ([conventions](./evidence/README.md)) | Whoever ran it |
| `backend/` | `patient-record-service`: Node/TypeScript API | Joseph |
| `db/` | SQL migrations (FHIR-aligned schema) and their tests | Elise |
| `infra/` | Terraform for AWS `af-south-1` | Eugene |
| `frontend/` | Health-worker offline PWA (not started; forked from AgroConnect) | Perfect |
| `AGENTS.md`, `CLAUDE.md` (root and per area) | Instructions for coding assistants | Joseph |

## Ground rules

- **Synthetic data only.** No real patient information goes anywhere.
- **The repo is public.** No secrets, passwords, keys, student IDs, phone numbers or personal emails in it, or in Drive. Use AWS Secrets Manager and IAM roles.
- **Every cloud resource you create goes into the cost tracker the same day**, and gets torn down when its lab is done.
- **AI use is declared** in [`docs/ai-tools-usage.md`](./docs/ai-tools-usage.md).

## The flow

1. Pick your task from the [README](./README.md) (current stage) or [`PLAN.md`](./PLAN.md). Only start it if everything in "Blocked by" is ✅. Mark it 🔄 In progress.
2. Branch off an up-to-date `main`: `feat/<topic>`, `fix/<topic>`, `chore/<topic>`, `docs/<topic>`, `lab6/<part>`, …
3. Work **step by step**. After each step, test it, including the ways it can go wrong, not only the happy path (see "How to work" in [`AGENTS.md`](./AGENTS.md)). Capture evidence as you go ([`evidence/README.md`](./evidence/README.md)).
4. Update, in the same PR: your `learnings/` note · an ADR in `docs/` for any decision · `knowledge/` for new facts · a session summary in `knowledge/sessions/` if you used an assistant · your task row in `PLAN.md` (and flip what it unblocks) · the README table.
5. Open a pull request into `main`. The template lists the checks. [`CODEOWNERS`](./.github/CODEOWNERS) requests the right reviewers.
6. Squash-merge once **one teammate** approves.

## Definition of done for any PR

- [ ] It works, its failure paths were tried, and the evidence (outputs/screenshots) is in `evidence/labN/`
- [ ] The learnings note explains it **in plain words**: what, why, how to check, what's missing, gotchas
- [ ] Decisions are ADRs in `docs/`; new project facts are in `knowledge/`
- [ ] Your task's status is updated in [`PLAN.md`](./PLAN.md) (including the tasks it unblocks), **and** the README shows the current stage correctly
- [ ] No secrets, passwords, keys or real patient data in the diff
- [ ] Any new cloud resource is in the cost tracker
- [ ] AI help, if used, is noted in `docs/ai-tools-usage.md`

## Who owns what

| Path | Lead | Backup reviewer |
| --- | --- | --- |
| `infra/`, `.github/` | Eugene Sewor (`@eugene-sew`) | Joseph |
| `db/` | Elise Kennedy-Angbo (`@Elise-Oyi`) | Joseph |
| `backend/` | Joseph Etse (`@josetseph`) | Elise |
| `frontend/` | Perfect Avugla (`@PeaElorm`) | Joseph |
| everything else (plan, docs, learnings, knowledge) | Joseph Etse (`@josetseph`) | anyone on the team |

CODEOWNERS auto-requests the right reviewers, but any one teammate's approval is enough to merge. Nobody can approve their own PR.

## Branch protection for `main`

Set in GitHub (**Settings → Branches**), not in the repo:

- Require a pull request before merging, with **1 approval from any teammate** (code-owner approval is no longer required: it was blocking merges, 2026-10-23)
- Do not allow bypassing the above
- Don't stack PRs on top of each other: GitHub then refuses the normal merge button

## Commit messages

Imperative and scoped:

```
feat(infra): add HealthConnect VPC with private data subnets
fix(backend): log reads of missing patients without FK failure
docs(learnings): explain least-privilege role in plain terms
```
