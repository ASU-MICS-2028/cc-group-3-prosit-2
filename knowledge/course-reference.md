# Course reference: glossary, tutorial and prerequisites

A plain-words summary of three ICS 534 Cloud Computing (Ashesi, Fall 2026) handouts; the original documents are on Canvas.

---

## Glossary

One line per term. Where the glossary only gave the expansion of an abbreviation, the meaning is given in plain words.

### Service models (what the provider runs for you)

- **IaaS (Infrastructure as a Service)**: you rent raw virtual servers, disks and networks; you manage the OS and everything above it (e.g. AWS EC2).
- **PaaS (Platform as a Service)**: you hand over your app; the provider runs the servers and OS for you (e.g. Elastic Beanstalk, Heroku).
- **SaaS (Software as a Service)**: a finished app you use over the internet (e.g. Microsoft 365).
- **FaaS (Function as a Service)**: you upload small functions; the provider runs them only when an event fires (e.g. AWS Lambda).
- **BaaS (Backend as a Service)**: ready-made backend parts (database, login, notifications) you call through an API (e.g. Firebase, Supabase).
- **DBaaS (Database as a Service)**: a managed database; the provider handles patching, backups and scaling (e.g. AWS RDS).
- **Serverless architecture**: you write code only; the provider owns and scales the servers.
- **Cloud-native**: apps designed from the start to use cloud features (scaling, managed services, containers).

### Deployment models (who owns the cloud)

- **Public cloud**: shared provider infrastructure anyone can rent.
- **Private cloud**: cloud resources used by one organisation only.
- **Hybrid cloud**: public and private clouds joined so data and apps can move between them.
- **Multi-cloud**: using several providers together, often to avoid being locked in to one.
- **Community cloud**: a cloud shared by a group of organisations with the same rules or concerns.

### Virtualisation and containers

- **Virtualisation**: making software copies of hardware so one physical server runs many virtual machines (VMs).
- **Hypervisor**: the software that creates and runs VMs. Type 1 runs directly on hardware; Type 2 runs on top of a normal OS.
- **Container**: an app packed with everything it needs so it runs the same everywhere; lighter than a VM (e.g. Docker).
- **Orchestration**: automatically starting, placing, scaling and restarting containers or services.
- **Kubernetes**: the standard open-source tool for orchestrating containers.
- **Helm**: a package manager for Kubernetes apps.
- **OCI / CRI / CNI / CSI**: standards for container image format, container runtimes, container networking and container storage.
- **CRD (Custom Resource Definition)**: a way to add your own object types to Kubernetes.
- **Service Fabric**: Microsoft's platform for packaging and running microservices and containers.

### Architecture patterns

- **Microservices**: an app split into small services that are deployed separately.
- **Event-driven architecture**: code runs in reaction to events (a click, an upload, a message).
- **Service mesh**: a layer that handles traffic between services (load balancing, discovery, security), e.g. Istio.
- **API-first**: design the API before building the apps that use it.
- **API (Application Programming Interface)**: a defined way for programs to talk to each other.
- **API gateway**: the front door for clients; routes requests and handles auth and rate limits.
- **REST**: a common style of web API built on HTTP verbs (GET, POST, PUT, DELETE).
- **SOAP / GraphQL / gRPC**: other API styles: XML-based messages / client asks for exactly the fields it wants / fast remote calls from Google.
- **JSON / XML / YAML**: text formats for data and config; YAML is the usual one for config files.
- **CRUD**: Create, Read, Update, Delete, the four basic data operations.

### Networking

