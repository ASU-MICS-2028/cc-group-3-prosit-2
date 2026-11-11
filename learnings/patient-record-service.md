# patient-record-service (the HealthConnect API)

**Owner:** Joseph · **Last updated:** 2026-10-26 · **Status:** live on `https://api-hc.agroconnect.space`; 7 paths checked there on 26 Oct (`evidence/lab7/outputs_A_create_appointment.txt`)

## 1. In one sentence

The web server in `backend/` that health workers' apps talk to: it checks who is calling, books appointments, shows
patient records, and writes down every access, while the database's own rules make sure nothing slips through.

## 2. What it does now

| Endpoint | Who may call it | What it does |
|---|---|---|
| `GET /health` | anyone (the load balancer) | "Am I running?" and which server answered. Never touches the database |
| `GET /ready` | anyone | Also checks the database answers |
| `POST /appointments` | signed-in CHV, nurse, doctor, specialist, admin | Books an appointment, then announces it (Lab 7) |
| `GET /patients/:id` | signed-in CHV, nurse, doctor, specialist, admin; a patient for their own record only | Shows one patient, and records the read (Lab 6) |
| `POST /auth/login` | anyone | Username and password in; sign-in token (1 hour) and refresh token (30 days) out |
| `POST /auth/refresh` | anyone with a refresh token | Swaps it for a new pair. Each one works once |
| `POST /auth/logout` | anyone with a refresh token | Ends that sign-in |
| `GET /auth/me` | signed in | Who am I, with the app's role name |
| `POST /sync/push` | signed-in CHV, nurse, doctor, specialist; a patient for their own bookings | The phone sends one changed record |
| `GET /sync/pull?since=N` | signed in | Downloads what this person may see, changed after bookmark N |
| `GET /sync/taken?specialist=&from=&to=` | anyone who can send records | A doctor's booked times, with no patient details |
| `POST /prescriptions` | doctor or specialist, for a patient with a visit with them | Issues a prescription, runs the fraud checks |
| `POST /prescriptions/verify` | pharmacist | Checks a code or scanned QR. Changes nothing |
| `POST /prescriptions/:id/dispense` | pharmacist, with the patient's code | Hands it over, once |
| `POST /prescriptions/:id/cancel` | the prescriber | Cancels an unused one |
| `GET /prescriptions/mine` | prescriber, patient, pharmacist | Their own list |
| `GET /pharmacies` | signed in | The sandbox pharmacy list |
| `POST /payments` | a patient for themselves; a CHV or nurse for their patient | Starts a payment; the amount is set by the server |
| `GET /payments/:id`, `GET /payments/mine` | whoever started it, the patient; an admin for one by id | The outcome, and receipts |
| `POST /webhooks/votex365` | votex365, with a valid signature | Tells us how a payment ended |
| `GET /admin/users`, `POST /admin/users/:id/activate`, `/deactivate` | platform admin | Who has access; switch an account on or off |
| `GET /admin/audit?outcome=&before=` | platform admin | Who did what, 50 at a time, and sign-in counts |
| `GET /admin/revenue` | platform admin | Successful payments, with simulated money kept apart |

Built in five steps (25 Oct), each tested before the next:

1. **`withTransaction(user, work)`** (`src/db.ts`). Every write happens inside one database transaction that first
   tells the database who is acting (`app.user_id`). Elise's schema refuses any write without that, and stamps the
   user on every row. If anything inside fails, everything is undone.
2. **Knowing who's calling** (`src/auth.ts`). A request must carry `Authorization: Bearer <token>`: a token we sign
   (a JWT) that names a practitioner. We check the signature, the expiry, and that the practitioner exists and is
   **active**, on every request. We never trust a header like `x-user-id`, which anyone can fake (ADR D-026).
3. **`POST /appointments`** (`src/routes/appointments.ts`). Saves the appointment and its audit row together, as the
   signed-in user. Then publishes `appointment.created` to SNS. The patient's phone goes in that message **only if
   they consented to reminders** (D-014).
