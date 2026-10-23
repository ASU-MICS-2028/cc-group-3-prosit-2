# How the repo, the coding assistants and CI fit together

**Owner:** Joseph · **Last updated:** 2026-10-23 · **Status:** working

## 1. In one sentence

The repo tells every teammate's coding assistant how we work, and CI checks the code, the database rules and the
Terraform on every pull request, so nobody has to remember the rules.

## 2. What we set up

1. **One set of instructions for every assistant:** `AGENTS.md` at the root. `CLAUDE.md` is one line, `@AGENTS.md`,
   which tells Claude Code to load `AGENTS.md`. Other tools read `AGENTS.md` directly.
2. **A short guide per area:** `backend/AGENTS.md`, `db/AGENTS.md`, `infra/AGENTS.md`, each with a one-line
   `CLAUDE.md` next to it. When an assistant works inside that folder it also gets that folder's commands and traps.
3. **The way we work, written into `AGENTS.md`:** small steps; explain each step before doing it; after each step,
   test it, including the ways it can go wrong (bad input, repeats, failures, undo); record what you learned here
   in `learnings/`, decisions as ADRs in `docs/`, background in `knowledge/`.
4. **The README shows only the current stage** (one table). Everything else is in `PLAN.md` (ADR D-020).
5. **CI now runs three checks on every PR:** Terraform format + validate, the API's tests + build, and the
   database schema tests against a fresh Postgres.
6. **A PR template** with the "done?" checklist, so it appears on every new PR.
7. **One approval from any teammate merges a PR** (ADR D-021).

## 3. Why

- Each of us uses a different assistant on a different laptop. Putting the rules in the repo is the only way they all follow the same ones.
- Rules people have to remember get forgotten under deadline pressure (Lab 5 night). Rules in CI can't be skipped.

## 4. How to check it works

Ask an assistant a question only the instructions can answer, from different folders:

```bash
claude -p "What stage are we in, and who owns L6-A1?" --allowedTools Read Grep Glob        # from the repo root
(cd db && claude -p "Can I fix a typo in migrations/001_initial_schema.sql?" --allowedTools Read Grep Glob)
```

Expected: the current stage from the README and its owner; "no: never edit an applied migration, add a new one".
On 2026-10-23 we tested root, `backend/`, `db/` and `infra/`, plus a request to commit an AWS key (refused). The test
found one gap, the exact command for running the schema tests without overwriting evidence, which was then fixed.

CI: open a PR and look at the three checks at the bottom. To prove the schema check can fail, we added a deliberately
broken check locally: the script exited with code 1, so CI goes red. A normal run gives
`25 deny checks, 14 allow checks, 0 problems`.

## 5. What is NOT done

- CI doesn't deploy anything yet (that's the Week 9 CI/CD lab).
- No automatic check that the README matches `PLAN.md`; it relies on the PR checklist.
- We couldn't test tools other than Claude Code. They should read `AGENTS.md`, but nobody has confirmed it for Command Code.

## 6. What will bite us

- **Stacked PRs:** if a PR is built on top of another and GitHub groups them into a "stack", the normal merge
  button and `gh pr merge` refuse. Avoid stacking. If it happens:
  `gh api -X PUT repos/ASU-MICS-2028/cc-group-3-prosit-2/pulls/<N>/merge-async -f merge_method=squash -f merge_action=direct_merge`.
- **Don't edit history.** Applied migrations, evidence files, accepted ADRs and session summaries stay as they are,
  which is why decision IDs stay `D-0xx` instead of being renamed `ADR-0xx`.
- **`db/tests/run_tests.sh` overwrites the Lab 6 evidence file** unless you give it another output path.

## 7. Terms used

| Term | Plain meaning |
|---|---|
| Coding assistant / agent | An AI tool (Claude Code, Command Code, …) that reads and edits the repo for you |
| `AGENTS.md` | The instructions file those tools read before working |
| CI (continuous integration) | GitHub runs our checks automatically on every pull request |
| ADR | Architecture Decision Record: a short note of one decision, why, and what we gave up |

## 8. Lines ready for the report

Every teammate uses an AI coding assistant, so we wrote the team's working rules into the repository itself
(`AGENTS.md` at the root and per area) and tested that assistants follow them from each folder. Continuous integration
runs our infrastructure checks, API tests and 39 database rule checks on every pull request.