- **VPC (Virtual Private Cloud)**: your own private, isolated network inside a public cloud.
- **Subnet**: a slice of the VPC's address range, used to group and protect resources (public vs private).
- **CIDR**: the "10.0.0.0/16" notation for an address range; the number after the slash sets its size.
- **Internet gateway**: the door between a VPC and the internet.
- **NAT gateway**: lets servers in a private subnet reach out to the internet while blocking anything coming in.
- **Security group**: a virtual firewall on a resource that allows or blocks traffic by port and source.
- **Load balancer**: spreads incoming traffic over several servers so none is overloaded (AWS: ELB, ALB for HTTP, NLB for raw TCP).
- **CDN (Content Delivery Network)**: servers around the world that cache content close to users.
- **VPN**: an encrypted tunnel over the internet between your network and the cloud.
- **Direct Connect / ExpressRoute**: a private dedicated line to the cloud that skips the internet.
- **DNS**: turns names (example.com) into IP addresses.
- **DHCP**: hands out IP addresses automatically.
- **BGP**: the protocol networks use to swap routing information across the internet.
- **VLAN**: devices grouped logically as if on the same cable.
- **MPLS / SD-WAN / QoS**: label-based routing / software-controlled wide-area networks / giving some traffic priority.

### Storage and databases

- **Object storage**: stores whole files as objects with an ID; good for photos, backups, logs (e.g. S3).
- **Block storage**: raw disk volumes attached to a server; used for databases and file systems (e.g. EBS).
- **File storage**: shared folders and files, like a network drive (e.g. EFS).
- **Data warehouse**: a store built for analysing large amounts of structured data (e.g. Redshift, BigQuery).
- **Data lake**: a store holding raw data of any kind until someone needs it.
- **ETL**: Extract, Transform, Load: copy data from sources, clean it, put it somewhere else.
- **OLTP vs OLAP**: many small live transactions (an app database) vs big analytical queries (a warehouse).
- **Caching**: keeping frequently used data in fast storage to cut response time.

### Security and compliance

- **IAM (Identity and Access Management)**: who can do what to which cloud resource.
- **MFA (Multi-Factor Authentication)**: login needs more than one proof (e.g. password plus phone code).
- **Encryption at rest**: stored data is scrambled so a stolen disk is unreadable.
- **Encryption in transit**: data is scrambled while moving, usually with TLS (HTTPS).
- **Zero trust**: never trust a user or device by location; verify every request.
- **RBAC / ABAC**: access based on a user's role / based on attributes and policies.
- **SSO / SAML / OAuth / OIDC**: one login for many apps / standards for passing login and permission data between systems.
- **PKI / HSM / KMS**: system of keys and certificates / tamper-proof hardware that holds keys / AWS service that manages encryption keys.
- **WAF (Web Application Firewall)**: filters bad HTTP traffic before it reaches your app.
- **DDoS**: an attack that floods a system with traffic from many machines.
- **DLP (Data Loss Prevention)**: tools that stop sensitive data leaking out.
- **SIEM / SOC**: a system that analyses security alerts / the team that responds to them.
- **CSPM**: tools that scan your cloud for misconfigurations.
- **CASB**: security software that sits between your organisation and cloud services.
- **Compliance as code / Policy as code**: rules written as code so they are checked automatically.
- **GDPR / HIPAA / PCI DSS / SOX**: laws and standards for EU personal data / US medical data / card payments / US company finances.
- **GRC, COBIT, NIST, ISO, FISMA, FedRAMP**: governance frameworks and standards bodies.

### Scaling and performance

- **Auto scaling**: add or remove servers automatically as demand changes (AWS: ASG, Auto Scaling Group).
- **Horizontal scaling (scale out)**: add more servers.
- **Vertical scaling (scale up)**: make one server bigger (more CPU, RAM).
- **Elastic Load Balancing**: AWS's managed load balancer service.
- **Edge computing**: running compute near where data is produced, to cut delay.

### Reliability, monitoring and management

- **CloudWatch / Azure Monitor / Stackdriver**: each provider's service for metrics, logs and alarms.
- **APM / NPM / RUM**: monitoring for app performance / network performance / real users' experience.
- **SLA (Service Level Agreement)**: the promised level of service, e.g. 99.9% uptime.
- **SLI / SLO**: the measured number (e.g. latency) / the target value for it.
- **Disaster recovery (DR)**: the plan for getting systems back after a major failure.
- **Business continuity planning (BCP)**: the wider plan for keeping the organisation running.
- **RTO (Recovery Time Objective)**: the longest you can afford to be down.
- **RPO (Recovery Point Objective)**: the most data (measured in time) you can afford to lose.
- **MTBF / MTTR**: average time between failures / average time to fix one.
- **SRE (Site Reliability Engineering)**: treating operations as a software engineering problem.
- **Chaos engineering**: breaking things on purpose to prove the system survives.
- **ITSM / ITIL**: managing IT as services / a well-known set of practices for doing so.