4. **The two Lambda functions** (`functions/`): the reminder and the specialist notice, each triggered by its own queue.
5. **`GET /patients/:id`** (`src/routes/patients.ts`). Every attempt is logged: found, unknown, malformed id, wrong
   role, or not signed in.

### Signing in (J1, 7 Nov)

**For Perfect (P2):** send `POST https://api-hc.agroconnect.space/auth/login` with `{"username": "...", "password": "..."}`.
The reply is `{ token, refreshToken, expiresIn, user: { id, name, role, facility?, patientId? }, mode: "live" }`, and `user.role`
is already the app's name. Send `Authorization: Bearer <token>` on every call. When a call answers 401, send
`{"refreshToken": "..."}` to `POST /auth/refresh`, and save the **new** pair. The old refresh token is now dead, and using it
twice signs that person out everywhere, so never retry it blindly. The app's `signIn(userId)` will need a password field.

**The eight test sign-ins:** the username is the app's role name (`chv`, `patient`, `clinician`, `pharmacist`, `healer`,
`ghs`, `facility_admin`, `platform_admin`). Same ids and names as the app's demo accounts, except that the patient's login is
`...0012` and their record is `...0002`. The password isn't in the repo. Joseph shares it in the group.

**For Eugene (E1), in this order on RDS:** `db/migrate.sh`, then, through the same tunnel,
`DATABASE_URL=... TEST_USER_PASSWORD=<12+ characters> npm run seed:test-users`. Merging this PR before that is safe: the old
routes keep working, and `/auth/login` answers 500 until the tables exist.

**How it's protected:**

- **Passwords** are stored as scrypt hashes (`src/passwords.ts`). Scrypt is built into Node and is slow on purpose, so guessing is costly.
- **Five wrong passwords** lock the account for 15 minutes. A wrong password and an unknown username get the same answer, in about the same time.
- **Refresh tokens** are stored only as a hash and work once. If a used one comes back, someone has a copy, so all that person's sign-ins end.
- **The role in the token is only for the app.** The API looks the role up in the database on every request, so a role change or a deactivation works at once.
- **Role names** are translated in one place, `src/roles.ts`. The API's own checks use database names.
- **CORS** (telling browsers which websites may call us) allows only `https://app-hc.agroconnect.space`. Add a laptop with `CORS_ORIGINS=http://localhost:5173`. It doesn't replace sign-in.
- **Every attempt** goes in `login_events`, which can't be changed afterwards.
- **Rate limit:** 60 calls to `/auth` per minute from one address, per server, using `express-rate-limit`. **Eugene: a load test from one machine needs `AUTH_RATE_PER_MINUTE` raised, or it logs in once per test user beforehand.**
- **Rate limit on everything else:** 600 calls a minute from one address, per server (`API_RATE_PER_MINUTE`), added 9 Nov after CodeQL flagged every signed-in route. `/health` and `/ready` are above it, so the ALB is never refused. **Eugene: raise it, and `AUTH_RATE_PER_MINUTE`, for the load test.**

**Not done:** a phone that loses the reply to a refresh has to sign in again. No password reset or self-service change yet (a re-seed resets test users). The lock is per account, not per IP, so someone could lock a known username on purpose.

**Check it:** `TEST_DATABASE_URL=postgres://postgres:test@localhost:55432/postgres npm test` in `backend/`. Evidence: `evidence/final/J1-login-roles.txt`.
### If the database is unreachable (7 Nov)

A connection attempt gives up after 5 seconds, and a query after 15. The API then answers **503** with `Retry-After: 15`, not a hang and not a 500. `/health` stays 200 on purpose: the servers are fine, and pulling them all from the load balancer would only turn "no database" into "no API". `/ready` answers 503. **Perfect:** treat a 503 from sync as `NetworkError`, so the phone keeps its records and tries again.

### Real sync (J2, 7 Nov)

**For Perfect (P2):** these three match `SyncApi` in `frontend/src/data/sync.ts`. An adapter only has to add the token and read the JSON:

