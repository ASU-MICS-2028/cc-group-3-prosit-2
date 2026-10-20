# Prosit 1 (AgroConnect): what we can reuse

AgroConnect Ghana: an offline-first PWA for farmers and extension agents.
Repo: [`ASU-MICS-2028/cc-group-3-prosit-1`](https://github.com/ASU-MICS-2028/cc-group-3-prosit-1).
Its `docs/` folder explains each tier in depth; start with its `docs/README.md`.

We copy **patterns and modules** from it, not the whole codebase (decision D-002).

## What it has that HealthConnect needs

| Need (lab) | In Prosit 1 | Where |
|---|---|---|
| VPC with public / private-app / private-data subnets in 2 AZs (Lab 5A) | Yes, `10.20.0.0/16` | `infra/modules/network` |
| Cheap NAT (Lab 5A) | `fck-nat` on a `t4g.nano` instance, instead of a NAT Gateway | `infra/modules/nat` |
| Load balancer + health checks (Lab 5B) | ALB, target group, ASG (min 1, desired 1, max 3) | `infra/modules/alb`, `infra/modules/compute` |
| Private DB (Lab 5B) | RDS PostgreSQL, `publicly_accessible = false`, single AZ | `infra/modules/database` |
| Encryption at rest (Lab 6B) | RDS `storage_encrypted = true`; S3 public access blocked | `infra/modules/database`, `infra/modules/storage` |
| TLS (Lab 6B) | ALB policy TLS 1.3, HTTP→HTTPS redirect, ACM certificate | `infra/modules/alb` |
| Scoped instance role (Lab 6A) | EC2 role with separate policies for SSM, ECR, media bucket, app secrets, logs | `infra/modules/compute` |
| Secrets (Lab 6A) | AWS Secrets Manager | `infra/modules/secrets` |
| Audit trail (Lab 6D) | Database audit trigger + audit log | `backend/migrations/` |
| CI/CD (Week 9) | GitHub Actions with AWS OIDC (no stored keys) → ECR → ASG instance refresh | `.github/workflows/`, `infra/modules/cicd` |
| Monitoring | CloudWatch dashboard + alarms | `infra/modules/observability` |
| Offline PWA (Lab 5 report, brief week 1) | React 19 + Vite + Dexie (IndexedDB) outbox, Background Sync, PIN unlock, client UUIDs, en/tw/ee strings checked in CI | `frontend/` |
| API | Node.js/Express/TypeScript, Postgres, sessions, SMS (Nalo, Arkesel fallback), mobile money (votex365 test mode), push | `backend/` |

## Facts worth knowing

- Region `af-south-1` was chosen by measured latency: 74 ms median from Ghana, the fastest of 135 regions screened.
- Frontend hosting was AWS Amplify (`eu-west-1` origin, served through CloudFront).
- 11 Terraform modules; estimated cost $27–52 per month, with a $100 budget alarm.
- 365 automated tests (frontend + backend) ran on every PR.
- Its architecture decisions are ADR-001 to ADR-016 (`docs/architecture-decisions.md`). ADR-016 covers Act 843 and lists known privacy gaps, a useful starting point for HealthConnect.
- Prosit 1 kept a full AI-use disclosure (`docs/ai-tools-usage.md`); we do the same here.
