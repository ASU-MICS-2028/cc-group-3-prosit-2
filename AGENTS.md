# Instructions for coding assistants

You are helping Group 3 (Highlanders) build **HealthConnect Ghana** for ICS 534 Cloud Computing (Prosit 2).
Each team member uses their own assistant on their own machine, so **everything you need is in this repo**.
Don't assume anything from one person's setup.

## Read first

1. [`knowledge/README.md`](./knowledge/README.md): quick facts and an index of the project context.
2. [`PLAN.md`](./PLAN.md): the ordered task list. Find the task you're helping with: its owner, its blockers, and its "done when".
3. [`docs/decisions.md`](./docs/decisions.md): what is decided. Don't contradict a decision silently; propose a new one.
4. The `learnings/` note for the area you're touching, and [`knowledge/labs.md`](./knowledge/labs.md) if it's lab work.

## Rules

- **Explain everything plainly.** Whoever owns an area is the only person who works on it; the rest of the team relies on their note in `learnings/`. When you change something, update that note in simple language: what, why, how to check (exact commands), what's missing, gotchas. Explain every technical term.
- **Keep the plan current.** When a task's status changes, update its row in `PLAN.md`, flip any tasks it unblocks to Ready, and update the README's "Pending now" table in the same change.
- **Record decisions** in `docs/decisions.md`, and **new project facts** in `knowledge/`.
- **Summarise your session** in `knowledge/sessions/YYYY-MM-DD-<topic>.md` (format in `knowledge/README.md`). Never commit raw transcripts.
- **Log AI use** in `docs/ai-tools-usage.md` (required by Ashesi's AI policy).
- **This repo is public.** Never commit secrets, passwords, keys, student IDs, phone numbers, personal emails, or real patient data. Use synthetic data only.
- **Cloud:** AWS `af-south-1`. Secrets go in Secrets Manager; services use IAM roles, never embedded keys. Every new resource goes in the team cost tracker.
- **Reuse before writing:** check the Prosit 1 repo ([`knowledge/prosit-1.md`](./knowledge/prosit-1.md)) for a module or pattern first.
- **Workflow:** branch + PR into `main`; no direct pushes. See [`CONTRIBUTING.md`](./CONTRIBUTING.md). Lab evidence goes in `evidence/labN/` ([conventions](./evidence/README.md)).
