# Lab 8 peer review

## L8-A2: 5-minute walkthrough script

**Presenter:** Joseph · **On screen:** `docs/architecture-healthconnect.png` · **Length:** about 650 words, 5 minutes at a calm pace.
Follow the diagram top to bottom: client → API → data → security → events. Point at each layer as you name it.

### 0:00 The problem (30 s)

> HealthConnect Ghana lets community health workers in rural areas record patients, book specialist
> appointments and start video consultations. Two things shape everything: the signal is poor, and this is health
> data, so Ghana's Data Protection Act, Act 843, applies. Everything you see runs on AWS in Cape Town,
> `af-south-1`, the closest region to Ghana, across two Availability Zones.

### 0:30 Client layer (40 s)

> At the top are the clients. The health worker's app is a web app, served from S3 and CloudFront, that works
> offline: records are saved on the phone, encrypted, and sent when the signal returns. Video calls run in the browser with WebRTC. Our servers only
> help the two browsers find each other; the video itself goes directly between them. That keeps our costs flat and
> the video out of our hands. A TURN relay, for networks that block direct calls, is dashed because we haven't
> built it yet.

### 1:10 API layer (50 s)

> Everything comes in over HTTPS through one load balancer. It's the only thing in the public subnets, apart from a
> small NAT instance for outbound updates. Behind it, in private subnets, two API servers run the same container
> image, one in each Availability Zone. An auto-scaling group keeps at least two running and adds up to four when
> requests per server rise. If one zone goes down, the other keeps answering. Next to them is the call server, which
> only does call setup.

### 2:00 Data layer (30 s)

> The database is PostgreSQL 16 on RDS, in its own private subnets with no route to the internet at all. Only the API
> servers can reach port 5432. It's encrypted at rest, and the tables are shaped like FHIR, the health-data
> standard, so we can move to a proper health data store later.

### 2:30 Security layer (30 s)

> Security runs across every layer: TLS on all traffic, a separate IAM role per component with only the permissions
> it needs, passwords and signing keys in Secrets Manager rather than in code, and security groups that only open
> the ports each part needs. Every caller signs in and is identified by a signed token, the server checks their role
> on each request, and every read and write of patient data is logged.

### 3:00 Event layer (40 s)

> When an appointment is booked, the API publishes one event to SNS. SNS gives each consumer its own SQS queue: one
> for the patient's reminder, one to notify the specialist. Each queue triggers its own Lambda function. If a
> message fails three times, it moves to a dead-letter queue instead of being lost. Because events can arrive twice,
> the reminder function records each appointment in a DynamoDB table first, so a patient never gets two reminders.

### 3:40 The decision we're proud of (40 s)

> **The database is the last line of defence.** Each write runs in one transaction that first tells Postgres who is
> acting. Database triggers then refuse any write with no user, stamp that user on the row, and write an audit entry
> that can't be edited or deleted. Double-booking a specialist is blocked by a database constraint. So even if our API
> has a bug, the database still refuses the bad write and keeps the record of who did what. For health data under
> Act 843, we didn't want that guarantee to depend on every line of application code being right.

### 4:20 The weakness we haven't solved (30 s)

> **An event can be lost.** We save the appointment first, then publish the event. If SNS is unreachable at that
> moment, the booking is kept and the caller is told, but nothing retries the event, so that patient gets no
> reminder. The fix is an "outbox": write the event into the database in the same transaction, and have a
> separate process send it. We know the fix; we haven't built it.

### 4:50 Close (10 s)

> That's HealthConnect. We'd like your four questions.

## L8-A3: our answers to the four questions

Each answer gives the honest position first, then the fix. Short enough to say out loud. **Status of what's mentioned:** sign-in, sync and the database timeouts are in PRs #53, #54 and #55; say "built, going live this week" if they aren't live on the day.

### 1. Where does this break at 10× load?

_Eugene leads. Add the measured numbers from E2 here._

Joseph's part, for the API: **the database breaks first, not the servers.** The API servers scale from two to four, but RDS is one small instance, and each server holds up to 10 connections. Sync's last step also takes one lock so that download bookmarks can't skip a record, so writes go through it one at a time. If E2 shows a queue, that lock and the connection limit are where to look first. The fix: read replicas for downloads, and a connection pooler such as RDS Proxy.

### 2. Where's the single weakest security link?

_Joseph and Eugene._

**Any CHV or clinician can open any patient by id.** `GET /patients/:id` checks the role, not whether this is their patient. It's logged, so misuse would be visible, but only afterwards. The new sync routes do check this, so the fix is to apply the same rule here, with a logged "break-glass" override for emergencies.

If they push further:

