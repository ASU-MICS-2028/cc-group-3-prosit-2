# Lab 8 rehearsal: simulated design review

**This is a simulation, not the Lab 8 session.** An AI agent wrote each section from that person's commits, PRs and notes on 9 November. No partner team took part, and the people named did not write this. It is practice for the live session and must not be submitted as the peer review.

Three of the four named `GET /patients/:id` as the weakest link, because it checks the role and not the relationship. Joseph's section named the call server's room-code join.

## As Eugene

I press on what was measured, what fails alone, and how far one failure reaches.

**1. 10x load.** Every sync write takes one global lock for its last step (`backend/src/routes/sync.ts:196`). Each server holds 10 connections (`backend/src/db.ts:70`), so four servers give 40, and writers waiting on that lock keep theirs. Reads then wait for a free connection and get a 503 after 5 seconds. Scale-out follows requests per server (`infra/modules/compute/main.tf`), so it adds waiters to the same lock. Is that measured? Not yet. E2 has no evidence on main, so this is a prediction.

**2. Weakest security link.** `GET /patients/:id` checks the role only (`backend/src/routes/patients.ts:31`). I gave the NAT box its own role so one break-in stays contained (L6-A1b). Here, one stolen CHV login reads every patient, and the log only tells us afterwards. Sync already checks the relationship. Why doesn't the oldest route?

**3. Network drop, database unreachable.** After a drop, the call waits 10 seconds and then ends (`frontend/src/call/engine.ts:60`, `:172`), with no ICE restart. On a weak signal, is 10 seconds enough? Records are safe: the phone queues them, and ids stop duplicates (D-011). The 5-second limit and 503 are good (`backend/src/db.ts:38`). But a new connection needs the password from Secrets Manager once its 5-minute cache expires (`backend/src/secrets.ts`), and with no VPC endpoints that path runs through one NAT instance. A booking whose SNS publish fails is never retried (`backend/src/routes/appointments.ts:112`).

**4. Open question.** The report calls the phone the system of record until it has a signal. Five wrong tries wipe the local store, and unsent records are lost (`frontend/src/data/wipe.ts`). RDS has backups. What is the recovery plan for a CHV's unsent visits, and who decided that loss is acceptable?

**Diagram gap.** I would draw the phone's encrypted store and send queue as a data store with its own sync path, because unsent patient data lives there and the diagram shows only a phone icon.

## As Elise

**1. 10x load.** I would press on sync, not the servers. In `backend/src/routes/sync.ts`, every write takes the same order lock (`LOCK_ORDER`) and holds it until commit. A doctor's first booking with a patient also renumbers that patient's older records while holding it, so one long history slows everyone's write. Each server has 10 connections (`backend/src/db.ts`), with at most four servers (`infra/main.tf`), and waiting writes hold those connections. A wait past the 15-second `statement_timeout` is code 57014, which `isDatabaseOutage` counts as an outage. Does a queue get reported as "database down", and do phones then retry into the same queue? I want a test that fails for that reason, not only a slow average.

**2. Weakest link.** `GET /patients/:id` (`backend/src/routes/patients.ts`) checks the role against `READERS` only. Any CHV, nurse, doctor, specialist or admin can open any patient. A CHV reading a stranger's record serves none of our stated purposes (D-018). The log shows misuse only afterwards. Who reads `access_log`, and how often?

**3. Network drop, database unreachable.** The call gets 10 seconds to recover (`RECONNECT_GRACE_MS`, `frontend/src/call/engine.ts`), then ends and offers a voice call. Rooms live in one server's memory (D-023). Records are safe on the phone. But a doctor can't issue a prescription without a signal (D-038). If the link goes as the visit ends, who follows up, and how does anyone know it was missed? With the database out, the API fails within 5 seconds (`db.ts`) and the phone retries safely by id. The same path has no queue for that prescription.