| Call | Answer |
|---|---|
| `POST /sync/push` with the app's `PushRequest` | The body is always a `PushResult`, whatever the status: 201 or 200 `ok`, 200 `duplicate`, 409 `conflict` (with the server's copy), 424 `retry`, or 400/403/409/422 `rejected` with a `reason` |
| `GET /sync/pull?since=N` | `{ items, cursor, more }`, the app's `PullPage`. 100 records at a time |
| `GET /sync/taken?specialist=&from=&to=` | `[{ start, end }]` |

Treat a 401 as "refresh and try again", and a network failure as `NetworkError`. New rejection reasons to add to `REJECTED` in `syncScreens.tsx`: `consent-withdrawn`, `refused-by-rules`, `unknown-specialist`, `forbidden`, `invalid`. `slot-taken` is already there.

**How it works:** each record is saved twice in one transaction. The exact copy goes in `sync_records`, and the proper table (`patients`, `consents`, `observations`, `appointments`) gets its row, so Elise's rules still refuse a withdrawn consent, a typing error or a double booking. If either save fails, neither stays.

**Who can see what:** a person sees what they sent. A CHV also sees their own patients' records. A doctor, nurse or specialist also sees the records of patients with a visit booked with them. A patient sees their own. Pharmacists, healers, GHS officials and admins get nothing here. The server decides this; the app only displays it. The same rule stops someone overwriting a patient who isn't theirs, or seeing that patient through a conflict reply.

**Two traps it avoids:**

- **Skipped records.** Downloads use a running number as a bookmark. If record 6 is saved before record 5 finishes, a phone could read past 5 and never get it. So the last step takes a lock until COMMIT, and numbers can only appear in order. That one step is one-at-a-time; if the load test shows pushes queuing there, this is the first place to look.
- **A doctor's first visit with a patient.** The patient's older records were numbered before the doctor's bookmark, so the doctor would never get them. The first booking numbers them again. Other phones get them again too, and ignore them because the version hasn't changed.

**Not done:**

- `POST /appointments` still works but doesn't write to `sync_records`, so a phone won't download a visit booked that way.
- Photos and voice notes are stored inside Postgres (up to 4 MB per request), until SVC-2 moves them to S3.
- The app's "village" is stored in `patients.region`.
- Field-level encryption on the server isn't built. RDS encrypts the whole disk; the phone encrypts its own copy.

**Check it:** `TEST_DATABASE_URL=postgres://postgres:test@localhost:55432/postgres npm test` in `backend/`. Evidence: `evidence/final/J2-sync.txt`.

### Prescriptions (FB-6, 7 Nov)

**A prescription, start to finish:** the doctor issues it. The patient gets an 8-digit code and a QR. The pharmacist types or scans it, sees what to hand over, and presses Dispense. A second dispense is refused, even two at the same moment, because Elise's database trigger decides.

**Why the code is safe to read out:** verifying changes nothing, dispensing needs the code as well as the id, and all of it is rate-limited and logged. The QR also carries a signature, so an altered one is refused. It holds no patient data.

**Fraud checks.** These raise flags rather than blocks, because a patient can really need the same medicine twice. A pharmacist can't dispense until they've ticked that they've read them, and we record who did.

| Flag | When |
|---|---|
| `duplicate` | The patient already has an unused prescription for this medicine |
| `repeated` | 3 or more for this medicine in 30 days |
| `prescriber_rate` | More than 20 from one prescriber in an hour |
| `unlicensed` | The prescriber has no valid licence in our **test** register |

**What isn't real:** the licence register and pharmacy list are our own test data, because we have no access to GMDC or a pharmacy network. The thresholds are illustrative; no regulator has reviewed them. The report says so.

**The screens** are in `frontend/src/screens/prescriptions.tsx`. They use `rxApiFor(session)` in `frontend/src/data/prescriptions.ts`: the real API when `session.mode` is `live`, otherwise a test-mode stand-in with the same rules. **Perfect:** nothing extra to do; P2's `mode: "live"` switches them over. Test-mode prescriptions stay on that device, so a code from one phone won't verify on another until then.

