# Labs feeding Prosit 2

Summaries of what each lab asks for, what to hand in, how it's graded, and what we learned about
it. The original lab documents are on Canvas and in the team Drive ([`workspace.md`](./workspace.md)).

**The file-by-file deliverables checklist for each lab, with who captures what, is in [`../PLAN.md`](../PLAN.md).**
This file explains what the labs ask for and what we've learned about them.

**Possibly also required:** the syllabus lists a weekly homework report next to each lab: a 500-word network architecture
proposal (Week 5), a security plan (Week 6), a serverless justification (Week 7), and a 1,000-word project design
milestone plus a 200-word peer review (Week 8). The lab handouts don't mention them; we're confirming with the facilitator (S3).

Reflection questions are not graded but count toward participation (5%). Homework extensions are
optional, but they help with the "innovation" and "autonomous learning" parts of the Prosit grade.

---

## Lab 5: VPC, load balancer and data residency (✅ submitted 22 Oct 2026)

Written as the AgroConnect (Prosit 1) wrap-up. **We do it on HealthConnect** (decision D-001).

| Part | Ask | Deliverable |
|---|---|---|
| A. VPC | 1 VPC; 2 public + 2 private subnets in 2 availability zones; internet gateway for public, NAT for private | Screenshot of the VPC + route-table proof (script output) that the database subnet has **no** direct internet route |
| B. DB + load balancer | DB in a private subnet (required). 2 instances of the service in the private app subnet; load balancer in the public subnet health-checking `/health` | Target health screenshots: both healthy, then one unhealthy after stopping it; `test_load_balancer.sh` output before and after |
| C. Data residency | One-page design: Ghana + one more country (Nigeria or Kenya); sharding key and structure; the specific data protection law per country and one concrete way we respect it; what still needs real legal review | One-page PDF (diagram + text) |
| D. Decommissioning | Inventory all AgroConnect resources in the cost tracker; stop what isn't needed for grading; delete unused NAT Gateways; check the other cloud accounts are empty; log this week's spend | Checklist screenshot or note + month-to-date spend |

**Report:** 300 words on the network setup and what changed; a consolidated architecture diagram with
public/private boundaries; links/screenshots (working PWA with offline demo, container registry,
load-balanced service, database); one honest retrospective paragraph. Single PDF.

**Rubric:** VPC segmented, DB not reachable 20% · LB with demonstrated failover 15% · residency design specific and legally grounded 20% · offline PWA end-to-end 15% · retrospective honesty 20% · decommissioning with honest spend 10%.

**Homework:** CDN before/after page load on "Slow 3G"; egress audit (outbound rules scoped to real destinations, not "allow all"); NAT Gateway vs NAT instance cost, 2 sentences; optional second-country DB plus one query that would need federation.

**What we know already:**
- The Prosit 1 Terraform already builds most of A and B ([`prosit-1.md`](./prosit-1.md)). Missing: the ASG runs 1 instance, but the failover demo needs 2; no route-table evidence captured yet.
- The usual cause of "all targets unhealthy" is that the instance security group doesn't allow traffic from the load balancer's security group.
- A **stopped RDS instance restarts by itself after 7 days**. Snapshot and delete, or set a reminder.

---

## Lab 6: IAM, encryption, FHIR schema, audit logging (due Saturday 25 Oct 2026)

**Real deadlines differ from the syllabus:** Lab 5 was due 22 Oct at 23:59 and Lab 6 is due 25 Oct. Check Canvas for Labs 7 and 8.

The first HealthConnect lab. HealthConnect must be a **separate codebase** from AgroConnect.