- **One signing key.** Every token is signed with one shared secret. If it leaked, someone could sign in as anyone. It's in Secrets Manager, and the servers never log it. Rotating it signs everyone out, which is acceptable.
- **The token is in the browser's `localStorage`,** so a script injection in the app could read it. The one-hour expiry limits the damage, and the database checks the account on every request.
- **Test accounts share one password.** Fine for synthetic data only (D-034, D-036); it couldn't go near real patients.
- **Eugene:** add the status of `rds.force_ssl` and the customer-managed KMS key (L6-B1b).

### 3a. What happens if the network drops mid-consultation?

_Perfect and Joseph._

**The call:** the video goes directly between the two phones, so our call server going away doesn't end a call that's already running. If the path between the phones drops, the app says "Connection lost. Trying to reconnect" and waits; if it doesn't come back, it ends the call in plain words and offers a voice call. On a weak signal it drops to audio only by itself.

**The records:** nothing is lost. Everything is saved on the phone first and goes in a queue. When the signal returns, the phone sends it oldest first. If a reply was lost and it sends the same record twice, the server sees the same id and the same data, and answers "already stored". If someone else changed the record meanwhile, the server answers with a conflict and a person chooses; nothing is silently overwritten.

**What we haven't solved:** a call can't resume from where it stopped once it has ended, and without a TURN relay some mobile networks can't connect at all. In our tests every call connected directly, but those were few.

### 3b. What happens if the database is briefly unreachable?

_Elise and Joseph._

**For the health worker, almost nothing.** The app works offline, so they keep recording, and the phone retries later. **The API** gives up on a connection after 5 seconds and answers 503 with a "try again" hint, rather than hanging. `/health` stays up on purpose, so the load balancer doesn't remove healthy servers and turn "no database" into "no API". `/ready` shows the real state.

**No write half-happens.** Each write is one transaction with its audit row, so it's all saved or nothing is. Retries are safe: the phone resends with the same id (D-011), so nothing is saved twice, and a repeated reminder is skipped (D-027). And when the database is back, consent and audit rules still apply, because they're in the database, not the app.

**The honest limit:** RDS is in one Availability Zone (`multi_az = false`), to keep costs down. The API survives losing a zone; the database doesn't. If the zone is lost, we restore from a backup, which takes minutes and can lose recent writes, though the phones still hold what they queued. Multi-AZ is the fix, at about twice the database's cost. _Eugene adds the restore time from E3._

### 4. What questions are still open?

- **Event loss:** a booking is saved, then its event is published. If SNS is down at that moment, nobody retries it, and that patient gets no reminder. Fix: an outbox table.
- **Clinical rules:** our thresholds are illustrative. No medical partner has signed them off.
- **Sign-off under Act 843:** we've designed for consent, audit and data minimisation, but no one with legal authority has reviewed it. We use synthetic data only.
- **TURN:** not built, and we don't yet know how often real networks need it.
- **Patient fingerprint:** a design only, because a shared phone can't support it.

### Likely follow-ups, with short answers

| They ask | We say |
|---|---|
| Why not microservices? | One week, one team, low traffic. Sixteen services means sixteen pipelines for no gain now. The features are separate route modules, so they can be split later (D-035) |
| Why Cape Town? | The closest AWS region to Ghana. Act 843 needs a cross-border justification, and that's in the report |
| Why PostgreSQL rather than NoSQL? | Consent and audit rules need transactions and constraints in one place. DynamoDB is used where it fits, for reminder deduplication |
| Why WebRTC? | Video doesn't pass through our servers, so costs stay flat and the content stays out of our hands |
| How do you stop two people booking the same slot? | A database exclusion constraint. Two phones booking at the same moment can't both win, and we've tested that |
| Is your data real? | No. It's synthetic, and any figures are shaped by published DHS regional numbers (D-034) |

## Our questions for the partner team

Same four, in order, then follow up on whatever they say. Each person takes notes, because Elise's 200-word review (one strength, one risk, one question) comes from them, and it must cite their actual design.

| # | Ask | Then push on |
|---|---|---|
| 1 | Where does this break at 10× load? | Which part fails first, and how do you know: measured, or a guess? What happens to a request while it's failing? |
| 2 | Where's your single weakest security link? | Can one signed-in user open another user's record? Show us where that's checked. Where do secrets live, and how would you rotate one? |
| 3a | What happens if the network drops mid-consultation? | What does the user see? Is anything typed so far lost? What if the same request arrives twice? |
| 3b | What happens if the database is briefly unreachable? | Does a request hang, or fail fast? Could a write half-happen? Is your database in one zone or two, and how long does a restore take? |
| 4 | What's still open? | Which of those would you fix first with one more week? What did you measure, rather than assume? |

**Also listen for:** a load balancer health check that touches the database, a public database or subnet, secrets in code, no audit of who read what, and costs nobody has tracked.

## L8-B1: notes from the session

_To fill in during the lab._
