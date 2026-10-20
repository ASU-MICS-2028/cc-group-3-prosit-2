# Decisions

Every decision that shapes HealthConnect, newest at the bottom. One entry each: what we decided,
why, and what we gave up. If you change a decision, add a new entry that replaces the old one;
don't edit history.

Status: **Accepted** (we're doing it), **Proposed** (needs the team or the facilitator), **Replaced** (see the entry that replaces it).

---

## D-001: Lab 5 is done on HealthConnect, not AgroConnect

- **Date:** 2026-10-18 · **Status:** Accepted (facilitator confirmation pending)
- **Decision:** Build HealthConnect's VPC, load balancer and private database for Lab 5. Only the decommissioning checklist (Part D) and the retrospective stay about AgroConnect.
- **Why:** Lab 5 is written as the AgroConnect wrap-up, but Lab 6 says to carry "your Week 5 VPC design" into HealthConnect. Building it once, on HealthConnect, serves both labs.
- **Gave up:** fresh AgroConnect evidence for Lab 5. If the facilitator wants it, it's cheap to capture before AgroConnect is decommissioned.

## D-002: HealthConnect is a separate repository that reuses Prosit 1 patterns

- **Date:** 2026-10-18 · **Status:** Accepted
- **Decision:** New repo (`cc-group-3-prosit-2`). Copy Terraform modules and the PWA/API patterns from `cc-group-3-prosit-1`; don't import its code wholesale.
- **Why:** Lab 6 requires it: the health data domain and its risk are different enough to need their own codebase.
- **Gave up:** a shared codebase; fixes made in one repo must be copied to the other by hand.

## D-003: Same AWS region and a non-overlapping network

- **Date:** 2026-10-18 · **Status:** Proposed (Eugene to confirm)
- **Decision:** AWS `af-south-1` (Cape Town), VPC `10.30.0.0/16`.
- **Why:** `af-south-1` had the lowest measured latency from Ghana in Prosit 1 (74 ms median). AgroConnect uses `10.20.0.0/16`; not overlapping keeps peering possible later.
- **Gave up:** there is no AWS region in Ghana, so health data leaves the country. The data residency doc (Lab 5 Part C) must deal with this openly.

## D-004: Synthetic data only

- **Date:** 2026-10-18 · **Status:** Accepted
- **Decision:** No real patient data anywhere, in any environment.
- **Why:** We have no ethics approval, and health data is sensitive under Ghana's Data Protection Act, 2012 (Act 843). This is also our consent/ethics point for the Lab 6 report.
- **Gave up:** testing with real CHVs and patients. The brief asks for it; we say openly that we didn't.

## D-005: Act 843 is the governing law; HIPAA is only a reference checklist

- **Date:** 2026-10-18 · **Status:** Accepted
- **Decision:** We design for Ghana's Act 843 and cite it. Where the brief says "HIPAA-compliant", we treat HIPAA (a US law) as a checklist of good controls, and say so.
- **Why:** HIPAA doesn't apply in Ghana; claiming "HIPAA compliance" would be inaccurate.

## D-006: Keep Prosit 1 leads, with light rotation

- **Date:** 2026-10-18 · **Status:** Accepted
- **Decision:** Joseph (PM/API), Eugene (Cloud/DevOps), Elise (Data), Perfect (Frontend). Each person also takes one task outside their lane. Details are in [`PLAN.md`](../PLAN.md) (Roles).
- **Why:** Each lead already knows the code and infrastructure in their lane; the rotation means everyone can explain the whole system.

## D-007: Every area is explained in plain words in `learnings/`

- **Date:** 2026-10-18 · **Status:** Accepted
- **Decision:** Nobody re-does someone else's part to understand it. Each owner writes a plain-language note in `learnings/`, and a PR isn't done without it.
- **Why:** We split the work strictly, so the notes are the only way the rest of us will know what happened.

## D-008: Build the foundation; design the rest

- **Date:** 2026-10-18 · **Status:** Accepted
- **Decision:** Build the offline CHV app, the FHIR-shaped patient API, audit logging and the security controls properly, and one telemedicine slice in Lab 7. Design and document the rest (biometrics, voice, surveillance, ML, insurance). Scope table: [`PLAN.md`](../PLAN.md).
- **Why:** The brief is far bigger than four weeks. Depth on the parts the labs grade beats a thin attempt at everything.
- **Gave up:** most of brief weeks 3 and 4 as working features.

## D-009: The repo is the single source of truth

- **Date:** 2026-10-20 · **Status:** Accepted
- **Decision:** The plan, roles, tasks and their status live in [`PLAN.md`](../PLAN.md), and the README's "Pending now" table reflects it. The "Prosit 2 – HealthConnect Team Plan" Google Doc was only for agreeing the plan; it is retired and no longer updated.
- **Why:** One place to look; it changes in the same PR as the work it tracks.
- **Gave up:** editing the plan in a Google Doc. Changes now go through PRs.
