# HealthConnect Infrastructure

Terraform-managed infra in `af-south-1`, copied from Prosit 1 (AgroConnect) and adapted (S4, D-002).
Root is a thin orchestrator; each concern lives in its own module under `modules/`.
Plain-language explanation for the team: [`learnings/infra.md`](../learnings/infra.md).

## Layout

```
infra/
├── backend.tf           # S3 remote state (bucket + native lockfile)
├── main.tf              # providers, locals, module wiring
├── variables.tf         # root inputs
├── outputs.tf           # pulls from module outputs
├── bootstrap/           # one-time: created the state bucket (already exists; shared with Prosit 1)
└── modules/
    ├── network/         # VPC, subnets (×6), IGW, route tables
    ├── nat/             # fck-nat instance + SG + ENI
    ├── alb/             # ALB, SGs, target group, listeners; ACM cert once api_hostname is set
    ├── compute/         # EC2 IAM, launch template, ASG, scaling policy
    ├── ecr/             # container registry
    ├── database/        # RDS Postgres in the isolated data subnets
    ├── storage/         # S3 bucket for patient photos + lifecycle
    ├── observability/   # SNS alarms, CloudWatch dashboard, AWS Budgets
    └── cicd/            # GitHub Actions OIDC + deploy role
```

## Remote state

State lives in the S3 bucket bootstrapped for Prosit 1 (`agroconnect-tfstate-<account-id>`), under its own key
`healthconnect/dev/terraform.tfstate`, with a **native lockfile** (no DynamoDB). The bucket already exists, so
`bootstrap/` never needs to run again; it's kept so the bucket can be rebuilt or re-imported. Its name says
`agroconnect` because renaming an S3 bucket means recreating it.

## Shape

- VPC `10.30.0.0/16`, two AZs (`af-south-1a`, `af-south-1b`)
- 2 public subnets (ALB + fck-nat + IGW)
- 2 private-app subnets (EC2 app tier, routes to fck-nat for egress)
- 2 private-data subnets (RDS Postgres, no default route, fully isolated)
- fck-nat on `t4g.nano` in `af-south-1a` for private-tier egress
- ALB: target group `/health` on port 8000. Until `api_hostname` is set (S5), `:80` forwards straight to the app on
  the ALB's DNS name. Once set: ACM cert, `:443` with TLS 1.3, and `:80` → 301 → HTTPS
- Launch Template: Ubuntu 24.04, `t3.micro`, IMDSv2, SSM-managed (no SSH keys)
- ASG: **min 2**, desired 2, max 4 (two instances for the Lab 5 failover demo), rolling instance refresh
- Scaling: target-tracking on `ALBRequestCountPerTarget` @ 500 req/min/target
- ECR repo `healthconnect-dev-backend`
- IAM OIDC provider + role for GitHub Actions (no long-lived keys)
- No frontend hosting yet: added when the PWA exists (S9)

## First-time bring-up

The instances pull the image on boot, so create the registry and push an image first:

```bash
cd infra
export AWS_PROFILE=ashesi-dev
cp example.tfvars terraform.tfvars        # then fill in the alarm emails
terraform init
terraform apply -target=module.ecr -target=module.cicd.aws_ssm_parameter.app_image_tag
# push backend/ to $(terraform output -raw ecr_repo_url):latest (see learnings/infra.md)
terraform apply
```

Costs (af-south-1 list): fck-nat `t4g.nano` (~\$3/mo), ALB (~\$19/mo), 2x `t3.micro` (~\$19/mo), RDS
`db.t4g.micro` + 20 GB (~\$16/mo), ECR storage pennies, CloudWatch, Secrets Manager (\$0.40/mo for the RDS secret).
Public IPv4s bill at \$0.005/hr each.

## After apply

```bash
terraform output
# api_url, alb_dns, ecr_repo_url, asg_name, gha_role_arn, db_endpoint
```

### Running database migrations

The database has no route to or from the internet, and only the app security group may reach port 5432. To run
`db/migrations/*.sql`, tunnel through one of the app instances with SSM (no SSH, no open ports):

```bash
IID=$(aws ec2 describe-instances --filters Name=tag:Name,Values=healthconnect-dev-app Name=instance-state-name,Values=running \
  --query 'Reservations[0].Instances[0].InstanceId' --output text)
aws ssm start-session --target $IID --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters "{\"host\":[\"$(terraform output -raw db_endpoint | cut -d: -f1)\"],\"portNumber\":[\"5432\"],\"localPortNumber\":[\"15432\"]}"
# in another terminal: password from the RDS secret
export PGPASSWORD=$(aws secretsmanager get-secret-value --secret-id "$(terraform output -raw db_master_user_secret_arn)" \
  --query SecretString --output text | jq -r .password)
for f in ../db/migrations/*.sql; do psql "host=localhost port=15432 dbname=healthconnect user=healthconnect_admin sslmode=require" -v ON_ERROR_STOP=1 -f $f; done
```

Needs the Session Manager plugin for the AWS CLI (`brew install --cask session-manager-plugin`).
Never point `db/tests/run_tests.sh` at this tunnel: it drops and recreates databases (its RDS guard only checks the hostname).

## Rollback

The deployed image tag lives in SSM at `/healthconnect-dev/app-image-tag`. Instances pull whatever tag it names
(today `latest`). Once the deploy workflow exists (Week 9), CI will pin it to the merge commit's SHA on every
deploy. A rollback is two commands:

```bash
# 1. Point the parameter at the last good SHA.
aws ssm put-parameter --name /healthconnect-dev/app-image-tag \
  --value <previous-sha> --type String --overwrite \
  --region af-south-1 --profile ashesi-dev

# 2. Roll the fleet onto it.
aws autoscaling start-instance-refresh --auto-scaling-group-name healthconnect-dev-asg \
  --preferences '{"MinHealthyPercentage":100,"MaxHealthyPercentage":200,"InstanceWarmup":180}' \
  --region af-south-1 --profile ashesi-dev
```

List available tags with
`aws ecr list-images --repository-name healthconnect-dev-backend --region af-south-1`.

## Teardown

```bash
terraform destroy
```

## Known shortcuts (technical debt)

- Single `fck-nat` instance in `af-south-1a`, no HA. If it or its AZ fails, egress breaks until recovery.
- RDS is single-AZ with no final snapshot and no deletion protection (lab settings, see `modules/database`). The
  brief's 99.7% uptime target would need `multi_az = true` (~2x DB cost).
- No HTTPS until `api_hostname` is set (S5). Until then the API is plain HTTP on the ALB's DNS name: fine for
  health checks, **not** for patient data (synthetic or not).
- One instance role is shared by the app and the fck-nat instance. Lab 6 (L6-A1) replaces it with a dedicated,
  least-privilege `healthconnect-service` role.
- Instance role has broad ECR read; narrow to the specific repo ARN in L6-A1.
- Migrations are run by hand through an SSM tunnel; the service doesn't migrate on boot.
