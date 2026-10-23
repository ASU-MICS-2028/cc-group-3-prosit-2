# 2026-10-23 · Agent files, CI, README as current stage, course knowledge

**Who:** Joseph, with Claude Code (two sub-agents for the lecture summaries). **Summary, not a transcript.**

## Goal

Make sure anyone's coding assistant knows how we work; README shows only the current stage; all documentation as ADRs; course material in `knowledge/`.

## What we found

- Renaming decision IDs to `ADR-0xx` would mean editing applied SQL migrations and recorded evidence, so `D-0xx` stays as our ADR number.
- Terraform override files (used for Lab 5 in a second account) weren't ignored by git: fixed.
- Testing the assistants found one gap: the db guide didn't give the exact command to run the schema tests without overwriting evidence. Fixed and re-tested.
- The schema test script is a real gate: a deliberately broken check makes it exit 1.
- The lectures name a third Prosit, SmartCity Accra (Weeks 10–14).

## What we decided

D-020 (README shows only the current stage), D-021 (one approval from any teammate).

## What changed

Root `AGENTS.md` rewritten around "small steps, explain each, test every way it can go wrong"; `backend/`, `db/`, `infra/` guides + `CLAUDE.md`; README and CONTRIBUTING restructured; `docs/README.md` (ADR index and template); CI jobs for API and schema tests; PR template; `knowledge/course.md`, `lectures.md`, `course-reference.md`; `learnings/repo-and-tooling.md`.

## Open questions / next steps

- Confirm Command Code reads `AGENTS.md` (Eugene).
- Add lecture notes for Weeks 5 onward when the slides are available.
