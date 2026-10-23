# Contributing

`main` is the only long-lived branch. Nobody pushes to it directly: every change
arrives through a pull request.

## The flow

1. Branch off an up-to-date `main`:
   - `feat/<topic>`, `fix/<topic>`, `chore/<topic>`, `docs/<topic>`, `lab5/<part>`, `lab6/<part>`
2. Do the work **and capture evidence as you go** (see [`evidence/README.md`](./evidence/README.md)).
3. Write or update your learnings note in `learnings/` (template: [`TEMPLATE.md`](./learnings/TEMPLATE.md)).
   If you made a decision, add it to [`docs/decisions.md`](./docs/decisions.md).
   If you worked with a coding assistant, add a **summary** of the session to `knowledge/sessions/` (never the raw transcript; see [`knowledge/README.md`](./knowledge/README.md)).
4. Open a pull request into `main`. [`CODEOWNERS`](./.github/CODEOWNERS) requests a review from the path owner.
   Where possible, also ask someone **outside** your lane to review it. If they can't follow your learnings note, it isn't done.
5. Squash-merge once approved.

## Definition of done for any PR

- [ ] It works, and the evidence (outputs/screenshots) is in `evidence/labN/`
- [ ] The learnings note explains it **in plain words**: what, why, how to check, what's missing, gotchas
- [ ] Decisions are in `docs/decisions.md`; new project facts are in `knowledge/`
- [ ] Your task's status is updated in [`PLAN.md`](./PLAN.md) (including the tasks it unblocks), **and** the "Pending now" table in the README matches
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

CODEOWNERS still auto-requests the right reviewers, but any one teammate's approval is enough to merge. Nobody can approve their own PR.

## Branch protection for `main`

This is set in GitHub (**Settings → Branches**), not in the repo:

- Require a pull request before merging, with **1 approval from any teammate** (code-owner approval is no longer required: it was blocking merges, 2026-10-23)
- Do not allow bypassing the above

## Commit messages

Imperative and scoped:

```
feat(infra): add HealthConnect VPC with private data subnets
fix(backend): log reads of missing patients without FK failure
docs(learnings): explain least-privilege role in plain terms
```
