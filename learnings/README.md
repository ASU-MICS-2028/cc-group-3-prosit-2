# Learnings

**What each of us did and learned, written so the others never have to redo it.**

Each of us owns a part, and the rest of the team will not touch it. They will rely on the note
you write here, in the report, in the presentation and in the exam. So explain it as bluntly and
simply as you can.

## How

1. Copy [`TEMPLATE.md`](./TEMPLATE.md) to `learnings/<area>.md`, e.g. `lab6-iam.md`, `lab5-vpc.md`, `fhir-schema.md`.
2. Fill it in **as you work**, not at the end.
3. Update it in the same PR as the work. A PR without an updated note is not done.

## Rules

- Write for someone who has never seen your part and won't open it.
- Short sentences. Explain every technical term in one line.
- Be honest about what is missing, faked or fragile.
- Include the exact commands to check it works.
- End with two or three lines the report editor can paste in.

## Index

| Note | Owner | What it covers |
|---|---|---|
| [`database.md`](./database.md) | Elise | FHIR-shaped schema, consent and audit rules in the database, how to test it (L6-C1, L6-C2, L7-A3) |
| [`infra.md`](./infra.md) | Eugene | The AWS setup in `infra/`: network, load balancer, two app servers, private database, alarms; how to check it and run migrations (S4, L5-A, L5-B1) |
| [`patient-record-service.md`](./patient-record-service.md) | Joseph | The API in `backend/`: health checks, how to run it, settings it needs on AWS |
