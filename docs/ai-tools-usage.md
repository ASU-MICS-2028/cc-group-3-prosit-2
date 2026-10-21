# AI Tools Usage Disclosure

> Academic integrity addendum for ICS 534 Cloud Computing, PROSIT 2, per Ashesi University's
> *Policy on AI Use for Academic Work*. The instructor authorised AI use for this course
> (see the Prosit 1 disclosure). Everyone adds an entry when they use an AI tool; each member signs before submission.

**Group:** 3, Highlanders · **Repository:** `ASU-MICS-2028/cc-group-3-prosit-2`

## Log

| Date | Who | Tool | What it was used for | How we checked it |
|---|---|---|---|---|
| 2026-10-18 | Joseph Etse | Claude Code (Anthropic) | Reading the Prosit 2 brief and Labs 5–6; drafting the team plan; setting up this repository's README, CONTRIBUTING, CODEOWNERS and findings template | Joseph reviewed the plan and every file before sharing |
| 2026-10-20 | Joseph Etse | Claude Code (Anthropic) | Setting up `docs/decisions.md`, `learnings/`, `knowledge/` (summaries of the brief, labs and Prosit 1) and `AGENTS.md`; summarising the 2026-10-18 planning session | Joseph reviewed every file; summaries checked against the original brief and lab handouts |
| 2026-10-20 to 2026-10-21 | Elise Kennedy-Angbo | Claude (Anthropic) | Explaining LOINC, FHIR, foreign keys and psql; discussing schema decisions (UUIDs, consent enforcement, LOINC storage, audit, FHIR version); drafting the migrations, tests, FHIR mapping, gap analysis, data minimisation and this PR's notes | Elise made each design decision after discussing the options; every rule is exercised by `db/tests/run_tests.sh` (25 refused, 14 allowed writes) on Postgres 16; LOINC codes and Act 843 sections flagged for manual verification |

## Sign-off

| Member | Signature / date |
|---|---|
| Joseph Etse | |
| Eugene Sewor | |
| Elise Kennedy-Angbo | |
| Perfect Avugla | |
