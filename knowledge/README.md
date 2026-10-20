# Knowledge

**Everything a teammate or a coding assistant needs to know about this project and doesn't get from the code.**

The course materials, Prosit 1 work and planning notes are spread across Google Drive, Canvas and
individual laptops. This folder collects the parts that matter, summarised, so you don't need
anyone else's setup to get going.

> This repository is **public**. Never put passwords, keys, student ID numbers, phone numbers,
> personal emails or real patient data here. Summarise course materials; don't paste whole documents.

## Start here

| File | Read it when |
|---|---|
| [`../PLAN.md`](../PLAN.md) | You want to know what to do next, who owns it, and what it's waiting on |
| [`brief.md`](./brief.md) | You need to know what HealthConnect is meant to be |
| [`labs.md`](./labs.md) | You're working on a lab: requirements, deliverables, rubric, gotchas |
| [`prosit-1.md`](./prosit-1.md) | You want to reuse something from AgroConnect (Prosit 1) |
| [`workspace.md`](./workspace.md) | You're looking for a file: where the brief, labs, plan and reports live |
| [`sessions/`](./sessions/) | You want to know what happened in an earlier working session |
| [`../docs/decisions.md`](../docs/decisions.md) | You want to know what's already decided, and why |
| [`../learnings/`](../learnings/) | You want to know how someone's part works |

## Quick facts

- **Course:** ICS 534 Cloud Computing, Ashesi University, Fall 2026. Facilitator: Prof. Robert A. Sowah; co-instructor Dr. Stephane Nwolley; FI Shullamite Konama Darteh.
- **Sessions:** lecture Monday 1:15–2:45 pm; lab Thursday 8:00–11:15 am (Patrick Nutor Hall 115).
- **Team:** Group 3, Highlanders. Joseph Etse (PM/API), Eugene Sewor (Cloud/DevOps), Elise Kennedy-Angbo (Data), Perfect Avugla (Frontend).
- **Cloud:** AWS, region `af-south-1` (Cape Town). The launch deck gives $400 of credits per team for Prosit 2.
- **Prosit 2 runs about 4 weeks:** Labs 6, 7, the Week 8 midterm/milestone, and Lab 9 (CI/CD) are expected to feed it. We are also doing Lab 5 on HealthConnect (decision D-001).
- **Grading (course):** quizzes 15%, labs and projects 25%, midterm 15%, participation 5%, final exam 20% + final project 20%.
- **Late work:** at most 85% after 1 day, 75% after 2, 60% after 3, 0 after that.
- **AI use** is allowed in this course but must be declared: log it in [`../docs/ai-tools-usage.md`](../docs/ai-tools-usage.md).
- **Plan** (roles, scope, tasks in order with owners and blockers): [`../PLAN.md`](../PLAN.md); what's pending now is in the root README. The repo is the single source of truth (D-009).

## Session summaries (`sessions/`)

When you work with a coding assistant (Claude Code, Command Code, etc.) or have a working meeting,
add a **summary**, never the raw transcript. Raw transcripts are long, full of dead ends, and may
contain secrets or personal details.

Name it `sessions/YYYY-MM-DD-<topic>.md` and cover:

1. **Goal:** what you set out to do.
2. **What we found:** facts the team didn't know before.
3. **What we decided:** and add each decision to `docs/decisions.md`.
4. **What changed:** files, resources, documents (with links).
5. **Open questions / next steps.**

Keep it under a page. If something deserves more, it belongs in `learnings/` or `docs/`.
