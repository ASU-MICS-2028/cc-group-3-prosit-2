# HealthConnect cloud infrastructure (S4, S5, Lab 5 A/B, Lab 7 L7-A1 and the call server)

**Owner:** Eugene · **Last updated:** 2026-10-26 · **Status:** working (HTTPS API, Lab 7 call server, Lab 7 event flow)

> Write this for a teammate who will never open your code or the AWS console for this part.

## 1. In one sentence

Everything HealthConnect runs on in AWS (network, load balancer, two app servers, private database, photo bucket,
alarms and budget, and the Lab 7 call server) is described as code in `infra/` and created with one command,
`terraform apply`.

**Addresses:** API `https://api-hc.agroconnect.space` · call page `https://call-hc.agroconnect.space`.

## 2. What I did, step by step

1. **Copied the Terraform modules from AgroConnect (Prosit 1)** into `infra/modules/` (D-002), then removed
   everything farm-specific: the SMS, payment, push-notification and admin secrets, and the Amplify frontend
   hosting (we have no frontend yet).
2. **Gave HealthConnect its own network:** VPC `10.30.0.0/16` (AgroConnect was `10.20.0.0/16`), every resource
   tagged `Project=healthconnect`, and its own Terraform state file (`healthconnect/dev/terraform.tfstate`) in the
   existing state bucket.
3. **Two app servers instead of one:** the auto scaling group now keeps at least 2 instances (max 4), so the Lab 5
   failover demo can stop one and the other keeps answering.
4. **Wired the servers to Joseph's API:** on boot each server pulls the `patient-record-service` image from ECR and
   runs it with `DB_HOST`, `DB_NAME`, `DB_SECRET_ARN` and `INSTANCE_ID`. `INSTANCE_ID` is new: it's what makes
   `/health` say *which* server answered.
5. **HTTPS (S5, 2026-10-23, D-022):** one AWS certificate (ACM) covers `api-hc.agroconnect.space` and
   `call-hc.agroconnect.space`. The load balancer speaks TLS 1.3 on port 443 and answers plain `http://` with a
   301 redirect to `https://`. The four DNS records live at Hostinger (where `agroconnect.space` is registered),
   **not** in Terraform: `api-hc` and `call-hc` point at the load balancer, and two `_…` records prove to AWS that we
   own the names so it issues the certificate.
6. **Added a CI check** (`.github/workflows/ci.yml`): every PR runs `terraform fmt` and `terraform validate`.
7. **Applied it** to the `ashesi-dev` AWS account on 2026-10-22: 66 resources. Verified: both servers healthy, 10/10 `/health` requests answered (5 by each server), `/ready` reaches the database.
8. **Lab 7 call server (D-023, `modules/call/`):** Perfect's `webrtc-spike/` (the video call page + the signaling
   server that introduces the two browsers) runs as a Docker image on **one** small server (`healthconnect-dev-call`,
   `t3.micro`, private subnet). The load balancer sends any request for `call-hc.agroconnect.space` there (a
   "host-header rule"); the WebSocket `wss://call-hc.agroconnect.space/ws` goes through the same way. It has its
   own IAM role that can only pull its image, write its logs and accept SSM sessions.
9. **Added a heartbeat to the signaling server** (`webrtc-spike/src/server/app.ts`): it pings every connection every
   25 s. The load balancer closes any connection that is silent for 60 s, and a caller waiting for the doctor is
   silent, so without this the doctor would join an empty room.