### DevOps and automation

- **IaC (Infrastructure as Code)**: describe servers, networks and databases in files and let a tool build them (e.g. Terraform).
- **Configuration management / CaC**: keep system settings in version-controlled files instead of changing them by hand.
- **Infrastructure provisioning**: setting up the infrastructure an app needs.
- **CI (Continuous Integration)**: merge code often; each merge is built and tested automatically.
- **CD (Continuous Deployment)**: changes that pass tests are released automatically.
- **Blue-green deployment**: run two identical production copies and switch traffic to the new one.
- **Canary deployment**: release to a small share of users first, then to everyone.
- **A/B testing**: show two versions to different users and compare results.
- **GitOps**: Git is the source of truth for infrastructure; changes go through Git.
- **TDD / BDD**: write tests first / describe behaviour in shared language with non-developers.
- **MLOps**: DevOps practices applied to machine learning.

### Cost

- **Pay-as-you-go**: pay only for what you use.
- **Reserved instances**: cheaper price in return for committing to use a resource for 1 to 3 years.
- **Spot instances**: spare capacity at a big discount that can be taken back at short notice.
- **Resource tagging**: labels on resources so you can track cost and ownership.
- **Cost optimisation**: cutting waste while keeping performance.
- **FinOps**: shared financial responsibility for cloud spending.
- **TCO / ROI / KPI**: total cost of ownership / return on investment / key performance indicator.

### AWS names worth knowing

EC2 (virtual servers), S3 (object storage), RDS (managed relational DB), VPC, ELB/ALB/NLB/CLB (load balancers), ASG (auto scaling group), EBS (block disks), EFS (shared file system), SNS (notifications), SQS (message queue), SES (email), ACM (TLS certificates), KMS (encryption keys), CloudHSM, WAF, EMR (big-data processing). The glossary also lists Azure and GCP equivalents (e.g. AKS/GKE for Kubernetes, GCS for storage) and data/AI abbreviations (AI, ML, BI, EDA and so on).

---

## Tutorial 1: what it covers

**Title:** Multi-Cloud Architecture Design Challenge. A 3-week team project (3 to 4 students).

**Scenario:** a mid-sized online retailer must move from ageing on-premises servers to a hybrid multi-cloud setup. Its problems: it cannot handle seasonal spikes (Black Friday is about 10 times normal load), it has no disaster recovery, and upkeep is getting expensive. The current setup is described in detail (4 physical web servers, an Oracle database cluster, tape backups with a 24-hour RPO, basic monitoring, 5K normal and 50K peak users, most users in Europe).

**Before starting:** self-check quizzes (cloud basics, networking, Linux command line, console navigation) and a setup checklist: AWS, Azure and GCP student accounts, Terraform installed, a team Git repo, a diagram tool, a team chat channel.

### Week 1: discovery and analysis

- **1.1 Current-state analysis (individual):** a short report with a diagram of today's system, bottlenecks, security weaknesses, current costs and business impact. Tasks: work out utilisation, find single points of failure, estimate downtime cost (a fixed hourly cost is given), map data flows. Uses simple command-line log analysis (`wget`, `curl`, `tail`, `grep`).
- **1.2 Provider research (team):** each member studies one provider (AWS, Azure, GCP) for compute, database, load balancing and scaling, storage and CDN, then the team fills a weighted comparison matrix (compute, database migration, global reach, 3-year cost, security, support/SLA).
- **Lab 1.2:** price the same setup in each provider's pricing calculator; compare pay-as-you-go with reserved pricing; document assumptions.

### Week 2: architecture design

