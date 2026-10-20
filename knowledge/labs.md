# Labs feeding Prosit 2

Summaries of what each lab asks for, what to hand in, how it's graded, and what we learned about
it. The original lab documents are on Canvas and in the team Drive ([`workspace.md`](./workspace.md)).

**The file-by-file deliverables checklist for each lab, with who captures what, is in [`../PLAN.md`](../PLAN.md).**
This file explains what the labs ask for and what we've learned about them.

**Possibly also required:** the syllabus lists a weekly homework report next to each lab: a 500-word network architecture
proposal (Week 5), a security plan (Week 6), a serverless justification (Week 7), and a 1,000-word project design
milestone plus a 200-word peer review (Week 8). The lab handouts don't mention them; we're confirming with the facilitator (S3).

Reflection questions are not graded but count toward participation (5%). Homework extensions are
optional, but they help with the "innovation" and "autonomous learning" parts of the Prosit grade.

---

## Lab 5: VPC, load balancer and data residency

Written as the AgroConnect (Prosit 1) wrap-up. **We do it on HealthConnect** (decision D-001).

| Part | Ask | Deliverable |
|---|---|---|
| A. VPC | 1 VPC; 2 public + 2 private subnets in 2 availability zones; internet gateway for public, NAT for private | Screenshot of the VPC + route-table proof (script output) that the database subnet has **no** direct internet route |
| B. DB + load balancer | DB in a private subnet (required). 2 instances of the service in the private app subnet; load balancer in the public subnet health-checking `/health` | Target health screenshots: both healthy, then one unhealthy after stopping it; `test_load_balancer.sh` output before and after |
| C. Data residency | One-page design: Ghana + one more country (Nigeria or Kenya); sharding key and structure; the specific data protection law per country and one concrete way we respect it; what still needs real legal review | One-page PDF (diagram + text) |
| D. Decommissioning | Inventory all AgroConnect resources in the cost tracker; stop what isn't needed for grading; delete unused NAT Gateways; check the other cloud accounts are empty; log this week's spend | Checklist screenshot or note + month-to-date spend |

**Report:** 300 words on the network setup and what changed; a consolidated architecture diagram with
public/private boundaries; links/screenshots (working PWA with offline demo, container registry,
load-balanced service, database); one honest retrospective paragraph. Single PDF.

**Rubric:** VPC segmented, DB not reachable 20% · LB with demonstrated failover 15% · residency design specific and legally grounded 20% · offline PWA end-to-end 15% · retrospective honesty 20% · decommissioning with honest spend 10%.

**Homework:** CDN before/after page load on "Slow 3G"; egress audit (outbound rules scoped to real destinations, not "allow all"); NAT Gateway vs NAT instance cost, 2 sentences; optional second-country DB plus one query that would need federation.

**What we know already:**
- The Prosit 1 Terraform already builds most of A and B ([`prosit-1.md`](./prosit-1.md)). Missing: the ASG runs 1 instance, but the failover demo needs 2; no route-table evidence captured yet.
- The usual cause of "all targets unhealthy" is that the instance security group doesn't allow traffic from the load balancer's security group.
- A **stopped RDS instance restarts by itself after 7 days**. Snapshot and delete, or set a reminder.

---

## Lab 6: IAM, encryption, FHIR schema, audit logging

The first HealthConnect lab. HealthConnect must be a **separate codebase** from AgroConnect.

| Part | Ask | Deliverable |
|---|---|---|
| A. Least privilege | A new IAM role for the HealthConnect service only; a policy with only the actions it needs; attached via instance profile (no embedded keys); show one allowed and one denied action | Policy JSON + evidence of allow ✅ and deny ❌ |
| B. Encryption | Verify (don't assume) DB encryption at rest; enforce TLS on the API (HTTP rejected or redirected); S3 bucket encrypted and not public | Screenshots + `curl -v` output |
| C. FHIR-aligned schema | `patients`, `observations`, `access_log` tables shaped like FHIR resources; map each table to its FHIR resource; name one missing field (e.g., LOINC/SNOMED codes); **data minimisation pass**: one sentence per `patients` column justifying it under Act 843 | Schema file + mapping write-up |
| D. Audit logging | Log who accessed which patient record, when, and what they did | Query output showing populated audit rows |

**Report:** 300 words: IAM design and what it protects against; encryption at rest and in transit; FHIR decisions and what's missing; one ethics/consent point naming the **specific Act 843 principle** (data minimisation, purpose limitation, or right to be informed). Submit PDF + policy + schema + screenshots.

**Rubric:** least privilege (allow + deny) 25% · encryption verified 25% · FHIR schema with honest gaps 25% · audit logging 15% · ethics reflection 10%.

**Homework:** FHIR sandbox (AWS HealthLake / Azure Health Data Services / GCP Healthcare API) with a 150-word comparison; secrets rotation drill, timed (used in the Week 9 incident-response discussion); RBAC table for CHV / specialist / GHS official; read the Lambda "Getting Started" docs before Lab 7.

**What we know already:**
- The lab's sample policy uses `rds-data:ExecuteStatement`, which is the **Aurora Data API** and doesn't work with plain RDS PostgreSQL (what we use). Prove "allowed" with `secretsmanager:GetSecretValue` on our secret instead, and "denied" with `rds:DeleteDBInstance` or by reading AgroConnect's secret.
- The starter code has bugs worth fixing and writing about:
  - The audit table has a foreign key to `patients`, so logging a read of a patient that doesn't exist fails, and the request errors instead of returning 404.
  - The `x-user-id` header can be faked by anyone. Take the identity from the login session.
  - The data write and the audit write aren't in one transaction, so a record can change without a log entry.
  - `SERIAL` ids clash with offline clients that create records before syncing. Use UUIDs.
  - The app can edit or delete its own audit log. Make it append-only.
- If a scoped-down role breaks something, look up the exact denied action in CloudTrail and add only that one.
- Check whether HealthLake is even offered in `af-south-1`. If it isn't, that's a data residency point.

---

## Expected next (not released yet)

- **Lab 7 (Week 7):** serverless telemedicine: functions (Lambda), event-driven scheduling, low-bandwidth WebRTC video. Per Lab 6's "Looking Ahead".
- **Week 8:** midterm; project design milestone (1,000 words); peer review of designs (200 words). Per the syllabus.
- **Week 9:** CI/CD pipeline; incident response (uses the secrets-rotation timing from Lab 6).

Add each lab here when it's released.
