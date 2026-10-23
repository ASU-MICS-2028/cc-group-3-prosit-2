# 2026-10-22 to 23 · Lab 5 built, evidenced and submitted in two hours

**Who:** Joseph, with Claude Code (the rest of the team was unavailable). **Summary, not a transcript.**

## Goal

Lab 5 turned out to be due 22 Oct at 23:59 (not the syllabus date). At 21:58 only Part A existed. Finish and submit it.

## What we found

- **Eugene's team-account setup (`af-south-1`, PR #6) already met Parts A and B,** but nobody else could reach that account that night (logins are per-person IAM users with MFA).
- **Joseph's own AWS account doesn't have Cape Town enabled**, so we re-applied Eugene's Terraform there in **Stockholm (`eu-north-1`)** using local override files (provider profile, local state, region). Same code, second account: good evidence that the setup is reproducible.
- **AWS had no `t4g.nano` or `t4g.micro` capacity in `eu-north-1a`**, so the NAT instance never launched. We added a managed **NAT Gateway** by hand for that copy and refreshed the app servers.
- **The photo-bucket name is global:** `healthconnect-dev-media` already exists in the team account, so that copy has no bucket. Not needed for Lab 5.
- **The image pins the `af-south-1` RDS certificate bundle**, so `/ready` fails against a database in another region. `/health` (what the load balancer checks) is unaffected.
- **Failover is only half-working.** The health check removed the stopped server within ~18 s, but about half the requests in the next minute failed (timeouts, then `504` even with a 30 s settle). Cross-zone load balancing is on. Unexplained; now task **L6-X** (Eugene).
- **The live AgroConnect app is gone** (destroyed 15 Oct), so the offline-PWA evidence reuses our Week 4 screenshots, as the rubric line ("from Week 4") allows.
- **Lab 6 is due Saturday 25 Oct.**

## What we decided

- Submit Lab 5 on HealthConnect (D-001), with evidence from the Stockholm copy, and say so in the report.
- Report the failover result honestly (5/10) instead of re-running until it looked good.
- Branch protection: still 1 approval, but **no longer "code owner" approval**, so any teammate's approval merges a PR.

## What changed

- Lab 5 report submitted (`evidence/lab5/CC GROUP 3 Highlanders Lab 5 Report.pdf`), with all evidence in `evidence/lab5/`.
- Stockholm copy **torn down** after submission: 52 resources destroyed, NAT Gateway and Elastic IP deleted by hand, empty `test-bucket-agroconnect` deleted.
- PRs #6 (infra) and #2 (API) merged; PLAN.md and the README updated (Lab 5 done, Lab 6 deadline, L6-X added).

## Open questions / next steps

1. **L6-X:** why did failover drop requests?
2. Lab 6 by 25 Oct: L6-A1 → A2, S5 → L6-B1 → B2, L6-D1 → D2, L6-C2, then the report (L6-R).
3. Confirm the Lab 7 and Lab 8 due dates on Canvas (S3).