- **2.1 High-level design (team).** Constraints: a monthly budget cap, 99.9% uptime, under 2-second page loads worldwide, GDPR compliance, survive 10x spikes, RTO under 4 hours, RPO under 1 hour. Decisions to make: primary vs backup provider; web tier (load balancer, auto scaling, containers vs VMs, CDN); app tier (microservices vs monolith, API gateway, sessions, caching); database tier (lift-and-shift vs refactor, backup and replication, data residency).
- **Lab 2.1:** draw network, data-flow, security-zone and DR diagrams; start a Terraform skeleton with providers and modules for a primary and a DR environment.
- **2.2 Detailed specs by role:** Cloud Architect (network topology, security groups, VPC peering, DNS), Database Engineer (migration, tuning, backup, cross-region sync), DevOps Engineer (CI/CD, IaC, monitoring, deployment automation), Security Engineer (IAM, encryption, compliance mapping, incident response).
- **Lab 2.2:** list regions and availability zones with the AWS CLI; **subnet exercise:** given a 10.0.0.0/16 VPC, work out CIDR blocks for public, private and database subnets across 3 AZs; query an Oracle schema for migration issues; tick through a security checklist (VPC isolation, security groups, network ACLs, encryption at rest, TLS 1.3, key management, IAM roles, MFA, access reviews).

### Week 3: implementation and validation

- **3.1 Proof of concept:** deploy a basic web app on two providers, a replicated database, load balancing and auto scaling, monitoring with alerts, and show failover working. Steps: `terraform init/plan/apply`, check resources with the AWS CLI, deploy the app with `docker-compose`, check a `/health` endpoint with `curl`.
- **Testing:** load test with Apache Bench (`ab`), watch CPU metrics in CloudWatch to see scaling, then stop a primary instance and confirm the backup site answers.
- **3.2 Cost optimisation and final report:** right-size servers, plan reserved instances, use cheaper storage tiers, cut data-transfer costs; use AWS Cost Explorer and Azure budgets; fill a cost-savings report template.

### Detailed labs

- **Lab 1.A, AWS multi-AZ deployment (about 2 hours):** a Terraform VPC (10.0.0.0/16) is given; students add public and private subnets across 3 AZs, internet and NAT gateways, security groups for web and DB, an ALB, an auto scaling group and a Multi-AZ RDS database. Then SSH in, install Docker, run the app container with DB settings passed as environment variables, and load test.
  - **Lab questions:** What happens when you terminate one web server? How long does auto scaling take to replace it? What if a whole AZ fails? What does this cost per month?
- **Lab 1.B, Azure Site Recovery (about 1.5 hours):** create a recovery vault, enable replication, run a test failover, and see RTO and RPO in practice.

### Assessment

Individual 40% (technical understanding, problem solving, documentation, creativity), team 35% (collaboration, communication, project management, integration), technical implementation 25% (architecture, cost optimisation, security, working proof of concept). Weekly milestones end in a checkpoint presentation, a mentor review and a final demo.

### Extra material

Guest talks, industry case studies (Airbnb, Spotify, Netflix), reading lists, practice datasets, and a long list of YouTube videos with a week-by-week viewing plan and discussion questions (how patterns relate to your design; cost vs performance vs reliability trade-offs; what the videos left out).

### Key takeaways

- Start from the requirements and numbers (traffic, budget, uptime, RTO/RPO) and justify every design choice against them.
- Use a tiered network: public subnet for the load balancer, private subnets for app and database, spread over several AZs.
- Build everything with IaC (Terraform) so it can be recreated and reviewed.
- Prove resilience by breaking things: kill a server, fail over, measure recovery.
- Cost is a design requirement, not an afterthought: estimate it early and optimise it at the end.
- Security is a checklist across network, data and identity, not one feature.

---

## Prerequisites primer

The primer covers four areas: operating systems, computer networks, databases, and programming (Python and Java). It has no separate Linux section; Linux commands appear throughout the OS and networking parts. Each part ends with a "cloud readiness checklist" and an e-commerce case study on AWS.

### Operating systems

**What you must know**

