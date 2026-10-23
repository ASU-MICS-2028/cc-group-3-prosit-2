# HealthConnect cloud infrastructure (S4, Lab 5 Parts A and B)

**Owner:** Eugene · **Last updated:** 2026-10-23 · **Status:** working (HTTPS on `api-hc.agroconnect.space`; Lab 7 call server on `call-hc.agroconnect.space`)

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

## 3. Why we did it this way

- **Copy, don't rebuild:** Prosit 1's modules already pass Lab 5's network and database requirements and ran in
  production for weeks. Lab 6 asks for a separate codebase, so we copy rather than share.
- **NAT instance, not a NAT Gateway:** `fck-nat` on a `t4g.nano` costs about \$3/month; AWS's managed NAT Gateway
  costs about \$32/month. Trade-off: one instance, one AZ, no automatic failover.
- **HealthLake later (D-019):** HealthLake isn't offered in `af-south-1`. We build on our own Postgres now and add
  HealthLake for demo day.
- **Subdomains of `agroconnect.space` (D-022):** free, already ours, renewed until Oct 2027. A new domain would cost
  money for no lab benefit.
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

Running the database migrations: see "Running database migrations" in [`infra/README.md`](../infra/README.md).

## 5. What is NOT done, or is faked

- **Use the names, not the load balancer's AWS address.** The raw `…elb.amazonaws.com` address now redirects to
  HTTPS, and the certificate doesn't cover that name, so browsers and `curl` will reject it.
- **No automatic deploys.** The image in ECR was built and pushed by hand from Joseph's PR #2 branch. The deploy
  workflow comes with Week 9 (CI/CD).
- **Migrations are run by hand** through an SSM tunnel; the service doesn't migrate the database on boot. Done once on
  2026-10-22: `001`–`003` applied to RDS (8 tables). Any new migration must be applied the same way.
- **The instance role is not least-privilege yet.** It's shared with the NAT instance and has broad ECR read.
  L6-A1 replaces it with a dedicated `healthconnect-service` role.
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
- **DNS is outside Terraform.** If the load balancer is ever destroyed and recreated, its address changes and the
  `api-hc` / `call-hc` records at Hostinger must be updated by hand. If the certificate is recreated, the two `_…`
  validation records change too (`terraform output cert_validation_records`).
- **Every `terraform plan` may show the launch template changing.** That's Canonical publishing a newer Ubuntu image;
  only servers launched afterwards use it. Harmless.
- **Everyone on the alarm list must click "Confirm subscription"** in the AWS email, or alarms never arrive.
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
| Heartbeat (ping/pong) | A tiny message sent every 25 s so idle connections aren't cut by the load balancer |

## 8. Lines ready for the report

HealthConnect runs in its own VPC (`10.30.0.0/16`) in `af-south-1`, split into public, private-app and
private-data subnets across two availability zones. Two app servers sit behind a load balancer that health-checks
`/health`, and the Postgres database lives in data subnets with no route to the internet, reachable only from the
app servers' security group. All of it is Terraform, reused from Prosit 1 and adapted for health data.
The API is served only over HTTPS (TLS 1.3, ACM certificate for `api-hc.agroconnect.space`); plain HTTP is redirected.
For Lab 7, the call page and its signaling server run on a single dedicated server behind the same load balancer,
because the server keeps call rooms in memory, and it pings each connection every 25 s so the load balancer's
60-second idle limit doesn't drop a waiting patient.
