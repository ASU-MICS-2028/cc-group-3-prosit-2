# infra/: Terraform for AWS

**Owner:** Eugene (backup reviewer: Joseph). Plain-language note: [`../learnings/infra.md`](../learnings/infra.md). Runbook: [`README.md`](./README.md).
Follow the root [`../AGENTS.md`](../AGENTS.md) first; this adds what's specific to infrastructure.

## Commands

```bash
export AWS_PROFILE=ashesi-dev          # the team account; region af-south-1
terraform fmt -recursive
terraform init -backend=false && terraform validate     # what CI runs on every PR
terraform plan                          # read it fully before any apply
```

## Rules

- **Never `apply` or `destroy` without the owner's say-so, and never without reading the plan.** `destroy` deletes the database with **no final snapshot**.
- **State is remote and shared** (`agroconnect-tfstate-…` bucket, key `healthconnect/dev/…`). Don't copy or edit it; don't change `backend.tf` without `terraform init -migrate-state`.
- **Least privilege:** each service gets its own IAM role with only the actions it uses. Find missing permissions in CloudTrail and add exactly that one; never fall back to broad policies.
- **Every new resource is tagged** (the provider's `default_tags` does it) **and goes in the cost tracker.** Anything that bills hourly (NAT Gateway, load balancer, database) gets torn down when its lab is done.
- **Keep the two compute settings the app depends on:** the metadata hop limit of 2 (containers need the instance role) and `INSTANCE_ID` passed into `docker run` (`/health` reports it).

## Diverging paths to try for any change

`plan` shows only what you expect · a fresh `apply` from nothing (bucket names are **global**, so a name taken in another account fails) ·
an instance type with **no capacity** in a zone (it happened with `t4g.nano` and `t4g.micro` in eu-north-1a) ·
a second `apply` changes nothing · the app still answers `/health` through the load balancer afterwards ·
`destroy` leaves nothing behind (check by tag `Project=healthconnect`).

## Running in another account (as for Lab 5)

Put local override files next to `main.tf` (they're **not** committed): `providers_override.tf` with the AWS `profile`,
`backend_override.tf` with `backend "local" {}`, and a `terraform.tfvars` with `region` and `azs`. Opt-in regions like
`af-south-1` must be enabled in that account first. Details: [`../knowledge/sessions/2026-10-22-lab5-submission.md`](../knowledge/sessions/2026-10-22-lab5-submission.md).
