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

_Last updated: 2026-10-23 · Lab 5 ✅ submitted 22 Oct · **Lab 6 due Saturday 25 October**_

| Who | Now | Next (waiting on) |
|---|---|---|
| **Joseph** | **L6-D1 Audit logging (`withTransaction` first)** · S3 Facilitator questions (Lab 7/8 due dates, Lab 5 on HealthConnect) · L7-A2 Lambda handlers · L7-A4 `POST /appointments` | L6-D2 Audit evidence (L6-D1) · **L6-R Lab 6 report, due 25 Oct** (A2, B2, C2, D2) · L7-A5 Event run (Eugene's L7-A1) · L8-A2 Walkthrough (Perfect's L8-A1) |
| **Eugene** | **L6-A1 Least-privilege IAM role (Lab 6, due 25 Oct)** · **L6-B1 Encryption build (unblocked: S5 ✅, HTTPS live)** · L6-X Why failover dropped requests · L7-A1 SNS/SQS/Lambda · S6 Cost tracker | *optional:* L6-H1 FHIR sandbox comparison · tear down the call server after Lab 7 |
| **Elise** | **L6-C2 FHIR mapping + data minimisation (Lab 6, due 25 Oct; waiting on D-018 + LOINC check)** · S8 Shared vocabulary · *optional:* L6-H3 RBAC table | L6-B2 Encryption evidence (Eugene's L6-B1) · L8-B3 Written peer review (Lab 8 session) · *optional:* L7-H2 Idempotency |
| **Perfect** | **L7-C1 WebRTC signaling + client over HTTPS (hosted: `https://call-hc.agroconnect.space`, no tunnel needed; needs the phone test)** · review D-023 + the heartbeat added to `webrtc-spike/` · L8-A1 Peer-review diagrams (start from `evidence/lab5/fig1-architecture.png`) · S9 Fork the PWA (`frontend/` not created yet) | **L6-A2 Allow/deny checks (Eugene's L6-A1; Lab 6, due 25 Oct)** · L7-C2 → C3, C4 Call tests + stats · L8-B2 Revision |
| **Everyone** | **Confirm or reject D-018** (Elise's L6-C2 waits on it) · L6-H4 Lambda reading · L8-X Teach-back of your `learnings/` notes | L8-A3 Answers to the four review questions, L8-B1 Lab 8 session (in class) |

**Critical path for Lab 6 (due 25 Oct):** Eugene's L6-A1 → Perfect's L6-A2 · Eugene's S5 → L6-B1 → Elise's L6-B2 · Joseph's L6-D1 → L6-D2 · Elise's L6-C2 → then Joseph writes L6-R. Lab 7 work (L7-A2, L7-C1) runs alongside.

**Lab submissions:** each lab is evidence (screenshots + outputs) + a ~300-word report. Every screenshot, its file name and who takes it are in each lab's **Deliverables checklist** in [`PLAN.md`](./PLAN.md). Capture them while you do the task.

---

Everything else: [`PLAN.md`](./PLAN.md) (all stages, done and to come) · [`CONTRIBUTING.md`](./CONTRIBUTING.md) (how we work, repo map) · [`AGENTS.md`](./AGENTS.md) (for coding assistants).
**This table shows only the current stage.** When a task changes state, update it here and in `PLAN.md` in the same PR. When the stage is submitted, replace the whole table with the next stage.
