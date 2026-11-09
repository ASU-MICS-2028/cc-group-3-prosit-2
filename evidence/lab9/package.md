# Lab 9: HealthConnect Ghana final package (draft)

Group 3 Highlanders · ICS 534. Repo: https://github.com/ASU-MICS-2028/cc-group-3-prosit-2 · Service: https://app-hc.agroconnect.space · API: https://api-hc.agroconnect.space/health

## Lab report: CI/CD and IaC

Every pull request to `main` runs one GitHub Actions workflow. It checks the Terraform, runs the API tests against a real Postgres with every migration applied, tests the database schema, the Lambda functions, the PWA and the call page, and runs three security scans: gitleaks for secrets, Trivy for vulnerable packages, and Trivy for infrastructure misconfiguration. A deliberately false assertion turned the backend job red and stopped the pipeline.

The secret scan caught a made-up AWS key on a throwaway branch. It also taught us something. Gitleaks reads every branch, so while that branch existed, the scan failed on an unrelated pull request too. We deleted the branch after capturing the result and re-ran the affected job, which passed.

Merging to `main` now waits for a person. A job bound to the `production` GitHub Environment holds the release until one of the four team members approves, and only then do the deploy jobs start. We put the environment on a separate job because an environment changes the OIDC subject, and our AWS role only trusts `refs/heads/main`. The deploy jobs hold no stored AWS keys: each assumes a role through OIDC, pushes a new image, and rolls it out through an instance refresh, one deploy at a time, followed by a health check.

All the infrastructure is Terraform: twelve modules covering the network, NAT instance, load balancer, compute, database, storage, events, the CI/CD role, the container registries, the call server, the PWA hosting and observability. State is held remotely in S3, separate from AgroConnect's. `D-terraform-plan.txt` shows the current difference between the code and what is running.

The weakness we accept is a single approver and one NAT instance: cheap and simple, but neither is highly available.

## Sustainability and community-ownership plan

HealthConnect is only useful if it outlasts this course, so ownership would pass to the people it serves. We would start with one district, using Dodowa as the pilot, where a health-centre committee of the facility's lead nurse, a community health volunteer and a community leader would hold the platform-admin role that is already built, and decide who gets accounts. Running costs would be met by the small mobile-money consultation fee and insurance premium flow already in the code, which is simulated until a payment key is set and whose prices are placeholders to be set with the committee. The code stays open source in a public repository so that the Ghana Health Service, or another district, can adopt it without paying us, and the Terraform means a new team can rebuild the system from scratch. Community health volunteers would be trained by the first group of volunteers, and the committee would review the surveillance dashboard monthly with the district health directorate. None of this has been agreed with a real committee yet: it is the plan we would take to them.

## Decommissioning checklist

| Resource | Decision | Why |
|---|---|---|
| HealthConnect API, database, load balancer, call server, PWA | **To confirm from `E-running-resources.txt`**: keep until Prosit 2 is graded | Needed for the live grading window |
| Load-test or demo-only resources | **To confirm**: stop | Not needed for grading |
| NAT | NAT instance (`fck-nat`, `t4g.nano`), per the Terraform. **To confirm: no NAT gateways listed** | About $3 a month instead of a NAT gateway |
| AgroConnect resources | **To confirm** they are as left after Week 5 | Could have been restarted by a teammate testing |

**Data retention:** All HealthConnect patient records are invented test data, so we will keep the database only until Prosit 2 is graded, then delete it and its backups with no final snapshot; had they been real people, their records would be erased once no longer needed for the stated purpose, as Act 843 requires, subject to legal review of clinical-record retention periods.

**Access log:** `access_log` holds patient IDs, action, outcome and source IP, and no names. The IPs are the team's own test devices, and the log goes with the database.

**Month-to-date spend:** **To add from `E-month-to-date-spend.txt`**, and record in `Cost_Tracking_Template.xlsx`.

## Evidence

- A: `A-pipeline-passing.png`, `A-pipeline-failed.png`
- B: `B-gitleaks-blocked.png`, `B-gitleaks-finding.txt`. The key was removed: branch and pull request #73 closed unmerged.
- C: `C-paused.png`, `C-approved.png` (**after the approval-gate PR merges**)
- D: `infra/`, `D-terraform-plan.txt` (**run `collect.sh`**)
- E: `E-running-resources.txt`, `E-month-to-date-spend.txt` (**run `collect.sh`**)
- Architecture diagram with CI/CD and IaC layers (**to update**)
