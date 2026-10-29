# HealthConnect Ghana — Group 3 (Highlanders)

ICS 534 Cloud Computing · PROSIT 2 · Joseph Etse · Eugene Sewor · Elise Kennedy-Angbo · Perfect Avugla

## Everything to do now, and who does it

_Updated 26 Oct 2026. Lab 6 submitted. Call tests C1–C4 done; live bookings done (`evidence/lab7/outputs_A_create_appointment.txt`). Finished work isn't listed here; it's in [`PLAN.md`](./PLAN.md)._

### Current stage: Lab 7, serverless reminders + a video call (due before the Week 8 exam; confirm the date on Canvas)

| Task | Who | Status | Waiting on |
|---|---|---|---|
| L7-A5 Screenshot both functions' logs for Abena's appointment `4f530cae-7556-4ebb-8d21-e317d06170b5` and Yaw's `390e40f9-2677-4551-bb4d-e70247d633d5` (also Abena's `9a4f5949-a984-49d7-bd33-fb3abd2aa18d`, the one in `A-create-appointment.png`) (`/aws/lambda/healthconnect-dev-reminders`, `…-specialist-notify`), plus the topic's "messages published" graph. Save as `A-event-published.png`, `B-both-functions.png` (`A-reminder-logs.png` ✅ 29 Oct) (+ text copies) in `evidence/lab7/` | Eugene | 🟢 Ready | — |
| L7-H1 Dead-letter queue screenshot `H-dlq.png` (the data is already in `outputs_A1_event_infra.txt`) | Eugene | 🟢 Ready | — |
| L7-R paragraph: one open resilience question (e.g. SNS down = event lost; nobody is alerted when a dead-letter queue fills), in `learnings/database.md` | Elise | 🟢 Ready | — |
| L7-H2 *Optional:* make the reminder send only once per appointment. Live example: Abena's booking was sent twice (an offline retry) and published two events | Elise | 🟢 Ready | — |
| L7-R Assemble the Lab 7 report + code snippets (endpoint, both functions, signaling server, client) | Joseph | ⛔ Blocked | The three paragraphs, log screenshots |

### Still open from Lab 6, in our real system

| Task | Who | Status | Waiting on |
|---|---|---|---|
| L6-B1b Customer-managed KMS key, `rds.force_ssl`, HTTPS-only bucket policy | Eugene | 🟢 Ready | — |
| L6-X Why the Lab 5 failover dropped requests | Eugene | 🟢 Ready | — |
| D-018 Vote: add "public-health reporting, anonymised totals only" as a fourth purpose | Everyone | 🗳 Vote needed | — |

### Getting ready for Lab 8 (peer review + midterm, Week 8)

| Task | Who | Status | Waiting on |
|---|---|---|---|
| L8-A2 5-minute walkthrough script, using `docs/architecture-healthconnect.png` (one decision we're proud of, one known weakness) | Joseph | 🟢 Ready | — |
| L8-A3 Your answers to the four review questions (10× load · weakest security link · network or DB drop · open questions) | Everyone, Joseph collates | 🟢 Ready | — |
| S8 Shared vocabulary (user roles, data resources) in `knowledge/` | Elise | 🟢 Ready | — |
| L8-X Teach-back: walk the others through your `learnings/` note | Everyone | 🟢 Ready | — |

**What to hand in for Lab 7, screenshot by screenshot:** the [Lab 7 deliverables checklist](./PLAN.md#lab-7-deliverables-checklist).

---

Everything else: [`PLAN.md`](./PLAN.md) (all stages, done and to come) · [`CONTRIBUTING.md`](./CONTRIBUTING.md) (how we work, repo map) · [`AGENTS.md`](./AGENTS.md) (for coding assistants).
**This page lists only what's open now.** When a task changes state, update it here and in `PLAN.md` in the same PR; remove it from here once it's done.