- **OS roles:** share out CPU, memory, storage and devices; run programs; keep users and programs apart.
- **Kernel vs user mode:** the kernel has full hardware access; apps must ask it through **system calls** (e.g. open a file, start a process).
- **Process:** a running program with its own memory. **Thread:** a lighter unit of work inside a process that shares its memory.
- **Process states:** new, ready, running, waiting (for I/O), terminated. On Linux, `fork()` copies a process and `exec()` swaps in a new program.
- **CPU scheduling:** deciding which process gets the CPU next (first-come, shortest job, round robin, priority). Linux uses CFS ("completely fair scheduler").
- **IPC (inter-process communication):** shared memory, messages, pipes (`ls | grep`), sockets (network). **Signals** such as SIGINT (Ctrl+C) and SIGKILL tell processes to stop; container platforms use them to shut containers down.
- **Concurrency:** a **race condition** is two threads changing shared data at once; a **mutex** or **semaphore** lets only one in at a time.
- **Deadlock:** processes each wait forever for something another holds. Happens in databases too (including PostgreSQL); Kubernetes health probes restart stuck containers.
- **Memory:** programs see virtual addresses; the hardware maps them to real RAM in fixed-size **pages**. When RAM is full, pages go to **swap** on disk.
- **File systems:** ext4 is the Linux default and **journals** changes so a crash does not corrupt it. Each file's details live in an **inode**. Permissions are read/write/execute for user, group and others.
- **Virtualisation:** a hypervisor runs guest OSes in VMs (EC2 is built on this).
- **Containers:** share the host's kernel. Isolation comes from **namespaces** (each container sees its own processes, network, files) and limits from **cgroups** (cap CPU and memory). Docker, containerd and Podman are container runtimes.
- **Serverless:** functions run in tiny, short-lived VMs (Lambda uses Firecracker). A **cold start** is the delay when a new one has to boot.
- **Tuning:** settings like `vm.swappiness` (how eagerly to swap) and TCP buffer sizes, changed with `sysctl`.

**Concepts that come up most:** processes, namespaces and cgroups, containers vs VMs, file permissions, ext4 journaling.

**Readiness checklist:** know Linux commands (bash, `systemctl`, `htop`), understand system calls (`strace`), try Docker and Kubernetes.

### Computer networks

**What you must know**

- **OSI model (7 layers)** and the simpler **TCP/IP model (4 layers)**: physical/link, network (IP), transport (TCP/UDP), application (HTTP, DNS). Each layer wraps the data with its own header.
- **IPv4 addresses and CIDR:** /24 is 256 addresses, /16 is 65,536. Private ranges are 10.0.0.0/8, 172.16.0.0/12 and 192.168.0.0/16.
- **Subnetting example used throughout:** VPC 10.0.0.0/16, public subnet 10.0.1.0/24, private subnet 10.0.2.0/24.
- **Routing:** a route table says where to send each destination (in a VPC: to the internet gateway, the NAT gateway or a peer).
- **TCP vs UDP:** TCP is reliable and ordered (handshake, acknowledgements), used for APIs and databases; UDP is fast with no guarantees, used for DNS and streaming.
- **TCP handshake:** SYN, SYN-ACK, ACK to open; FIN/ACK to close. Reusing connections (**connection pooling**) avoids repeating this.
- **Common ports:** HTTP 80, HTTPS 443, SSH 22, DNS 53, PostgreSQL 5432.
- **Load balancers:** Layer 4 balances raw TCP (AWS NLB); Layer 7 understands HTTP (AWS ALB). They can end TLS so backends get plain HTTP.
- **Security:** firewalls can be **stateful** (remember connections, like AWS security groups) or stateless; use TLS for encryption; WAF for web attacks; split workloads into separate subnets.
- **VPN:** site-to-site (office to VPC) or remote access (person to VPC). IPSec, OpenVPN and WireGuard are common.
- **VPC parts:** public and private subnets, route tables, internet gateway, NAT gateway, peering, **flow logs** (records of traffic for debugging).
- **Network layouts:** flat (one subnet, no isolation), **tiered** (separate web, app and DB subnets; the usual choice), hub-and-spoke (central hub joining many VPCs).
- **Common problems:** packet loss, latency between regions, and security groups blocking a port you needed.

**Readiness checklist:** know Linux networking (`ip`, `tcpdump`, `dig`), set up a VPC in a cloud, look at Kubernetes networking.

### Database systems

**What you must know**

