# HealthConnect Ghana — Group 3 (Highlanders)

ICS 534 Cloud Computing · PROSIT 2 · Joseph Etse · Eugene Sewor · Elise Kennedy-Angbo · Perfect Avugla

## Everything to do now, and who does it

_Updated 26 Oct 2026. Call tests C1–C4 done (stats in `evidence/lab7/outputs_C_call_stats.md`). Finished work isn't listed here; it's in [`PLAN.md`](./PLAN.md)._

### Today: finish Lab 6

| Task | Who | Status | Waiting on |
|---|---|---|---|
| Read the Lab 6 report and send Joseph feedback (`prosit 2/Labs/lab6/` in the team Drive) | Eugene, Elise, Perfect | 🔄 Before 23:00 tonight | — |
| L6-R Submit the Lab 6 package (PDF + `iam-policy.json` + schema + screenshots) | Joseph | 🔄 By 23:59 tonight | Feedback |
| Tear down the Lab 6 lab environment (Aurora `healthconnect-db` + EC2 server, us-east-1) | Eugene | 🟢 Right after submission | L6-R |
| Approve [PR #10](https://github.com/ASU-MICS-2028/cc-group-3-prosit-2/pull/10) (Lab 6 done, this README) | Anyone but Joseph | 🟢 Ready | — |

### Current stage: Lab 7, serverless reminders + a video call (due before the Week 8 exam; confirm the date on Canvas)

| Task | Who | Status | Waiting on |
|---|---|---|---|
| L7-A5 One appointment → both functions fire (evidence A, B). Live: `POST https://api-hc.agroconnect.space/appointments`; logs in `/aws/lambda/healthconnect-dev-reminders` and `…-specialist-notify` | Joseph | 🟢 Ready | — |
| D-023 Confirm hosting the call page on one server | Perfect | 🗳 Confirm | — |
| L7-R Lab 7 report: one paragraph each (serverless fit: Eugene · WebRTC and TURN: Perfect · resilience question: Elise), Joseph assembles | Joseph + all | ⛔ Blocked | L7-A5 |

### Still open from Lab 6, in our real system

| Task | Who | Status | Waiting on |
|---|---|---|---|
| L6-A1b The API's own least-privilege IAM role in Terraform | Eugene | 🟢 Ready | — |
| L6-B1b Customer-managed KMS key, `rds.force_ssl`, HTTPS-only bucket policy | Eugene | 🟢 Ready | — |
| L6-X Why the Lab 5 failover dropped requests | Eugene | 🟢 Ready | — |
| D-018 Vote: add "public-health reporting, anonymised totals only" as a fourth purpose | Everyone | 🗳 Vote needed | — |

### Getting ready for Lab 8 (peer review + midterm, Week 8)

| Task | Who | Status | Waiting on |
|---|---|---|---|
| L8-A1 HealthConnect architecture diagram incl. the event/serverless layer (start from `evidence/lab5/fig1-architecture.png`) | Perfect | 🟢 Ready | — |
| S8 Shared vocabulary (user roles, data resources) in `knowledge/` | Elise | 🟢 Ready | — |
| L8-X Teach-back: walk the others through your `learnings/` note | Everyone | 🟢 Ready | — |

**What to hand in for Lab 7, screenshot by screenshot:** the [Lab 7 deliverables checklist](./PLAN.md#lab-7-deliverables-checklist).

---

Everything else: [`PLAN.md`](./PLAN.md) (all stages, done and to come) · [`CONTRIBUTING.md`](./CONTRIBUTING.md) (how we work, repo map) · [`AGENTS.md`](./AGENTS.md) (for coding assistants).
**This page lists only what's open now.** When a task changes state, update it here and in `PLAN.md` in the same PR; remove it from here once it's done.
