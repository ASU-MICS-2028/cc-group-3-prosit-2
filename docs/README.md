# docs/: decisions (ADRs) and the documents behind them

All our formal documentation lives here, as **Architecture Decision Records (ADRs)**: short records of one decision
each, what we decided, why, and what we gave up. A document that isn't an ADR (a mapping, a design) belongs here only
if an ADR points to it.

## The ADR logs

| Log | Covers | IDs |
|---|---|---|
| [`decisions.md`](./decisions.md) | Every team-wide decision: anything that changes how someone else's part must behave | `D-001`, `D-002`, … |
| [`data-decisions.md`](./data-decisions.md) | Decisions that only concern the database's internals | `DATA-001`, … |

**Why the IDs are `D-` and not `ADR-`:** the IDs are already quoted in applied SQL migrations, Terraform comments and
recorded lab evidence, which we never rewrite. So `D-0xx` *is* our ADR number.

## Documents the ADRs rely on

| Document | What it is | Backs |
|---|---|---|
| [`fhir-mapping.md`](./fhir-mapping.md) | Our tables mapped to FHIR R4 resources, the gaps, and the Act 843 data-minimisation pass | D-011 to D-018 (Lab 6 Part C) |
| [`ai-tools-usage.md`](./ai-tools-usage.md) | Ashesi AI-use disclosure: who used which tool for what, and how it was checked | Course policy |

## Writing an ADR

1. Take the next free number in the right log. Add the entry at the **bottom**.
2. Use this template:

```markdown
## D-0xx: <the decision, as a short statement>

- **Date:** YYYY-MM-DD · **Status:** Proposed | Accepted | Replaced by D-0yy
- **Affects:** <who has to do something differently, and in what>
- **Decision:** <what we will do, concretely>
- **Why:** <the problem, and the evidence or constraint that decided it>
- **Gave up:** <the alternatives and what this choice costs us>
```

3. **Proposed** until the team agrees; then **Accepted**. Anything that affects someone's area needs their OK.
4. **Never edit an accepted ADR's decision.** To change it, write a new ADR and mark the old one `Replaced by D-0yy`.
5. Link the ADR from the `learnings/` note of the area it affects, and from `PLAN.md` if it creates or changes tasks.
