# patient-record-service (the HealthConnect API), first version (S10)

**Owner:** Joseph · **Last updated:** 2026-10-20 · **Status:** working (health checks only; no patient routes yet)

## 1. In one sentence

A small web server, in `backend/`, that will become HealthConnect's API for patient records. Right now it only answers two
"are you alive?" questions, which is exactly what the load balancer (Lab 5) needs.

## 2. What I did, step by step

1. Built a Node.js + TypeScript + Express server, copying the structure of the Prosit 1 API (same config, logging and database code, minus everything farm-specific).
2. Added two endpoints:
   - `GET /health`: always answers `{"status":"ok", "instance":"<which machine>"}` while the process is running. The load balancer calls it every few seconds to decide if this machine is healthy. The `instance` field shows **which** machine answered, which is what the Lab 5 failover demo needs.
   - `GET /ready`: also checks the database with `SELECT 1`. It answers 200 if the database is reachable, 503 if not.
3. Wrote 4 automated tests (`backend/test/health.test.ts`): `/health` names the instance; `/ready` is 200 with a working DB and 503 with a broken one; unknown paths give a JSON 404.
4. Wrote a `Dockerfile` that builds a small production image. It includes the AWS certificate bundle, so the connection to the RDS database is encrypted **and** checks it's really talking to RDS.

## 3. Why we did it this way

- **Copied from Prosit 1, not written from scratch:** that code is already tested and running in production. Lab 6 says to reuse patterns, not the codebase (D-002).
- **The instance name comes from the `INSTANCE_ID` environment variable**, which the EC2 start-up script already sets in Prosit 1's Terraform. If it isn't set (e.g., on a laptop), the machine's hostname is used instead.
- **`/health` doesn't touch the database:** if the DB has a hiccup, we don't want the load balancer to kill every app instance at once. `/ready` is the one that checks the DB.

## 4. How to check it works

Tests and build (needs Node 24+):

```bash
cd backend
npm install
npm test        # expect: 4 passed
npm run build   # expect: no errors, a dist/ folder
```

Run the real container against a throwaway local Postgres (needs Docker running):

```bash
cd backend
docker build -t patient-record-service:local .
docker network create hc-dev
docker run -d --rm --name hc-pg --network hc-dev -e POSTGRES_PASSWORD=localonly -e POSTGRES_DB=healthconnect postgres:16-alpine
docker run -d --rm --name hc-api --network hc-dev -p 8000:8000 -e INSTANCE_ID=i-local-demo \
  -e DATABASE_URL=postgres://postgres:localonly@hc-pg:5432/healthconnect patient-record-service:local
curl localhost:8000/health   # {"status":"ok","service":"patient-record-service","instance":"i-local-demo"}
curl localhost:8000/ready    # {"status":"ready","instance":"i-local-demo"}
docker stop hc-pg            # now /ready answers 503 "unavailable", /health stays 200
docker stop hc-api; docker network rm hc-dev
```

Verified on 2026-10-20 with exactly these commands.

## 5. What is NOT done, or is faked

- No patient endpoints, no login, no audit log yet. Those are L6-D1.
- **No transaction helper yet, and every write will need one.** Elise's schema (`db/migrations/`) refuses any write unless the
  same transaction first runs `SELECT set_config('app.user_id', <who>, true)`. `pool.query()` may send each statement
  on a different connection, losing that setting. So L6-D1 starts by adding `withTransaction(actorId, fn)` to `db.ts`:
  one connection, `BEGIN` → set the user → the writes + the `access_log` row → `COMMIT`. (From Elise's review of PR #2.)
- The service doesn't run the migrations itself yet. For now, apply them with Elise's `db/tests/run_tests.sh` setup.
- Not deployed to AWS yet. That's L5-B2, after Eugene's VPC and database.
- No CI job runs these tests yet. `.github/` is Eugene's; a "backend tests" job is worth adding alongside S4.

## 6. What will bite us

- **Settings it needs on AWS** (Eugene, for L5-B2): `DB_HOST` (RDS endpoint), `DB_SECRET_ARN` (the RDS secret), `DB_NAME` (default `healthconnect`), `INSTANCE_ID`, `PORT` (default 8000). `DB_CA_FILE` is already set inside the image. Locally, `DATABASE_URL` replaces the first three.
- **The service refuses to start without database settings.** That's deliberate: better a clear error at boot than mystery 500s later.
- **On EC2 the container needs the instance's IAM role** to read the DB secret. That only works if the metadata hop limit is 2, which Prosit 1's launch template already sets. Keep that line when copying the compute module.
- The ALB health check path must be `/health`, port 8000.

## 7. Terms used

| Term | Plain meaning |
|---|---|
| Endpoint | A URL the server answers, e.g. `/health` |
| Load balancer (ALB) | The AWS front door that spreads requests across our machines and stops sending to any machine whose `/health` fails |
| Liveness / readiness | "Is the program running?" vs "Can it actually do its job (reach the DB)?" |
| Container / Docker image | The app packaged with everything it needs, so it runs the same on a laptop and on EC2 |
| RDS CA bundle | AWS's certificates; checking against them proves we're talking to the real database over an encrypted connection |

## 8. Lines ready for the report

The HealthConnect API is a containerised Node.js/TypeScript service reusing the patterns of our Prosit 1 API. It exposes a
liveness check (`/health`, which reports which instance answered) for the load balancer, and a readiness check (`/ready`) that
also verifies the database connection. Database connections use TLS verified against the RDS certificate authority.