**Shared images:** there's no separate path. A photo the CHV takes is compressed on the phone and goes through sync, and the doctor's phone downloads it once the patient has a visit with them. The viewer is `clinician.images`. Zoom is a tap to enlarge, then the phone's own pinch. **Not built:** comparing two images side by side.

**Not done:**

- Issuing and dispensing need a signal, because the fraud checks need the server. A CHV's records work offline; a prescription doesn't.
- Scanning uses the phone's own QR reader (`BarcodeDetector`), found on Chrome for Android but not iPhones. Typing the code always works.
- `/prescriptions/mine` doesn't log a read for each list view. Issuing, verifying and dispensing are all logged.

**Check it:** `npm test` in `backend/` and `frontend/`. Evidence: `evidence/final/FB-6-api.txt`, `FB-6-*.png`.

### Payments (SVC-4, 7 Nov)

**How a payment works:** the app sends what's being paid for, the network and the number. The server sets the amount. With a votex365 key, the reply has a `checkoutUrl`, where the person approves it. votex365 then calls our webhook, and we check its signature. If the webhook doesn't come, asking `GET /payments/:id` checks with votex365. **Without a key, every payment is simulated** and the reply says `simulated: true`: pending for 3 seconds, then successful, or failed at once for a number ending in 0000.

**To turn on real test mode:**

1. Eugene or Joseph puts `{ "api_key", "webhook_secret" }` for votex365's **test** keys in Secrets Manager.
2. Set `VOTEX_SECRET_ARN` on the API servers, and let their role read that secret.
3. In votex365's dashboard, set the webhook to `https://api-hc.agroconnect.space/webhooks/votex365`.

Until then, nothing has been tested against the real votex365. The client is the Prosit 1 code, tested here against a stand-in.

**Rules that protect money:**

- The amount never comes from the caller. The fee is in `routes/payments.ts`, and the example prices are illustrative.
- The same id is the same payment, so a retry can't charge twice. A second fee for one visit, under a new id, is refused by a unique index, even two at once. A failed try doesn't count.
- A finished payment can't change, and what it was for and how much can't be edited. The database enforces both.
- The phone's word never settles a payment; only votex365's signed webhook or their status reply does.
- We don't store the phone number. votex365 needs it for the payment; we don't.
- If votex365 is down, the API answers 503 and keeps the payment. A retry opens the checkout.

**Screens:** `patient.pay` is in `frontend/src/screens/payments.tsx`. `PayForm` also takes premiums. **Perfect:** this covers the fee screen in your FB-4b; use `PayForm` if you need it elsewhere. Live mode needs P2, as with prescriptions.

**Not done:** refunds. A CHV paying on someone's behalf has no screen yet (the API allows it).

**Check it:** `npm test` in `backend/` and `frontend/`. Evidence: `evidence/final/SVC-4-api.txt`, `SVC-4-*.png`.

### Platform admin (FB-10a, 7 Nov)

**What it does:** lists users, switches accounts on and off, shows the audit log, and shows revenue. Switching an account off works at once, because every request checks the account; their refresh tokens end too. An admin can't switch off their own account.

**What an admin can't see:** health records. The audit log gives who, what kind of record, and the outcome, with a patient only as an id. `GET /patients/:id` still lets an admin in, so that's a gap to close.

**Revenue:** only successful payments count, and simulated money is shown apart, so test money can't pass as income.

**Not done:** adding a user from the screen (use the seed script), editing a role, and settings, which is still a display. The Roles screen describes the design, and it says so: healer and facility limits aren't built, and `GET /patients/:id` isn't limited to a person's own patients. In test mode the audit rows are samples, also labelled.

**Check it:** `npm test` in `backend/` and `frontend/`. Evidence: `evidence/final/FB-10-admin-*.png`.

### Insurance (FB-9a, 8 Nov)

