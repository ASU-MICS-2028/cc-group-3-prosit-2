# 2026-10-22 · Tearing down AgroConnect and bringing up HealthConnect's infrastructure

**Who:** Eugene, with Claude Code. **Summary of the session, not a transcript.**

## Goal

Retire AgroConnect's AWS resources, then get HealthConnect's infrastructure (S4) and the API running in AWS as soon as possible.

## What we found

- **AgroConnect is gone.** `terraform destroy` on 2026-10-15 removed all 74 resources, including the database (no final snapshot) and the photo bucket (emptied first). Only the Terraform state bucket remains; HealthConnect now uses it too, under its own key. No database is left in `af-south-1`, so S7's Lab 4 password is moot if that database was in this account.
- **AWS HealthLake is not offered in `af-south-1`** (no endpoint; it answers in `eu-west-1`, `eu-west-2`, `us-east-1`). Recorded in D-019.
- **The brief asks us to "choose and justify"** a healthcare platform, a security framework (OAuth/JWT), offline conflict resolution and GHS integration. Only the platform is decided so far (D-019).
- Joseph's PR #2 API runs unchanged on AWS. It needs `INSTANCE_ID`, which Prosit 1's start-up script did **not** set; S4 adds it.

## What we decided

- **D-003 accepted:** `af-south-1`, VPC `10.30.0.0/16`.
- **D-019 (proposed):** our own FHIR-shaped Postgres until demo day; HealthLake added for demo day.

## What changed

- `infra/` (S4): Prosit 1 modules minus the farm-specific secrets and Amplify hosting; 2 app servers minimum; HTTPS switched on only once `api_hostname` is set (S5). Applied: 66 resources. Details in [`learnings/infra.md`](../../learnings/infra.md).
- `.github/workflows/ci.yml`: `terraform fmt` + `validate` on every PR.
- The API image (PR #2, commit `cf7fa3e`) built and pushed to ECR by hand.
- `evidence/lab5/outputs_A_routes.txt`: route-table proof for Lab 5 Part A.
- `.gitignore`: course briefs (`Prosit*.docx`, `Prosit*.pptx`) are never committed.

## Open questions / next steps

1. Choose the API domain (S5), then set `api_hostname` and apply: HTTPS comes on.
2. ~~Run `db/migrations/` on RDS~~ Done: `001`–`003` applied through the SSM tunnel (8 tables). Elise's `run_tests.sh` stays local-only (it drops databases).
3. When PR #2 merges, rebuild the image from `main` and do the L5-B2 failover demo.
4. The frontend doesn't exist yet (S9, Perfect). Amplify hosting returns to Terraform once it does.
5. Screenshots: VPC resource map (L5-A), RDS "Publicly accessible: No" (L5-B1).
