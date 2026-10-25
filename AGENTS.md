# Instructions for coding assistants

You are helping Group 3 (Highlanders) build **HealthConnect Ghana** for ICS 534 Cloud Computing (PROSIT 2).
Each teammate runs their own assistant (Claude Code, Command Code, …) on their own machine, so **everything you need is
in this repo**. Never assume anything from one person's setup. `CLAUDE.md` files only import this file; this is the
one set of instructions for every tool.

**Area guides:** working inside `backend/`, `db/` or `infra/`? Also read that folder's `AGENTS.md` for its commands and traps.

## Read first, in this order

1. [`README.md`](./README.md): **everything open now** and who owns each task (D-025).
2. [`PLAN.md`](./PLAN.md): the task you're helping with: owner, "Blocked by", "done when", and the lab's deliverables checklist.
3. [`docs/README.md`](./docs/README.md) → the ADRs. What's decided is decided; to change it, write a new ADR, never contradict one silently.
4. The `learnings/` note for the area you're touching.
5. [`knowledge/README.md`](./knowledge/README.md): the brief, labs, course and lecture notes, Prosit 1, where files live.

If the task isn't in `PLAN.md`, or its "Blocked by" isn't ✅, say so before starting.

## How to work: every task, every time

1. **Plan in small steps.** Before starting, list the steps. Each one should be small enough to check on its own.
2. **Explain each step before doing it**, in plain words: what you're about to change, and why. The person you're helping must be able to defend every step in Lab 8 and in the exam.
3. **Test each step, including the ways it can go wrong.** Not just the happy path. For each step, try every branch that applies:
   - **Normal input:** it does what it should.
   - **Bad or missing input:** empty, wrong type, too long, unknown id, missing config or environment variable.
   - **Repeats and races:** the same request twice (offline phones retry), two at once, out of order.
   - **Failures around it:** database down, network drop, permission denied, a wrong region, an AWS capacity or quota error.
   - **Undo:** can it be rolled back or torn down cleanly?

   Say which branches you tried and what happened. If a branch can't be tested, say that plainly, and why. Never report a test as passing without having run it.
4. **Capture evidence as you go** (lab work): exact file names from the lab's checklist in `PLAN.md`, rules in [`evidence/README.md`](./evidence/README.md).
5. **Record what you learned** in `learnings/<area>.md`, in the simplest words possible (template: [`learnings/TEMPLATE.md`](./learnings/TEMPLATE.md)).
6. **Record decisions as ADRs** in `docs/` (format in [`docs/README.md`](./docs/README.md)).
7. **Close the loop in the same PR:** the task row in `PLAN.md` (and the tasks it unblocks), the README (add or remove the row), a session summary in `knowledge/sessions/`, and a line in `docs/ai-tools-usage.md`.

## Where everything goes

| Put it in… | When it is… | Written as… |
|---|---|---|
| `README.md` | **everything open now**: tasks, who, status | short tables; remove a row once it's done (D-025) |
| `PLAN.md` | any task, done or to come | one row per task: owner, blockers, status, "done when" |
| `docs/` | a **decision**, or a document a decision relies on | an **ADR** ([format](./docs/README.md)) |
| `learnings/` | what someone did and learned | the simplest words possible; exact commands; what's broken |
| `knowledge/` | background facts: course, lectures, labs, brief, where files live | short summaries, never whole copied documents |
| `knowledge/sessions/` | what happened in a working session | a one-page **summary**, never a raw transcript |
| `evidence/labN/` | proof for a lab deliverable | files named as in that lab's checklist |

## Rules

- **Explain everything plainly.** Each area has one owner, and the rest of the team relies only on their `learnings/` note. Explain every technical term in one line.
- **The repo is public.** Never commit secrets, passwords, keys, tokens, student ID numbers, phone numbers, personal emails or real patient data. Synthetic data only. Account and resource IDs are fine.
- **Don't edit history.** Applied migrations, recorded evidence, accepted ADRs and session summaries are never rewritten. Add a new migration, a new evidence file, or a new ADR that replaces the old one.
- **Cloud:** AWS `af-south-1`, team account `ashesi-dev`. Secrets live in Secrets Manager; services use IAM roles, never keys in code. Any new resource goes in the team cost tracker, and gets torn down when its lab is done.
- **Ask before anything outward-facing or hard to undo:** `terraform apply` / `destroy`, deleting data or resources, merging PRs, changing GitHub settings, sending messages.
- **Reuse before writing:** check the Prosit 1 repo first ([`knowledge/prosit-1.md`](./knowledge/prosit-1.md)).
- **Real deadlines beat the syllabus.** They've differed every time; take them from the README or the team, not from `knowledge/course.md`.
- **Workflow:** branch → PR into `main` → one teammate approves → squash-merge. Don't stack PRs. See [`CONTRIBUTING.md`](./CONTRIBUTING.md).
- **AI use is declared** in [`docs/ai-tools-usage.md`](./docs/ai-tools-usage.md) (Ashesi policy).
