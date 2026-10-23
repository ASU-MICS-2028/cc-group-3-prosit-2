# backend/: patient-record-service

**Owner:** Joseph (backup reviewer: Elise). Plain-language note: [`../learnings/patient-record-service.md`](../learnings/patient-record-service.md).
Follow the root [`../AGENTS.md`](../AGENTS.md) first; this adds what's specific to the API.

## Commands

```bash
npm install          # Node 24+
npm test             # vitest; must stay green
npm run build        # TypeScript → dist/; must have no errors
npm run dev          # local, needs DATABASE_URL
docker build -t patient-record-service:local .
```

Local Postgres with our real schema (migrations from `../db/migrations/`):

```bash
docker run -d --name hc-pg -e POSTGRES_PASSWORD=localonly -e POSTGRES_DB=healthconnect -p 5432:5432 postgres:16-alpine
for f in ../db/migrations/*.sql; do psql "postgres://postgres:localonly@localhost:5432/healthconnect" -v ON_ERROR_STOP=1 -f "$f"; done
DATABASE_URL=postgres://postgres:localonly@localhost:5432/healthconnect INSTANCE_ID=local npm run dev
```

## Rules that the database or AWS will enforce on you

- **Every write runs in one transaction that first says who is acting:** `SELECT set_config('app.user_id', '<practitioner uuid>', true)`, then the writes, then the `access_log` row, then `COMMIT`, all on **one** client (`pool.connect()`). `pool.query()` alone loses the setting and the database refuses the write ("No acting user set"). ADR D-015.
- **The acting user comes from the verified login**, never from a request header such as `x-user-id` (anyone can forge a header).
- **Ids are UUIDs created by the client** (offline phones retry), so writes are `INSERT … ON CONFLICT (id)`. ADR D-011.
- **No `DELETE` endpoints** for observations, consents or logs: wrong readings are marked `entered-in-error`. ADR D-013.
- **Turn database refusals into clear HTTP errors:** withdrawn or missing consent → 403; double-booking (exclusion constraint) → 409; never a bare 500.
- **`trust proxy` stays `1`** (only the load balancer). `true` lets clients forge their IP into the audit log.
- **Never log request bodies:** they hold patient data.
- **`/health` must not touch the database** (the load balancer uses it); `/ready` does.

## Tests to write for every endpoint (the diverging paths)

Normal case · missing or invalid fields → 400 · unknown id → 404 (and still audited) · no or invalid login → 401 ·
wrong role → 403 · same request twice (idempotent: one row, no error) · consent missing or withdrawn → 403 ·
database down → 503 from `/ready`, a clean error from the endpoint · the audit row exists after each read and write.

## Deploying

The AWS app servers pull `healthconnect-dev-backend:<tag>` from ECR on boot. Building, pushing and rolling the fleet
is in [`../infra/README.md`](../infra/README.md). The image pins the **af-south-1** RDS certificate bundle: it won't
reach a database in another region.
