# HealthConnect cloud infrastructure (S4, Lab 5 Parts A and B)

**Owner:** Eugene · **Last updated:** 2026-10-22 · **Status:** working (HTTP only until S5 picks a domain)

> Write this for a teammate who will never open your code or the AWS console for this part.

## 1. In one sentence

Everything HealthConnect runs on in AWS (network, load balancer, two app servers, private database, photo bucket,
alarms and budget) is described as code in `infra/` and created with one command, `terraform apply`.

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
5. **Made HTTPS wait for a domain:** the certificate needs a domain name we haven't chosen yet (S5). Until then the
   load balancer serves plain HTTP on its own AWS address. Setting `api_hostname` in `terraform.tfvars` turns on the
   certificate, HTTPS and the HTTP→HTTPS redirect.
6. **Added a CI check** (`.github/workflows/ci.yml`): every PR runs `terraform fmt` and `terraform validate`.
7. **Applied it** to the `ashesi-dev` AWS account on 2026-10-22: 66 resources. Verified: both servers healthy, 10/10 `/health` requests answered (5 by each server), `/ready` reaches the database.

## 3. Why we did it this way

- **Copy, don't rebuild:** Prosit 1's modules already pass Lab 5's network and database requirements and ran in
  production for weeks. Lab 6 asks for a separate codebase, so we copy rather than share.
- **NAT instance, not a NAT Gateway:** `fck-nat` on a `t4g.nano` costs about \$3/month; AWS's managed NAT Gateway
  costs about \$32/month. Trade-off: one instance, one AZ, no automatic failover.
- **HealthLake later (D-019):** HealthLake isn't offered in `af-south-1`. We build on our own Postgres now and add
  HealthLake for demo day.

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

Running the database migrations: see "Running database migrations" in [`infra/README.md`](../infra/README.md).

## 5. What is NOT done, or is faked

- **No HTTPS yet.** Plain HTTP on the load balancer's address until S5. Don't send even synthetic patient data
  over it.
- **No automatic deploys.** The image in ECR was built and pushed by hand from Joseph's PR #2 branch. The deploy
  workflow comes with Week 9 (CI/CD).
- **Migrations are run by hand** through an SSM tunnel; the service doesn't migrate the database on boot. Done once on
  2026-10-22: `001`–`003` applied to RDS (8 tables). Any new migration must be applied the same way.
- **The instance role is not least-privilege yet.** It's shared with the NAT instance and has broad ECR read.
  L6-A1 replaces it with a dedicated `healthconnect-service` role.
- **No encryption build yet** (customer-managed KMS key, forced TLS on RDS, HTTPS-only bucket policy): L6-B1.

## 6. What will bite us

- **It costs money while it runs:** about \$60–80/month (ALB ~\$19, two `t3.micro` ~\$19, RDS ~\$16, NAT ~\$3, plus
  public IPs and CloudWatch). The budget alarm emails everyone at \$50 forecast and \$100 actual.
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

## 8. Lines ready for the report

HealthConnect runs in its own VPC (`10.30.0.0/16`) in `af-south-1`, split into public, private-app and
private-data subnets across two availability zones. Two app servers sit behind a load balancer that health-checks
`/health`, and the Postgres database lives in data subnets with no route to the internet, reachable only from the
app servers' security group. All of it is Terraform, reused from Prosit 1 and adapted for health data.