**Built:** the patient's `patient.insurance` screen (`frontend/src/screens/insurance.tsx`) and its API (`backend/src/routes/insurance.ts`, migration `011_insurance.sql`). Everything but the plan list is for patient logins only, and the patient comes from the login:

- `GET /insurance/plans`, `GET /insurance/mine` (an enrolment, or `null`)
- `POST /insurance/enrol` with `{ plan_id }`: joins or changes plan, keeping the same enrolment id
- `POST /insurance/nhis-check` with `{ member_number }`: a pretend register. An 8-digit number ending in 0 is expired, in 9 is unknown, anything else is active. The number isn't stored.
- `POST /payments` with `purpose: "insurance_premium"` and the enrolment id as `subject_id`: the price comes from the plan. Premiums can repeat, one per payment id.

The insurance tables were taken out of E-M part 2 and are `011`, so `010` stays free for the rest of it.

**What isn't real:** the plans, the prices and the NHIS check. We have no insurer as a partner and no access to NHIS.

**Community programmes and forecasts (FB-7b).** `src/routes/community.ts` (surveys, `/maternal`, `/decision-support/symptoms`) and `GET /surveillance/forecast`. Every route checks role and, for patient data, `canReach`; maternal reads and writes are in `access_log` under `Patient`. Survey results are totals only. Decision support stores nothing; `src/symptomRules.ts` is copied byte for byte to `frontend/src/data/symptomRules.ts` for test mode, and a test fails if they drift. **Not done:** SMS reminders (nothing is sent; the app says so); the rules and visit timings are unreviewed.

## 3. Why it works this way

- **The database is the last line of defence.** Even if the API had a bug, Postgres would still refuse a write with no
  user, a double-booking, or a deleted log row. The API's job is to turn those refusals into clear answers.
- **Ids come from the phone**, because CHVs work offline and resend when the connection returns. Sending the same
  booking twice gives back the same appointment (200), not a duplicate.
- **Events are sent after the save, not before**, so nobody is told about an appointment that was rolled back.
- **Fail closed:** with no signing key configured, the server still starts (so `/health` keeps the load balancer
  happy), but every protected request is refused.
- **Sign-in tokens, not a login screen yet** (D-026). The PWA's login comes later; for now `npm run token` makes a token.

## 4. How to check it works

```bash
cd backend && npm install
docker run -d --name hc-test-pg -e POSTGRES_PASSWORD=test -p 55432:5432 postgres:16
TEST_DATABASE_URL=postgres://postgres:test@localhost:55432/postgres npm test   # expect: 34 passed
cd ../functions && python3 -m unittest -v                                       # expect: 10 OK
```

Without `TEST_DATABASE_URL` the database tests are skipped (and say so). In CI they're required: CI fails if they'd be skipped.

Try it by hand (API running locally with `JWT_SECRET` set):

```bash
TOKEN=$(JWT_SECRET=<same secret> npm run -s token -- <practitioner uuid>)
curl -s -X POST localhost:8000/appointments -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"id":"<new uuid>","patient_id":"<uuid>","specialist_id":"<uuid>","starts_at":"2026-11-02T10:00:00Z"}'
# 201 {..., "event":"published"} · same again → 200 · same slot, same specialist → 409 double_booked
```

**What the tests try** (the key ones were also checked by breaking the code on purpose and watching them fail):
a missing, unknown or inactive user; forged, expired, wrong-key and unsigned tokens; rollback on error; one request's
user never leaking into the next; double-booking; the same booking sent twice; an id reused for a different booking;
SNS being down; no reminder consent; bad input naming the field; malformed JSON; the audit log can't be deleted; and
that the API and the Lambda functions agree on the event's fields (`functions/fixtures/appointment-created.json`).

## 5. What is NOT done, or is faked

- **No login screen.** Tokens come from `npm run token`.
- **If SNS is down, the event is lost**: the booking is kept and the caller is told (`"event":"not_published"`), but
  nothing retries it. The proper fix is an "outbox" table. This is the open resilience question for the Lab 7 report.
