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

## 3. Why we did it this way

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

Calling a protected API route (what L7-A5 does). There's no login screen yet, so you sign a token yourself with
the same key the servers use. The token must name a practitioner that exists **and is active** in RDS:

```bash
cd backend && npm install
export JWT_SECRET=$(aws secretsmanager get-secret-value --secret-id healthconnect-dev-jwt-secret \
  --query SecretString --output text | jq -r .secret)       # never paste this anywhere
TOKEN=$(npm run -s token -- <practitioner uuid> 30m)
curl -s -X POST https://api-hc.agroconnect.space/appointments \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{...}'
```

How to read the 401s: `"Sign in first"` = no token sent · `"Your session is invalid or has expired"` = wrong key or
expired · `"This account is not active"` = the key is right but that practitioner isn't in RDS (or isn't active).
The last one is a useful check that the servers really read the key from Secrets Manager.

Running the database migrations: see "Running database migrations" in [`infra/README.md`](../infra/README.md).

## 4b. How to ship a change (until the Week 9 deploy workflow exists)

Images are built on a laptop and pushed to ECR. Our Macs are ARM; the servers are x86, so always pass
`--platform linux/amd64` (an ARM image starts and then crashes on the server with "exec format error").

```bash
export AWS_PROFILE=ashesi-dev
R=315224414532.dkr.ecr.af-south-1.amazonaws.com
aws ecr get-login-password --region af-south-1 | docker login -u AWS --password-stdin $R
SHA=$(git rev-parse --short HEAD)       # build from an up-to-date main
```

| What changed | Ship it with |
|---|---|
| `backend/` (the API) | `docker buildx build --platform linux/amd64 -t $R/healthconnect-dev-backend:latest -t $R/healthconnect-dev-backend:$SHA --push backend`, then `aws autoscaling start-instance-refresh --auto-scaling-group-name healthconnect-dev-asg --preferences '{"MinHealthyPercentage":100,"MaxHealthyPercentage":200,"InstanceWarmup":180}'`. No downtime: new servers start before old ones stop (~8 min). |
| `webrtc-spike/` (call page) | Same build with `healthconnect-dev-call` and `webrtc-spike`, then `terraform -chdir=infra apply -replace='module.call[0].aws_instance.call'` (~4 min down: one server). |
| `functions/` (Lambda) | `terraform -chdir=infra apply`. Terraform re-zips the files and updates both functions. |
| `db/migrations/` | `db/migrate.sh` through the SSM tunnel ([`infra/README.md`](../infra/README.md)). |
| `infra/` | `terraform plan`, read all of it, get the owner's OK, then `apply`. |

After any of these: `curl -s https://api-hc.agroconnect.space/health` a few times (both instance ids should appear).

## 5. What is NOT done, or is faked

- **Use the names, not the load balancer's AWS address.** The raw `…elb.amazonaws.com` address now redirects to
  HTTPS, and the certificate doesn't cover that name, so browsers and `curl` will reject it.
