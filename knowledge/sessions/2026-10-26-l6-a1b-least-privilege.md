# 2026-10-26 · Least privilege in the real system (L6-A1b)

**Who:** Eugene, with Claude Code. **Summary of the session, not a transcript.**

## Goal

Lab 6's least-privilege role was demonstrated in a separate lab environment (D-024). Bring the same idea to our real system: no server holds permissions its job doesn't need.

## What we found

- The NAT box shared the API servers' role, so it could read the database password and the sign-in key.
- The API role had AWS's account-wide "read every image repository" policy.
- `ecr:GetAuthorizationToken` can't be limited to one repository (AWS requires `*`); the pull actions can, and they're what matter.
- In zsh, `$VAR:role` is read as a filename modifier (`:r`), which mangles ARNs. Write `${VAR}:role`, or run such scripts with bash.

## What changed

- `infra/modules/nat`: its own role and instance profile (SSM sessions only); the instance switched in place (no NAT outage).
- `infra/modules/compute`: the managed ECR policy replaced by pull permissions on `healthconnect-dev-backend` only. `modules/ecr` exposes the repository ARN.
- Applied: 4 added, 1 changed, 1 destroyed; a second plan shows no changes.
- Checked: `evidence/lab6/check_least_privilege.sh` (10 allow/deny checks with the IAM policy simulator, all PASS); an instance refresh replaced both API servers and the new ones pulled and went healthy. Output: `evidence/lab6/outputs_A1b_least_privilege.txt`.

## Open questions / next steps

- L6-B1b (KMS key, `rds.force_ssl`, HTTPS-only bucket policy): encrypting RDS with our own KMS key means replacing the database; plan it while it holds only synthetic data.