**4. Open question.** D-037 saves each record twice. `sync_records.resource` is a full, unredacted copy outside the change history (Finding 5, `docs/fhir-mapping.md`). When a patient withdraws consent, what should happen to that copy, and to copies already on CHV and doctor phones?

**Diagram gap.** I would draw `sync_records` inside the database box, labelled as a second full copy of patient records, because the diagram doesn't show it.

## As Perfect

**1. Where does this break under 10x load?**
The API tops out at four t3.micro servers, each aimed at about 8 requests a second (`infra/modules/compute/variables.tf`, `infra/main.tf`). Each has 10 database connections (`backend/src/db.ts`), all into one db.t4g.micro. The last step of every sync write takes one lock for the whole database (`backend/src/routes/sync.ts:196`). Picture it from the phone. After an outage, every CHV comes back at once, and each phone retries every 20 seconds with no random delay (`frontend/src/data/DataProvider.tsx:61`). That part is mine. Have you tested a wave, or only a steady load?

**2. Where is the single weakest security link?**
`GET /patients/:id` (`backend/src/routes/patients.ts:25`). It checks the role, not the relationship, so a signed-in CHV or clinician can open any patient by id. D-032 says the server decides what each person may see. Sync follows that rule. This route doesn't, and the log only shows misuse afterwards.

**3. What if the network drops mid-consultation, or the database is briefly unreachable?**
Sync is safe. The API fails within seconds with a 503, and the phone keeps its records (`OUTAGE_LIMITS`, `backend/src/db.ts:38`). Two things worry me. A booking is saved, then its event is published after the commit, with no outbox, so the reminder can be lost (`backend/src/routes/appointments.ts:112`). And a doctor can't prescribe without a signal, by choice (D-038, report section 4). So what does that doctor see during a 503, with the patient waiting? I would want to see that on a real phone, not only in a test.

**4. Open question**
A doctor's first visit renumbers the patient's older records, so they download again (`backend/src/routes/sync.ts:207`). On a 2G phone, how long does that first download take, and what is the doctor looking at meanwhile?

**The one gap I would change in the diagram:** draw the booking event's publish as a separate step after the commit, with a path showing the event lost when SNS can't be reached.

## As Joseph

**1. Where does this break under 10x load?**
The scaling rule worries me more than the servers. The group scales on requests per server, 500 a minute (`infra/modules/compute/variables.tf`). But the limit we expect is RDS, one db.t4g.micro (`infra/modules/database/variables.tf`). Each new server adds up to 10 more connections to it (`backend/src/db.ts`). Does scaling out make the real problem worse? Every phone also syncs every 20 seconds on a fixed timer (`frontend/src/data/DataProvider.tsx`). Our expectation is written down. Which run shows it? No E2 result is on main yet.

**2. Where is the single weakest security link?**
The call server. A join needs only a room code, with no token check (`webrtc-spike/src/server/app.ts`). Rooms hold two people (`rooms.ts`). So anyone with the code can listen in on the call setup, or take a seat first and block the visit. We say sign-in is checked on every request. That is true of the API, not of this.

**3. What if the network drops mid-consultation, or the database is briefly unreachable?**
A dropped call gets 10 seconds, then ends (`RECONNECT_GRACE_MS`, `frontend/src/call/engine.ts`). I see no ICE restart. What measurement on 2G chose 10 seconds? For the database, the API answers 503 with `Retry-After` (PR #55), but nothing in `frontend/src` reads that header. So do all the phones return at once? And #55 says plainly that a real RDS outage is not tested. E3 has to show that.

**4. Open question**
A CHV has been offline for days and mistypes their passphrase five times. D-031 says that wipes the phone, and unsent records are lost. Consent and vitals existed only there. Who would ever know those records existed, and what do you tell the patient?

**The one gap I would change in the diagram:** I would route the "publish", "read secrets" and "photos" arrows through the NAT instance, because `infra/modules/network/main.tf` sends both private subnets through that one t4g.nano in af-south-1a and there are no VPC endpoints, so losing it loses booking events from both zones.
