# 2026-11-09 · AWS architecture diagram, redrawn as deployed

**Who:** Eugene, with Claude Code. **Summary of the session, not a transcript.**

## Goal

Replace the Lab 7 diagram (27 Oct) with a standard AWS architecture diagram that uses the official AWS icons and shows what is deployed now.

## What we found

- The old diagram showed the PWA as "not built" and had no CloudFront, DynamoDB, Budgets or CI/CD. All of these now exist in Terraform.
- Everything was checked against `infra/main.tf`, the modules and `terraform output`:
  - VPC 10.30.0.0/16 across af-south-1a and 1b, with public, private-app and data subnets in each zone
  - fck-nat t4g.nano; Auto Scaling group of 2–4 t3.micro
  - RDS PostgreSQL 16 db.t4g.micro, encrypted and single-AZ
  - two SNS → SQS (+ DLQ) → Lambda consumers; DynamoDB for reminder dedupe
  - 8 CloudWatch alarms, and the GitHub OIDC deploy role
- CloudFront, IAM and Budgets are global, and the CloudFront certificate lives in us-east-1. They sit inside the AWS Cloud box but outside the region box.

## What we decided

- Use AWS groups for nesting: AWS Cloud → Region → VPC → Availability Zone → subnet, plus the Auto Scaling group spanning both zones.
- Edge styles: solid for requests, pink dashed for async events, grey dotted for NAT egress, with a legend.
- Kept the dashed "TURN relay: not built" box, because the peer-review script points at it.
- The single call server, single NAT instance and single-AZ database are now visible in the labels. This is honest, and it leaves the "before" picture in git history (27 Oct version).

## What changed

- `docs/architecture-healthconnect.drawio` and `.png` (2× export from the draw.io desktop app). Open the .drawio to edit.
- `docs/peer-review.md`: the walkthrough now follows the diagram left to right.
- `PLAN.md` L8-A1 note, and `docs/ai-tools-usage.md` (one row).

## Open questions / next steps

1. When SVC-2 (media uploads) or the votex365 secret lands, add the edges.