| Part | Ask | Deliverable |
|---|---|---|
| A. Least privilege | A new IAM role for the HealthConnect service only; a policy with only the actions it needs; attached via instance profile (no embedded keys); show one allowed and one denied action | Policy JSON + evidence of allow ✅ and deny ❌ |
| B. Encryption | Verify (don't assume) DB encryption at rest; enforce TLS on the API (HTTP rejected or redirected); S3 bucket encrypted and not public | Screenshots + `curl -v` output |
| C. FHIR-aligned schema | `patients`, `observations`, `access_log` tables shaped like FHIR resources; map each table to its FHIR resource; name one missing field (e.g., LOINC/SNOMED codes); **data minimisation pass**: one sentence per `patients` column justifying it under Act 843 | Schema file + mapping write-up |
| D. Audit logging | Log who accessed which patient record, when, and what they did | Query output showing populated audit rows |

**Report:** 300 words: IAM design and what it protects against; encryption at rest and in transit; FHIR decisions and what's missing; one ethics/consent point naming the **specific Act 843 principle** (data minimisation, purpose limitation, or right to be informed). Submit PDF + policy + schema + screenshots.

**Rubric:** least privilege (allow + deny) 25% · encryption verified 25% · FHIR schema with honest gaps 25% · audit logging 15% · ethics reflection 10%.

**Homework:** FHIR sandbox (AWS HealthLake / Azure Health Data Services / GCP Healthcare API) with a 150-word comparison; secrets rotation drill, timed (used in the Week 9 incident-response discussion); RBAC table for CHV / specialist / GHS official; read the Lambda "Getting Started" docs before Lab 7.

**What we know already:**
- The lab's sample policy uses `rds-data:ExecuteStatement`, which is the **Aurora Data API** and doesn't work with plain RDS PostgreSQL (what we use). Prove "allowed" with `secretsmanager:GetSecretValue` on our secret instead, and "denied" with `rds:DeleteDBInstance` or by reading AgroConnect's secret.
- The starter code has bugs worth fixing and writing about:
  - The audit table has a foreign key to `patients`, so logging a read of a patient that doesn't exist fails, and the request errors instead of returning 404.
  - The `x-user-id` header can be faked by anyone. Take the identity from the login session.
  - The data write and the audit write aren't in one transaction, so a record can change without a log entry.
  - `SERIAL` ids clash with offline clients that create records before syncing. Use UUIDs.
  - The app can edit or delete its own audit log. Make it append-only.
- If a scoped-down role breaks something, look up the exact denied action in CloudTrail and add only that one.
- Check whether HealthLake is even offered in `af-south-1`. If it isn't, that's a data residency point.

---

## Lab 7: serverless reminders + a telemedicine video call

| Part | Ask | Deliverable |
|---|---|---|
| A. Event-triggered function | A queue/topic `appointment-events`; `POST /appointments` saves the appointment and **publishes** `appointment.created` (no direct call); a function consumes it and sends or logs a reminder | Evidence of the whole flow: created → published → function triggered → reminder logged/sent |
| B. Second consumer | A second, independent function (specialist notify) reacting to the **same** event; neither knows about the other | Evidence both fired from one event |
| C. WebRTC call | Starter signaling server (Node WebSocket) + browser client with a public STUN server. Test on the same network, then across two different networks; throttle one side to Slow 3G; read real stats (packet loss, jitter, round-trip time) via `getStats()` or `chrome://webrtc-internals` | Screenshots C1 (same network), C2 (cross-network state), C3 (stats under throttling) + written notes quoting the numbers |

**Report:** 300 words: what we moved to serverless and one thing we deliberately didn't (and why); the cross-network result (did we need a TURN relay, and what that means for architecture and budget); one resilience question we still need to answer. Submit PDF + code snippets + screenshots/recording, **before the Week 8 exam**.

**Rubric:** event flow with 2 independent consumers 35% · WebRTC call tested under throttling 35% · report reasoning 30%.

**Homework:** dead-letter queue (break the function on bad input, show the message lands in the DLQ); idempotency (publish the same event twice, send only one reminder); TURN cost for 50 calls a day × 15 minutes (reused in Week 11).

**What we know already:**
- **Two functions on one SQS queue do not both get each message**; they compete, so each message goes to only one of them. "Both fire from one event" needs a topic that **fans out**: SNS → two SQS queues → one function each (decision D-010). EventBridge with two rules would also work.
- **Browsers only allow the camera on HTTPS pages** (or `localhost`). For the phone/cross-network test, the page and the signaling server must be served over `https://`/`wss://`, not a plain LAN IP.
- The starter client only has STUN. If the cross-network call fails, that **is** the finding: most mobile carrier NATs block direct connections, which is why production telemedicine budgets for TURN.
- The functions only log or send SMS, so they don't need to be inside the VPC (no NAT cost, faster start).
- Is the appointment saved if publishing the event fails? That's a good "open resilience question" for the report. The proper fix is an "outbox" table.
- No SMS sandbox? A logged reminder is acceptable; say so in the report. Prosit 1's SMS provider (Nalo, with Arkesel as fallback) is an option.

## Lab 8: peer review + midterm preparation

No new code. Paired with another team:

1. **Part A (30 min):** prepare a 5-minute walkthrough: diagram (client → API → data → security → event/serverless), one decision we're proud of, one known weakness.
2. **Part B (90 min):** Round 1, we present and they ask four questions in order: *Where does this break at 10× load? Where's the single weakest security link? What happens if the network drops mid-consultation or the DB is briefly unreachable? One open question.* Round 2: we review them with the same questions. Round 3: we revise our diagram to fix at least one gap.
3. **Part C (optional):** `pre_midterm_audit.sh` lists running compute on AWS, Azure and GCP; clean up anything forgotten (ask the team first).

**Deliverables:** screenshot B1 ("before" diagram with the gap circled) and B2 ("after" with the change highlighted and a one-line caption), plus a **200-word written peer review** of the other team (one strength, one risk, one question for their grading). One PDF per team naming the team reviewed, **by the end of Week 8**.

**Rubric:** our live questions 30% · our answers 30% · written feedback 30% · real revision 10%. 60% is live, so everyone has to be able to explain every part.

**Midterm (follows the lab):** the handout's checklist covers scalability vs elasticity vs fault tolerance; sketching a VPC from memory; SQL vs NoSQL for three datasets; least privilege plus one encryption-at-rest and one in-transit mechanism; when serverless is and isn't right; the three practice scenarios from the Week 8 lecture (fintech savings, logistics, e-commerce flash sale).

## After that

- **Week 9:** CI/CD pipeline and incident response (uses the secrets-rotation timing from Lab 6). The Lab 8 handout says this **completes Prosit 2**.