- **Relational model:** tables of rows and columns; a **primary key** identifies a row; a **foreign key** links to another table.
- **SQL groups:** DDL defines structure (CREATE, ALTER, DROP); DML changes data (INSERT, UPDATE, DELETE); SELECT reads; DCL sets permissions (GRANT, REVOKE).
- **Normalisation:** split data into tables to avoid repeats (1NF, 2NF, 3NF). **Denormalisation** adds repeats on purpose for faster reads.
- **Indexes:** speed up WHERE, JOIN and ORDER BY at the cost of storage and slower writes. B-tree is the default. Use `EXPLAIN` to see how a query runs.
- **Transactions and ACID:** a group of changes that all succeed or all fail (Atomicity), keep the rules (Consistency), do not see each other's half-done work (Isolation) and survive crashes once committed (Durability). Written as BEGIN ... COMMIT.
- **Concurrency control:** locks, or **MVCC** (PostgreSQL keeps several versions of a row so readers do not block writers). Isolation levels go from read uncommitted up to serializable.
- **Recovery:** **write-ahead logging (WAL)** records changes before applying them; **point-in-time recovery** restores to an exact moment. Managed services like RDS automate both.
- **Replication:** copies of data on other servers. Synchronous waits for all copies; asynchronous is faster but copies can lag. **Read replicas** take read traffic off the main database.
- **Sharding:** splitting rows across servers by a key.
- **CAP theorem:** when the network splits, a distributed system must choose between consistency and availability.
- **NoSQL types:** document (MongoDB), key-value (Redis, DynamoDB), column-family (Cassandra), graph (Neo4j). PostgreSQL's **JSONB** lets a relational database store documents too.
- **Caching:** Redis in front of the database for hot data and sessions.
- **Database security:** **SQL injection** is stopped by parameterised queries; encrypt at rest and in transit (TLS); restrict access with IAM and security groups; keep the database in a private subnet; log access; hide personal data where possible. GDPR and HIPAA compliance is easier with managed services.
- **Database per service:** each microservice owns its data; cross-service updates use events or the **saga** pattern.
- **Observability:** watch query latency, throughput, errors and deadlocks; in PostgreSQL, `pg_stat_activity` shows what is running.

**Readiness checklist:** master SELECT and JOIN, try a managed cloud database on a free tier, study event-driven patterns.

### Programming (Python and Java)

The primer uses Python and Java. The ideas carry over to any language, including our Node/TypeScript stack.

**What you must know**

