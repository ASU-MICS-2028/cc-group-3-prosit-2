# E2 load test, E3 restore, L6-B1b: results (12 Nov 2026, Eugene)

All times UTC. Account 315224414532, af-south-1. Synthetic data only.

## E2: 1,000 users, 50,000 records

**Setup.** k6 2.3 on a temporary t3.medium in the HealthConnect VPC's public subnet (af-south-1a), calling
`https://api-hc.agroconnect.space` through the ALB like any phone would. 1,000 virtual users at once, each
registering 10 synthetic `LOADTEST` patients, each patient being 5 records sent to `/sync/push`
(Patient, Consent, 3 temperature readings): 1,000 × 10 × 5 = **50,000 records**. One sign-in
(`loadtest_chv`, a synthetic CHV). The per-address request limit was raised for the test only
(`api_rate_per_minute`, PR #90), because every request came from one machine; it was set back afterwards.
Script: [`E2-loadtest.js`](E2-loadtest.js). Raw output: [`E2-k6-output.txt`](E2-k6-output.txt), [`E2-summary.json`](E2-summary.json).

**Result (run 2, 01:01:08–01:06:13):**

| | |
|---|---|
| Requests sent | 50,001 in about 290 s (172 per second) |
| Stored (201) | **34,457 (68.9%)**, 118.6 records per second |
| Refused, database busy (503) | 10,864 (21.7%) |
| Refused, patient not stored yet (424) | 4,679 (9.4%): knock-on of a 503 on that patient's first record |
| Load balancer errors (ELB 5xx) | **0** |
| Upload time | median 5.0 s, p95 8.8 s, max 27.7 s |
| `/health` during the test (checked every 20 s) | 200 every time, 0.24–1.45 s |
| Auto scaling | 2 → **4** servers at 01:02:10, about a minute in |
| Peak CPU | API servers 26%, RDS 63% |
| Peak database connections | 40 (4 servers × 10) |

Status counts are from the app logs (CloudWatch Logs Insights) and agree with the ALB's counts.

**What limited it.** Not CPU, and not the database itself: the connection pool. Each API server keeps at
most 10 database connections and waits at most 5 s for one (`backend/src/db.ts`). With 1,000 users at
once, requests queued longer than 5 s and were answered 503 ("database unreachable: timeout exceeded when
trying to connect"). Nothing crashed and the service stayed up throughout; the phones' sync queue retries a
503 later, so in real use those records would arrive on the next attempt.

**What would fix it** (not done; not needed for the demo): a larger pool (for example 20 per server,
staying under db.t4g.micro's connection limit at 4 servers), a longer wait, or RDS Proxy; and a bigger
database class for sustained load.

**Run 1 (about 00:57–00:59, not counted):** a mistake in the script, not the system. The readings were sent
without the link to their consent, so the API correctly refused all 30,000 with 400 ("consent must be a
UUID"). Its 10,000 patients and 10,000 consents were stored. Output kept in
[`E2-k6-output-run1-script-bug.txt`](E2-k6-output-run1-script-bug.txt).

**Left in the database:** both runs' `LOADTEST` records (54,457 records; just under 20,000 patients). Deleting
is blocked by design (audit triggers), so they stay, named `LOADTEST …`, owned by `loadtest_chv`, which is
switched off. Only that account sees them in a patient list; admin and surveillance totals include them.

## E3: tested restore, with our own KMS key

[`E3-restore-log.txt`](E3-restore-log.txt). The live database was not touched.

| Step | Time |
|---|---|
| Copy the latest automated snapshot (`rds:healthconnect-dev-postgres-2026-11-11-02-05`, 20 GB) under a new customer-managed KMS key | **153 s** |
| Restore the copy as a new db.t4g.micro (`healthconnect-dev-restore-test`), same private subnets and security group | **487 s** (8 min 7 s) |
| Total, snapshot to a usable database | **about 10.7 minutes** |

The first restore call failed in 1 s (`--manage-master-user-password` isn't accepted on a snapshot
restore); the 487 s is the second call. Checked inside the restored copy: 10 migrations up to
`011_insurance.sql` and 2 patients, which is exactly what the database held at the snapshot time (012–014
came later that day); the connection was TLS. The restored instance and the copy were then deleted.

**Recovery point:** a snapshot restore loses what was written after the snapshot (up to 24 h with daily
snapshots). Point-in-time restore (backups are kept 7 days) narrows that to about 5 minutes; not tested.

## L6-B1b

| Item | State |
|---|---|
| `rds.force_ssl` | **1** (on; Postgres 16 default on RDS, `default.postgres16`). Connections without TLS are refused. |
| Customer-managed KMS key | **Created**: `alias/healthconnect-dev-rds` (key 545b67d7-…), customer-managed, yearly rotation on. **Proven on the restored copy** (encrypted with it). The live database still uses the AWS-managed `aws/rds` key: switching it means moving the app to a restored copy, which wasn't worth the risk on demo day. |
| HTTPS-only buckets | **Done** (PR #90): site and media buckets deny any request with `aws:SecureTransport = false`. Test: the same signed request works over HTTPS and gets `AccessDenied ... explicit deny in a resource-based policy` over HTTP. The live app still loads through CloudFront (200). |

## Lab 5: why the failover test dropped requests

Most likely the load balancer was still routing to the stopped server for a few seconds: the 5 failures
were `HTTP 000` (no answer within 15 s), not server errors, and they started the moment the target turned
"unused"; the rerun, which waited 30 s longer, got 9/10. Not proven (no ALB access logs were kept).
