# The course: ICS 534 Cloud Computing (Fall 2026)

Summary of the course description (syllabus) on Canvas. **Syllabus dates have not matched the real deadlines**
(Lab 5 was due 22 Oct, Lab 6 is due 25 Oct): always take deadlines from the README or Canvas.

- **Teaching:** Prof. Robert A. Sowah (instructor), Dr. Stephane Nwolley (co-instructor), Shullamite Konama Darteh (faculty intern).
- **When:** lectures Monday 1:15–2:45 pm; lab Thursday 8:00–11:15 am; Patrick Nutor Hall 115.
- **How it's taught:** problem-based learning (the CESI model). Teams of up to four solve a real problem (a "Prosit") over about four weeks; lectures and labs give just-in-time knowledge for it.

## Grading

| Component | Weight |
|---|---|
| Quizzes and tests | 15% |
| Lab assignments and projects | 25% |
| Mid-semester exam | 15% |
| Attendance and participation (lab reflection questions count here) | 5% |
| Final exam 20% + final project 20% | 40% |

**Late work:** at most 85% after 1 day, 75% after 2, 60% after 3, then 0 unless a documented reason was given **before** the deadline.
**AI:** the syllabus bans AI-generated work unless authorised; our instructor authorised it for this course, with a declaration (`docs/ai-tools-usage.md`).

## Week by week (as planned in the syllabus)

Each week's lab is "Lab N". The lab handouts sometimes go further than the syllabus line: the handout wins (summaries in [`labs.md`](./labs.md)).

| Wk | Lecture topic | Reading | Lab (syllabus) | Homework (syllabus) |
|---|---|---|---|---|
| 1 | PBL and cloud basics: IaaS, PaaS, SaaS | Erl ch. 1–3 | Set up AWS/Azure/GCP accounts | 300-word problem statement |
| 2 | Cloud architecture: scalability, elasticity, fault tolerance | Erl ch. 4–5 | Deploy a VM | 500-word requirements |
| 3 | Containers: Docker, Kubernetes, microservices | Erl ch. 6 | Containerise a component | Microservices design (diagram + 500 words) |
| 4 | Storage and databases: block/object/file, SQL vs NoSQL | Erl ch. 7; Kleppmann ch. 5 | S3 + a database | 500-word storage justification |
| 5 | Networking: VPCs, subnets, load balancers | Erl ch. 8 | VPC + load balancer | 500-word network proposal |
| 6 | Security: IAM, encryption, compliance | Erl ch. 9 | IAM policies + encryption | 500-word security plan |
| 7 | Serverless: Lambda, event-driven design | Erl ch. 10 | A serverless function | 500-word serverless justification |
| 8 | **Midterm** + project milestone 1; peer review | Erl ch. 1–11 | Peer review of designs | 1,000-word design milestone; 200-word peer review |
| 9 | DevOps and CI/CD | Erl ch. 11; GitHub Actions docs | A CI/CD pipeline | 500-word pipeline design |
| 10 | Scalability and performance: auto-scaling, monitoring | Erl ch. 12; CloudWatch docs | Monitoring and optimisation | 500-word performance plan |
| 11 | Cost management | Erl ch. 13; Cost Explorer docs | Analyse and cut costs | 500-word cost plan |
| 12 | Edge computing and IoT | "Edge Computing: Vision and Challenges" | An edge/IoT component | 1,000-word paper review |
| 13 | Machine learning in the cloud, MLOps | SageMaker docs; "MLOps: Continuous Delivery" | Train/deploy a model | 500-word ML justification |
| 14 | Multi-cloud, sustainability; final presentations | "Multi-Cloud Computing" | Final demo | 1,500-word research proposal; 10–15 min presentation |
| 15 | Revision and exams | | | |

**PROSIT 1** (AgroConnect) ran Weeks 1–5; **PROSIT 2** (HealthConnect) runs Weeks 6–9, ending with the CI/CD lab; **PROSIT 3** (SmartCity Accra) runs Weeks 10–14 (named in the Week 1 lecture).
Whether the weekly 500-word homework reports are actually required is an open question for the facilitator (task S3).

## Books and references

- **Core:** Erl, Mahmood & Puttini, *Cloud Computing: Concepts, Technology & Architecture* (2013) · Wilder, *Cloud Architecture Patterns* (2012) · Hightower, Burns & Beda, *Kubernetes: Up and Running* (3rd ed., 2023).
- **Also cited:** NIST SP 800-145 (the definition of cloud computing) · Gartner Magic Quadrant for cloud infrastructure · Kleppmann, *Designing Data-Intensive Applications* (ch. 5).
- **Tools named:** Minikube/Kind, AWS/Azure/GCP free tiers, Terraform, Postman.

## Learning outcomes, in one line each

Choose IaaS/PaaS/SaaS for a need · design scalable, fault-tolerant, cost-aware systems (VMs, containers, serverless) ·
automate delivery with CI/CD · secure data (confidentiality, integrity, availability) · monitor and tune cost and
performance · use edge/fog for latency-sensitive work · judge trends (AI ops, green cloud, multi-cloud) · work and
present as a team to technical and non-technical audiences.

Lecture summaries: [`lectures.md`](./lectures.md) · glossary, tutorial and prerequisites: [`course-reference.md`](./course-reference.md).
