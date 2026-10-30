# 2026-10-30: the CI/CD pipeline (D-030)

**Who:** Eugene, with Claude Code.

## Goal
Perfect merged the frontend (#27) and it appeared nowhere. Asking why led to the real gap: CI only tested, and
every deploy was manual from one laptop. Build the standard pipeline now, with security scanning, instead of
waiting for the Week 9 handout.

## Why it didn't exist
- The course schedules CI/CD for Week 9, and we followed that; nobody wrote it down as a decision.
- When the infra was copied from Prosit 1 (S4), the `cicd` Terraform module came across but `deploy.yml` didn't.
- `ci.yml` (S11) was written for testing only, before the frontend and call page existed.
- Prosit 1 had no security scanning either.

## What changed
- `ci.yml`: tests for all six parts; a security job (gitleaks over the full history, Trivy on lockfiles and on
  Terraform/Dockerfiles); on `main`, deploy only what changed (API: Trivy image gate before push, SHA pinned in
  SSM, instance refresh, smoke test; call page: scan report-only, push, restart through SSM).
- `codeql.yml` (JS/TS + Python) and `dependabot.yml` (npm, Actions, Docker, Terraform; weekly, grouped).
- `.trivyignore.yaml`: 7 accepted findings, each with a reason and the task that removes it (mostly L6-B1b, KMS).
- Fixed what the first scans found: `body-parser` 2.3.0 → 2.4.0 in `backend/` (HIGH, DoS); npm and corepack
  removed from the API runtime image (their bundled packages were its only HIGH findings); ALB drops invalid
  headers; ALB egress limited to the VPC.
- Deploy role (`infra/modules/cicd`): trusts only `ref:refs/heads/main` (was any branch); permissions name the
  ECR repos, the ASG, the tag parameter and the call server (were `*`).

## Checked
- gitleaks, full history: no leaks. Trivy fs/config after fixes: 0 unaccepted HIGH/CRITICAL. API image: 0.
- Frontend 31 tests and call page 16 tests pass and build; API typechecks, starts, `/health` answers with npm removed.
- actionlint (with shellcheck): clean.

## Applied (Eugene's OK)
`terraform apply` of the 4 in-place updates: 0 added, 4 changed, 0 destroyed. `/health` 10/10 and the call page
answered throughout. IAM simulator 11/11: pushes only to our two repos, refreshes only our ASG, writes only the
tag parameter, restarts only the call server; no secrets, no database. Trust: only `ref:refs/heads/main`.
Evidence: `evidence/cicd/outputs_deploy_role.txt`.

## Left over
- The first merge to `main` touching `backend/` is the end-to-end test of the deploy job.
- Frontend hosting (S3 + CloudFront at `app-hc`) and its deploy job: next PR.