- **No "create patient" or "record a reading" endpoints yet**, so test patients are added with SQL.

## 6. What will bite us

- **Settings it needs on AWS:** `DB_HOST`, `DB_SECRET_ARN`, `DB_NAME`, `INSTANCE_ID` (as before), plus:
  - `JWT_SECRET_ARN`: a Secrets Manager secret holding `{"secret": "<at least 32 random characters>"}`. Without it, every protected route answers 401.
  - `APPOINTMENT_TOPIC_ARN`: the SNS topic from Lab 7 (L7-A1). Without it, bookings save but no event goes out.
  - The server's IAM role must allow `secretsmanager:GetSecretValue` on that secret and `sns:Publish` on that topic, and nothing more.
- **Lambda functions** (`functions/`): handlers `reminder_function.handler` and `specialist_notify_function.handler`,
  Python 3.12. Zip each with `events.py` beside it. They read SNS→SQS messages with or without "raw message delivery".
  A bad message raises, so SQS retries it and then moves it to the dead-letter queue; keep the batch size at 1, or one bad
  message makes its whole batch retry.
- **Events can arrive twice.** Every retried booking publishes the event again, on purpose: that is how a lost event gets
  recovered. Seen live on 26 Oct (Abena's booking, sent twice, gave two reminders). SQS can also redeliver. The functions must tolerate duplicates (Elise's L7-H2).
- **The image pins the af-south-1 RDS certificate bundle**; it won't reach a database in another region.

## 7. Terms used

| Term | Plain meaning |
|---|---|
| Transaction | A group of database changes that all happen, or none do |
| JWT (token) | A small signed note saying "this is practitioner X, valid until Y"; we can check we signed it |
| Fail closed | When something is missing, refuse rather than let people in |
| Idempotent | Doing the same thing twice has the same effect as doing it once |
| SNS / SQS | AWS's "announce to many" service, and its "queue for one reader" service |
| Dead-letter queue | Where SQS puts a message that keeps failing, so it isn't lost |

## 8. Lines ready for the report

The HealthConnect API identifies every caller from a signed token checked against active practitioners, and runs
each write in one transaction that tells the database who is acting, so the database's own triggers stamp and audit
every change. Booking an appointment saves it and its audit record atomically, refuses double-bookings, survives
offline retries, and then publishes one event that two independent serverless functions consume.

## Referrals and emergencies (FB-5, SVC-7, `backend/src/routes/referrals.ts`)

- **Priority** is worked out by the server from danger signs and vitals (`suggestPriority`), with the reason stored. A person can change it, except that a suggested emergency can't be lowered. The rules are illustrative, like the prescription thresholds.
- **Escalation** is computed on read: every emergency request first runs `settle()`, as the system account, which steps up any unacknowledged emergency (every 5 minutes, to level 3) and records one `care_events` row per level, stamped with the time it fell due. With no reader the level catches up on the next read. Level 0 is nurses at the facility and the patient's own doctors; 1 is doctors there; 2 is the facility admin; 3 is GHS. Raising the level is what lets the next group see it, on the server.
- **Who can act:** a referral belongs to its sender and receiver only. Acknowledge needs a responder who isn't the person who raised it. An emergency with no facility recorded is visible to all nurses, because `practitioners.facility_id` isn't filled in everywhere yet.
- **Accepting a referral** opens the patient's record to that doctor, re-numbering older records so their phone downloads them.


## FB-9b: healers and stock (`routes/healersStock.ts`)
Consent is recorded first through the normal sync (a `healer_referral` Consent), then `POST /healer-referrals` looks it up on the server; withdrawing it hides the referral from the healer at once. A healer sees only the patient's name and the reason. The directory comes from the seed script (`npm run seed:test-users`), synthetic and labelled; only Nana Yaw has a sign-in, so referrals to the other two entries go nowhere. Stock is per facility, taken from the account (`practitioners.facility_id`), never from the request. The low-stock alert is in the app only: nothing is sent by SMS or SNS.
