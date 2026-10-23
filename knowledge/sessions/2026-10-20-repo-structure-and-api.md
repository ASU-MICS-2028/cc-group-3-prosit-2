# 2026-10-20 · Repo structure, branch protection, first API

**Who:** Joseph, with Claude Code. **Summary of the session, not a transcript.**

## Goal

Make the repo the one place the team works from, lock `main`, and start Joseph's first build task (S10).

## What we found

- The plan Google Doc had been reworded by a teammate. Roles were unchanged. We retired the doc (D-009); everything now lives in the repo.
- All four of us are admins on the repo. Nobody can approve their own PR, so a path owned by one person blocks that person's PRs forever. CODEOWNERS now lists a backup for every path.
- Prosit 1's EC2 start-up script already reads the instance id, and its launch template sets the metadata hop limit to 2, which lets containers use the instance role. Both need to survive the Terraform copy (S4).

## What we decided

- D-008 (build the foundation, design the rest) and D-009 (repo is the single source of truth).

## What changed

- `PLAN.md` (roles, scope, 44 tasks with owners and blockers, risks) and the README "Pending now" table; `docs/decisions.md`, `learnings/`, `knowledge/`, `AGENTS.md`.
- Branch protection on `main`: PR required, 1 code-owner approval, applies to admins too (S2 ✅).
- `backend/`: first version of `patient-record-service` with `/health` and `/ready`, 4 tests, Dockerfile; verified in a container against local Postgres (S10 ✅). Details: [`../../learnings/patient-record-service.md`](../../learnings/patient-record-service.md).

## Open questions / next steps

1. S3: send the facilitator the open questions (Joseph).
2. L5-C2: legal grounding for the residency doc (Joseph).
3. Ask Eugene to add a "backend tests" CI job alongside S4.