- **Basics:** types, control flow, functions, modules, collections, classes and objects.
- **Type hints / strong typing:** declare types to catch mistakes early (the same idea as TypeScript).
- **JSON and YAML:** parse API responses and config files.
- **Error handling:** catch errors from cloud APIs and log them clearly.
- **Retries with exponential backoff:** retry a failed cloud call after waiting 2, then 4, then 8 seconds, and so on. A **circuit breaker** stops calling a service that keeps failing.
- **Logging:** structured (JSON) logs, sent to CloudWatch.
- **Calling REST APIs:** HTTP client with timeouts, retries and a bearer token in the header.
- **Web APIs:** Flask/FastAPI (Python) and Spring Boot (Java) examples; input validation (Pydantic); a **health endpoint** (Spring's `/actuator/health`).
- **Async code:** handle many slow I/O tasks (API calls, DB queries) at once.
- **Dependency isolation:** virtual environments and a locked dependency list (`requirements.txt`, Maven `pom.xml`) for repeatable builds.
- **Cloud SDKs:** boto3 (Python) and AWS SDK v2 (Java) to create EC2 instances, upload to S3 and so on.
- **Serverless:** a Lambda handler takes an `event` and `context` and returns a result; triggers include S3, API Gateway and EventBridge. Keep packages small to shorten cold starts.
- **Testing:** unit tests (pytest, JUnit) and **mocking** cloud SDKs so tests do not create real (paid) resources.
- **Containers:** a Dockerfile copies in the built app, exposes a port and sets the start command; **multi-stage builds** keep the final image small.
- **CI/CD:** an example GitHub Actions pipeline checks out code, builds, builds a Docker image, pushes it and deploys.
- **Observability:** logs, metrics (Prometheus) and traces (OpenTelemetry).

### Linux and networking commands we actually use

Only commands the primer or tutorial mention.

| Command | What it does |
|---|---|
| `ssh -i key.pem user@host` | Log in to a remote server with a key file (port 22). |
| `sudo yum update -y` / `sudo yum install -y docker` | Update packages / install Docker on Amazon Linux. |
| `sudo service docker start`, `systemctl` | Start a service / manage services (start, stop, status). |
| `sudo usermod -a -G docker ec2-user` | Let a user run Docker without sudo. |
| `ps`, `top`, `htop` | List running processes / watch CPU and memory live. |
| `tail -f file \| grep text` | Follow a log as it grows and keep only matching lines. |
| `ls \| grep` | Pipe one command's output into another. |
| `strace` | Show the system calls a program makes. |
| `sysctl` | Read or change kernel settings (e.g. `vm.swappiness`). |
| `ping host` | Check a host is reachable. |
| `traceroute host` | Show the path packets take. |
| `netstat` / `ss` | List open connections and listening ports. |
| `ip` | Show and change network interfaces and routes. |
| `tcpdump` | Capture packets for debugging. |
| `nslookup` / `dig` | Look up DNS records. |
| `curl URL` / `wget URL` | Make an HTTP request / download a file (e.g. hit `/health`). |
| `docker build -t name .` / `docker run -p 80:80 -e KEY=val image` | Build an image / run a container with a port and env vars. |
| `docker-compose up -d` | Start a multi-container app in the background. |
| `terraform init` / `plan` / `apply` | Set up Terraform / preview changes / make them. |
| `terraform output name` | Read a value Terraform produced (e.g. DB endpoint). |
| `aws configure` | Save AWS credentials and default region. |
| `aws ec2 describe-instances`, `aws rds describe-db-instances` | Check what is running. |
| `ab -n 1000 -c 10 URL` | Load test: 1000 requests, 10 at a time. |
| `watch -n 30 'command'` | Re-run a command every 30 seconds. |

---

## How this maps to HealthConnect

- **VPC and tiered subnets:** our VPC should follow the course pattern: load balancer in a public subnet, API servers and PostgreSQL in private subnets, a NAT gateway for outbound updates, spread over at least two AZs. Practise the CIDR exercise (10.0.0.0/16 split into /24s) on our own layout.
- **Security groups:** allow only 80/443 to the load balancer, the API port from the load balancer only, and 5432 (PostgreSQL) from the API servers only. We open **no** SSH port at all: we reach servers through AWS Systems Manager (SSM) instead.
- **Terraform (IaC):** the tutorial's lab is the template for our work: `init`, `plan`, `apply`, with outputs such as the database endpoint passed to the app. Reviewing `plan` output is how we avoid surprises.
- **Docker on Linux servers:** the lab's steps (install Docker, add the user to the docker group, run the container with DB settings as environment variables) are the same steps our servers need. Namespaces and cgroups explain why containers are isolated but share the host kernel.
- **PostgreSQL:** use transactions (ACID) for anything that changes patient records together; parameterised queries against SQL injection; indexes on fields we search; know that MVCC and WAL are why PostgreSQL survives concurrent writes and crashes. Managed RDS automates backups and point-in-time recovery.
- **Health data security:** encryption at rest and in transit (TLS), IAM with least privilege, MFA, audit logs. The glossary's HIPAA and GDPR entries show the kind of rules that apply to medical data; for us the governing law is Ghana's Data Protection Act, 2012 (Act 843), with HIPAA only as a reference checklist (ADR D-005).
- **Lambda (FaaS):** good for event-driven, occasional jobs (e.g. reacting to an upload). Keep the package small to limit cold starts; the handler receives an event and returns a result.
- **Node/TypeScript API:** the primer's programming lessons carry over directly: typed code, retries with backoff on AWS calls, structured JSON logs to CloudWatch, a `/health` endpoint for the load balancer, and mocked AWS calls in tests.
- **Resilience and DR:** set our own RTO and RPO, then test them as Lab 1.A does: stop a server, see whether the system recovers, and time it.
- **Cost:** tag every resource, estimate with the AWS Pricing Calculator, and turn off what we do not need; the tutorial treats cost as something to design for.