10. **Lab 7 event flow (L7-A1, D-010, `modules/events/`), 2026-10-26:** when the API books an appointment it
    publishes one `appointment.created` message to the SNS topic `healthconnect-dev-appointment-events`. SNS copies
    it into two SQS queues, `healthconnect-dev-reminders` and `healthconnect-dev-specialist-notify`. Each queue
    starts its own Lambda function (Joseph's Python code in `functions/`, zipped by Terraform). If a function fails on
    a message 3 times, the message moves to that queue's **dead-letter queue** (`…-dlq`) and stays there 14 days.
    Each function has its own role: it can read only its own queue and write only its own logs.
11. **API servers wired to it:** they now get `APPOINTMENT_TOPIC_ARN` and `JWT_SECRET_ARN`, and their role may publish
    to that one topic and read that one secret. The secret (`healthconnect-dev-jwt-secret`, the key that signs
    sign-in tokens, D-026) was created empty by Terraform and filled with a random 64-character value from the
    command line, so it's in neither git nor Terraform state. The API image was rebuilt from `main` (`f3ff4ee`) and
    rolled out with an instance refresh.
12. **Least privilege in our real system (L6-A1b), 2026-10-26:** the NAT box used to borrow the API servers' role,
    so it could read the database password and the sign-in key it never needs. It now has its own role that allows
    only SSM sessions. The API servers' role lost AWS's broad "read every image repository" policy and can now pull
    only `healthconnect-dev-backend`. Everything else it may do names exactly one resource: the database secret, the
    sign-in key secret, the appointment topic, its log group, the photo bucket, the image-tag parameter.
13. **One reminder per appointment (Elise's L7-H2, D-027), applied 2026-10-29:** a DynamoDB table
    `healthconnect-dev-reminders-sent` (pay per request, rows delete themselves after 30 days). Before sending, the
    reminder function writes the appointment id there with "only if it isn't there yet"; if it's already there, the
    reminder is skipped as `duplicate_skipped`. Only the reminder function's role may write to it. Checked live by
    publishing one event twice: one `reminder_logged`, one `duplicate_skipped` (`evidence/lab7/outputs_H2_dedup_after.txt`).
    Applied with `-target=module.events`, so the unconfirmed alarm emails weren't re-sent (see section 6).

## 3. Why we did it this way

- **One role per job (L6-A1b):** if a box is broken into, the attacker gets that box's permissions. A NAT box that
  can read the database password turns a network-box break-in into a data breach. Separate roles keep it contained.
- **Copy, don't rebuild:** Prosit 1's modules already pass Lab 5's network and database requirements and ran in
  production for weeks. Lab 6 asks for a separate codebase, so we copy rather than share.
- **NAT instance, not a NAT Gateway:** `fck-nat` on a `t4g.nano` costs about \$3/month; AWS's managed NAT Gateway
  costs about \$32/month. Trade-off: one instance, one AZ, no automatic failover.
- **HealthLake later (D-019):** HealthLake isn't offered in `af-south-1`. We build on our own Postgres now and add
  HealthLake for demo day.
- **Subdomains of `agroconnect.space` (D-022):** free, already ours, renewed until Oct 2027. A new domain would cost
  money for no lab benefit.
- **SNS → one SQS queue per function (D-010), not one shared queue:** two functions reading one queue would compete,
  so each event would reach only one of them. With SNS each gets its own copy, and the queue holds messages if a
  function is down. **Batch size 1:** a bad message fails alone instead of dragging good ones into its retries.
- **One call server, not two (D-023):** the signaling server remembers rooms in its own memory. With two servers, the
  patient and the doctor could be sent to different ones and never meet. A shared room store (e.g. Redis) would
  fix that but is too much for a lab spike.

## 4. How to check it works

You need the AWS CLI with the `ashesi-dev` profile.

```bash
cd infra
export AWS_PROFILE=ashesi-dev
terraform output api_url
curl -s "$(terraform output -raw api_url)/health"
# {"status":"ok","service":"patient-record-service","instance":"i-0..."}   (run it a few times: two different instance ids)
curl -s "$(terraform output -raw api_url)/ready"
# {"status":"ready",...}   (the database answers)
```

The database subnet has no route to the internet (Lab 5 Part A proof):

```bash
aws ec2 describe-route-tables --region af-south-1 \
  --filters Name=tag:Name,Values=healthconnect-dev-rt-data \
  --query 'RouteTables[].Routes[].[DestinationCidrBlock,GatewayId,NetworkInterfaceId]' --output table
# only 10.30.0.0/16 -> local. No 0.0.0.0/0 line.
```

HTTPS (Elise's L6-B2 evidence uses exactly these two):

```bash
curl -sv http://api-hc.agroconnect.space/health 2>&1 | grep -E "^< HTTP|^< Location"
# < HTTP/1.1 301 Moved Permanently
# < Location: https://api-hc.agroconnect.space:443/health
curl -sv https://api-hc.agroconnect.space/health 2>&1 | grep -E "SSL connection|subject:|^< HTTP"
# * SSL connection using TLSv1.3 ...   subject: CN=api-hc.agroconnect.space   < HTTP/2 200
```

Call server (signaling only; the real video tests are Perfect's L7-C2 to C4):

```bash
curl -s https://call-hc.agroconnect.space/health          # {"status":"ok"}
cd webrtc-spike && npm install
node ../evidence/lab7/signal-smoke.mjs wss://call-hc.agroconnect.space/ws   # 5 x PASS
node ../evidence/lab7/idle.mjs wss://call-hc.agroconnect.space/ws           # PASS after 90 s idle
```

Recorded run: `evidence/lab7/outputs_C_signaling_hosted.txt`.

Event flow (publish straight to the topic, no API needed):

```bash
T=$(terraform -chdir=infra output -raw appointment_topic_arn)
aws sns publish --topic-arn $T --message "$(cat functions/fixtures/appointment-created.json)"
aws logs tail /aws/lambda/healthconnect-dev-reminders --since 5m           # "outcome": "reminder_logged"
aws logs tail /aws/lambda/healthconnect-dev-specialist-notify --since 5m   # "outcome": "specialist_notified"
# A bad message (try '{"type":"appointment.created","appointmentId":"x"}') fails 3 times, ~1 minute apart,
# then shows up in the DLQ:
aws sqs get-queue-attributes --queue-url "$(terraform -chdir=infra output -json event_dlq_urls | jq -r .reminders)" \
  --attribute-names ApproximateNumberOfMessages
```

Recorded run (both functions from one event; bad event in both DLQs): `evidence/lab7/outputs_A1_event_infra.txt`.

Least privilege (L6-A1b): 10 allow/deny checks with AWS's policy simulator, which evaluates the roles' real policies
without doing anything:

```bash
bash evidence/lab6/check_least_privilege.sh     # every line should end in PASS
# API  ecr:BatchGetImage   call image repo  -> implicitDeny  PASS   (can pull only its own image)
# NAT  secretsmanager:GetSecretValue  DB password secret -> implicitDeny  PASS
```

"implicitDeny" means no policy allows it, so AWS refuses. Recorded run: `evidence/lab6/outputs_A1b_least_privilege.txt`.

**Test data on RDS** (synthetic only, D-004; seeded 26 Oct for L7-A5, written as the `system` account and the CHV so the
audit trail shows who added what):

| Who | Role | UUID | Notes |
|---|---|---|---|
| Ama Test-Mensah | CHV (can book) | `8b7102c5-4ad6-4074-88f0-a04746d7fdee` | Mint test tokens for this id |
| Dr. Kofi Test-Asante | specialist | `c8bde890-8d3d-4142-9499-61008fe5bd4a` | Use as `specialist_id` |
| Abena Test-Owusu | patient | `09954463-b029-4bf4-b723-3c5cd4ac49c0` | `+233200000011`, **has** reminder consent: her bookings carry the phone, the reminder is logged |
| Yaw Test-Boateng | patient | `457f46b5-14b2-4933-acdd-d1cda1bf2c6d` | `+233200000012`, **no** reminder consent: the reminder function logs "skipped" |

Calling a protected route on AWS: sign a token as in [`patient-record-service.md`](./patient-record-service.md) §4, with
the key from Secrets Manager (`aws secretsmanager get-secret-value --secret-id healthconnect-dev-jwt-secret`).
A token for a practitioner who isn't in RDS gets **"This account is not active"**: that answer proves the servers read
the right key (a wrong key gets "invalid or has expired").

Running the database migrations: see "Running database migrations" in [`infra/README.md`](../infra/README.md).

**Merging a PR does not update AWS.** Every change is shipped by hand until the Week 9 deploy workflow exists. The
exact commands for each part (API, call page, Lambda functions, migrations, Terraform) are in "Shipping a change" in
[`infra/README.md`](../infra/README.md). The one trap: our Macs are ARM and the servers are x86, so images must be
built with `--platform linux/amd64`.

## 5. What is NOT done, or is faked

- **Use the names, not the load balancer's AWS address.** The raw `…elb.amazonaws.com` address now redirects to
  HTTPS, and the certificate doesn't cover that name, so browsers and `curl` will reject it.
- **No automatic deploys.** Every image is built and pushed by hand (section 4b). The API now runs `main` at
  `f3ff4ee` (PR #11). Merging a PR does **not** update the servers. The deploy workflow comes with Week 9 (CI/CD).
- **Migrations are run by hand** through an SSM tunnel; the service doesn't migrate the database on boot. Done once on
  2026-10-22: `001`–`003` applied to RDS (8 tables). On 2026-10-26 they were recorded in Elise's `schema_migrations`
  logbook with `db/migrate.sh --baseline 003`, so from now on `db/migrate.sh` (through the tunnel) applies only new ones.
- **Two permissions can't be narrowed.** `ecr:GetAuthorizationToken` must be allowed on `*` (AWS's rule); it only
  issues a login, and the pull permissions decide which repository that login can read. And all servers keep AWS's
  `AmazonSSMManagedInstanceCore` policy, which is what lets us open SSM sessions and tunnels.
- **No encryption build yet** (customer-managed KMS key, forced TLS on RDS, HTTPS-only bucket policy): L6-B1, now
  unblocked. The fourth L6-B1 item, the HSTS header (tells browsers "only ever use HTTPS here"), is already sent by
  the API (`strict-transport-security: max-age=31536000; includeSubDomains`, from `helmet` in `backend/`).
- **The call server has no TURN relay** (on purpose, see `learnings/lab7-webrtc.md`) and no login. Anyone with the
  address and a room name can join. Test rooms only, never patient data.
- **The call image was built and pushed by hand** (`webrtc-spike/Dockerfile`, tag `latest` + git SHA; live: `248ea83`
  since 26 Oct, after Perfect's PR #15 didn't show up because nobody had redeployed). To ship a
  change: rebuild, push, then `terraform apply -replace='module.call[0].aws_instance.call'` (about 4 minutes of
  downtime).

## 6. What will bite us

- **It costs money while it runs:** about \$70–90/month (ALB ~\$19, three `t3.micro` ~\$28, RDS ~\$16, NAT ~\$3,
  plus public IPs and CloudWatch). The budget alarm emails everyone at \$50 forecast and \$100 actual. **Tear the call
  server down after Lab 7:** set `call_hostname = ""` in `terraform.tfvars` and apply.
- **The sign-in key is set by hand.** If the secret is ever recreated it comes back **empty**, and every protected
  API route answers 401 until the value is put again (`infra/README.md`, "Sign-in token key"). Changing it signs
  everyone out.
- **Messages in a DLQ just sit there for 14 days.** Nothing alerts on them yet. One test message (`not-a-uuid`) is in
  each DLQ from the 26 Oct check; leave it for the L7-H1 screenshot, then purge it.
- **Lambda code changes need a `terraform apply`:** Terraform re-zips `functions/` and updates both functions when the
  files change.
- **Never stop a `terraform apply` half-way.** On 26 Oct one was stopped: AWS had already made 9 resources that
  Terraform didn't know about, and Terraform stayed locked. Re-running it would have failed ("already exists"). The fix:
  check no apply is still running, `terraform force-unlock`, then `import` the 9 so Terraform owns them again.
- **Deleting an Aurora database is two steps.** Deleting the *instance* leaves the *cluster*, which keeps billing for
  storage until it's deleted too. Seen in the Lab 6 teardown in `us-east-1`.
- **Behind a load balancer, a connection with no traffic for 60 s is cut.** That's why the call server pings every
  25 s. Anything else that keeps a connection open (e.g. a future live dashboard) needs the same.
- **Images are built on our laptops, and a full disk breaks the build.** Docker (OrbStack) crashed twice at 96% disk.
  Keep 20 GB free; `docker builder prune -af` clears only the build cache.
- **A brand-new DNS name can fail for a minute** while it spreads. Retry before debugging.
- **DNS is outside Terraform.** If the load balancer is ever destroyed and recreated, its address changes and the
  `api-hc` / `call-hc` records at Hostinger must be updated by hand. If the certificate is recreated, the two `_…`
  validation records change too (`terraform output cert_validation_records`).
- **Every `terraform plan` may show the launch template changing.** That's Canonical publishing a newer Ubuntu image;
  only servers launched afterwards use it. Harmless.
- **Everyone on the alarm list must click "Confirm subscription"** in the AWS email, **within 3 days**. AWS deletes
  unconfirmed email subscriptions after 3 days, silently: on 26 Oct only Elise's had survived, and the next
  `terraform apply` re-created the other three and sent new emails.
  It happened again on 29 Oct (Perfect's, Joseph's and Eugene's had lapsed), so the L7-H2 apply used
  `terraform apply -target=module.events` to change only the event flow. `-target` is for that kind of
  one-off; the next full apply will still re-send the three emails, so confirm them that day.
- **`terraform destroy` deletes the database with no final snapshot** (lab setting). Fine for synthetic data.
- **Instances give up pulling the image after about 90 seconds.** If ECR is empty when they boot, they come up
  without the app, fail health checks, and the auto scaling group replaces them until an image exists.
- **The state bucket is called `agroconnect-tfstate-…`.** That's not a mistake: it's shared with Prosit 1, under a
  different key.

## 7. Terms used

| Term | Plain meaning |
|---|---|
| Terraform | A tool that creates cloud resources from text files, so the setup is repeatable and reviewable |
| VPC | Our own private network inside AWS |
| Subnet | A slice of the VPC. Public subnets can reach the internet directly; private ones can't |
| NAT | Lets private servers make outgoing internet calls (e.g. to download updates) without being reachable from outside |
| ALB (load balancer) | The single public entry point; it spreads requests over the healthy app servers |
| Target group / health check | The list of app servers behind the ALB; the ALB calls `/health` on each and stops sending traffic to any that fail |
| ASG (auto scaling group) | Keeps a set number of servers running and replaces any that die |
| RDS | AWS's managed Postgres database |
| ECR | AWS's store for our Docker images |
| SSM | AWS Systems Manager; lets us open a session on a server without SSH keys or open ports |
| State file | Terraform's record of what it created, so the next run knows what to change |
| ACM certificate | A free AWS certificate that lets the load balancer speak HTTPS for our names |
| CNAME record | A DNS entry saying "this name is an alias of that name" (e.g. `api-hc…` → the load balancer) |
| Host-header rule | A load balancer rule that picks where to send a request by the name the browser asked for |
| WebSocket (`wss://`) | A connection that stays open so the server can push messages; the call page uses it for signaling |
| SNS topic | A broadcast channel: everything published to it is copied to every subscriber |
| SQS queue | A waiting line of messages; a consumer takes one, and deletes it only when it has handled it |
| Dead-letter queue (DLQ) | Where a message goes after failing too many times, so it doesn't block the line or get lost |
| Lambda function | Code AWS runs only when something triggers it (here, a message arriving); billed per millisecond |
| Heartbeat (ping/pong) | A tiny message sent every 25 s so idle connections aren't cut by the load balancer |
| Least privilege | Every role gets only the permissions its job needs, on the specific resources it uses |
| Policy simulator | An AWS tool that answers "would this role be allowed to do X on Y?" without doing it |
| Instance refresh | The auto scaling group replacing its servers one by one with fresh ones (new image, new settings) |
| State lock | A marker that stops two people running `terraform apply` at once; a crashed apply can leave it behind |
| `import` (Terraform) | Telling Terraform "this thing already exists in AWS, it's yours now", instead of creating it again |
| Cross-compiling (`--platform linux/amd64`) | Building an image for the servers' x86 chips on an ARM Mac |

## 8. Lines ready for the report

HealthConnect runs in its own VPC (`10.30.0.0/16`) in `af-south-1`, split into public, private-app and
private-data subnets across two availability zones. Two app servers sit behind a load balancer that health-checks
`/health`, and the Postgres database lives in data subnets with no route to the internet, reachable only from the
app servers' security group. All of it is Terraform, reused from Prosit 1 and adapted for health data.
The API is served only over HTTPS (TLS 1.3, ACM certificate for `api-hc.agroconnect.space`); plain HTTP is redirected.
For Lab 7, the call page and its signaling server run on a single dedicated server behind the same load balancer,
because the server keeps call rooms in memory, and it pings each connection every 25 s so the load balancer's
60-second idle limit doesn't drop a waiting patient.
Booking an appointment publishes one event to an SNS topic, which copies it into two SQS queues, each triggering its
own Lambda function (a reminder and a specialist notification). Neither function knows about the other or the API,
each has its own least-privilege role, and a message that fails three times is kept in a dead-letter queue instead of
being lost or retried forever.

**Serverless fit (paragraph for the Lab 7 report, about 150 words):**

> We moved the work that follows a booking to serverless: the patient's appointment reminder and the specialist's
> notification. The API publishes one `appointment.created` event to an SNS topic, which copies it into a separate SQS
> queue for each Lambda function, so the two never compete for the same message and neither knows the other or the API
> exists. A message that fails three times is parked in a dead-letter queue instead of being lost. This work is short,
> occasional and can wait a few seconds: in our live run each function did 1–20 ms of work using at most 32 MB, and it
> costs nothing while idle. We deliberately kept the patient-record API on two always-on servers behind the load
> balancer. Every request needs a fast answer and a database transaction with its audit row, and those stay simpler in
> one long-running service than in functions that often start cold (4 of our 9 runs per function did).

Numbers behind it: one event in, two copies out (SNS: 3 messages published and 6 delivered, 0 failed, in the 21:00 UTC
hour of 26 Oct); both log groups per appointment in `evidence/lab7/outputs_B_logs.txt`; durations, memory and cold
starts from each function's `REPORT` log lines (9 runs each, 26 Oct, including the 3 failing runs of the deliberate bad
message).
