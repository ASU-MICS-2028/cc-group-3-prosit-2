# Contributing

`main` is the only long-lived branch. Nobody pushes to it directly: every change
arrives through a pull request.

## The flow

1. Branch off an up-to-date `main`:
   - `feat/<topic>`, `fix/<topic>`, `chore/<topic>`, `docs/<topic>`, `lab5/<part>`, `lab6/<part>`
2. Do the work **and capture evidence as you go** (see [`evidence/README.md`](./evidence/README.md)).
3. Write or update your findings note in `docs/findings/` (template: [`TEMPLATE.md`](./docs/findings/TEMPLATE.md)).
4. Open a pull request into `main`. [`CODEOWNERS`](./.github/CODEOWNERS) requests a review from the path owner.
   Where possible, also ask someone **outside** your lane to review it. If they can't follow your findings note, it isn't done.
5. Squash-merge once approved.

## Definition of done for any PR

- [ ] It works, and the evidence (outputs/screenshots) is in `evidence/labN/`
- [ ] The findings note explains it **in plain words**: what, why, how to check, what's missing, gotchas
- [ ] No secrets, passwords, keys or real patient data in the diff
- [ ] Any new cloud resource is in the cost tracker
- [ ] AI help, if used, is noted in `docs/ai-tools-usage.md`

## Who owns what

| Path | Owner |
| --- | --- |
| `infra/`, `.github/` | Eugene Sewor (`@eugene-sew`) |
| `db/` | Elise Kennedy-Angbo (`@Elise-Oyi`) |
| `backend/` | Joseph Etse (`@josetseph`) |
| `frontend/` | Perfect Avugla (`@PeaElorm`) |
| everything else | Joseph Etse (`@josetseph`) |

## Branch protection for `main`

This is set in GitHub (**Settings → Branches**), not in the repo:

- Require a pull request before merging, with at least 1 approval
- Require review from Code Owners
- Do not allow bypassing the above

## Commit messages

Imperative and scoped:

```
feat(infra): add HealthConnect VPC with private data subnets
fix(backend): log reads of missing patients without FK failure
docs(findings): explain least-privilege role in plain terms
```
