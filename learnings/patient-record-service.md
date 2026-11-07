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

**Not done:** a phone that loses the reply to a refresh has to sign in again. No password reset or self-service change yet (a re-seed resets test users). The lock is per account, not per IP, so someone could lock a known username on purpose.

**Check it:** `TEST_DATABASE_URL=postgres://postgres:test@localhost:55432/postgres npm test` in `backend/`. Evidence: `evidence/final/J1-login-roles.txt`.

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