- **No automatic deploys.** Every image is built and pushed by hand (section 4b). The API now runs `main` at
  `f3ff4ee` (PR #11). Merging a PR does **not** update the servers. The deploy workflow comes with Week 9 (CI/CD).
- **Migrations are run by hand** through an SSM tunnel; the service doesn't migrate the database on boot. Done once on
  2026-10-22: `001`–`003` applied to RDS (8 tables). On 2026-10-26 they were recorded in Elise's `schema_migrations`
  logbook with `db/migrate.sh --baseline 003`, so from now on `db/migrate.sh` (through the tunnel) applies only new ones.
- **The API servers' role is only partly least-privilege.** Its secrets, topic, bucket and log permissions name
  exactly one resource each, but it's still shared with the NAT instance and has AWS's broad ECR read policy. Lab 6's
  least-privilege role (L6-A1) was built and demonstrated in a separate lab environment (D-024), not here. The Lambda
  functions and the call server already have roles of their own.
- **No encryption build yet** (customer-managed KMS key, forced TLS on RDS, HTTPS-only bucket policy): L6-B1, now
  unblocked. The fourth L6-B1 item, the HSTS header (tells browsers "only ever use HTTPS here"), is already sent by
  the API (`strict-transport-security: max-age=31536000; includeSubDomains`, from `helmet` in `backend/`).
- **The call server has no TURN relay** (on purpose, see `learnings/lab7-webrtc.md`) and no login. Anyone with the
  address and a room name can join. Test rooms only, never patient data.
- **The call image was built and pushed by hand** (`webrtc-spike/Dockerfile`, tag `latest` + git SHA). To ship a
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
- **An interrupted `apply` leaves things half-made.** On 26 Oct an apply was stopped part-way: AWS had created 9
  resources that Terraform's state didn't know about, and the state stayed locked. Fix used: `terraform force-unlock`
  (only after checking no apply is still running), then `import` blocks to adopt the 9 resources, then apply.
  Never re-run apply blindly after an interruption: it fails on "already exists", or creates duplicates.
- **DNS is outside Terraform.** If the load balancer is ever destroyed and recreated, its address changes and the
  `api-hc` / `call-hc` records at Hostinger must be updated by hand. If the certificate is recreated, the two `_…`
  validation records change too (`terraform output cert_validation_records`).
- **Every `terraform plan` may show the launch template changing.** That's Canonical publishing a newer Ubuntu image;
  only servers launched afterwards use it. Harmless.
- **Everyone on the alarm list must click "Confirm subscription"** in the AWS email, **within 3 days**. AWS deletes
  unconfirmed email subscriptions after 3 days, silently: on 26 Oct only Elise's had survived, and the next
  `terraform apply` re-created the other three and sent new emails.
- **`terraform destroy` deletes the database with no final snapshot** (lab setting). Fine for synthetic data.
- **Instances give up pulling the image after about 90 seconds.** If ECR is empty when they boot, they come up
  without the app, fail health checks, and the auto scaling group replaces them until an image exists.
- **The state bucket is called `agroconnect-tfstate-…`.** That's not a mistake: it's shared with Prosit 1, under a
  different key.

## 6b. Mistakes we made, so you don't

Each one cost time once. Each has a rule now.

| What happened | What we do now |
|---|---|
| **An `apply` was stopped half-way** (26 Oct): 9 resources existed in AWS but not in Terraform's state, and the state stayed locked. | Never stop an apply. If one is interrupted: check no `terraform` process is still running, `terraform force-unlock <id>`, then adopt the stragglers with `import` blocks (or delete them by hand) before applying again. Don't just re-run `apply`. |
| **Unconfirmed alarm emails expired** after 3 days; we'd have missed every alarm. | Confirm the AWS email the day it arrives. |
| **Deleting the Aurora *instance* didn't delete the *cluster*** (Lab 6 teardown, `us-east-1`, 26 Oct): the instance was deleting while the cluster still showed "available". A cluster stays, and bills for its storage, until it's deleted itself. | Tearing down Aurora takes two deletions: the instance(s), then the cluster. Check with `aws rds describe-db-clusters`. |
| **Local Docker (OrbStack) crashed in the middle of image builds**, twice, with the Mac's disk 96% full. | Keep 20+ GB free. `docker builder prune -af` clears only the build cache (safe). Build in the foreground, so you see where it fails. |
| **`main` moved while a PR was open, and we rebased and tried to force-push.** The force-push was (rightly) blocked: it rewrites commits teammates may have pulled. | Bring `main` into your branch with `git merge origin/main`, fix conflicts, push normally. No force-push on shared branches. |
| **"Peeking" at a dead-letter-queue message counts as receiving it** (its receive count went from 3 to 4). | Peek with `--visibility-timeout 0` so it stays visible, and read counts knowing your own peeks add to them. |
| **The load balancer cut idle WebSockets after 60 s**, so a waiting caller vanished from the room. Found by asking how the spike behaves behind an ALB, before anyone tested on phones. | Long-lived connections behind an ALB need a heartbeat shorter than 60 s (or a longer idle timeout). |
| **The first `/health` check through the new HTTPS name came back empty**, right after the DNS records were added. It worked seconds later. | New DNS names take a minute to resolve everywhere. Retry before debugging. |

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
