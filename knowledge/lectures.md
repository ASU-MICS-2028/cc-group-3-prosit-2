# Lecture notes (Weeks 1–4)

These are our own summaries of the ICS 534 course slides (originals are on Canvas). Notes for Weeks 5 onward will be added later.

## Week 1: Foundations of cloud computing and problem-based learning

**Key ideas**

- **The course runs on problem-based learning (PBL).** Instead of theory first, each team gets a real problem and builds toward a working system. There are three projects ("PROSITs"): AgroConnect (Weeks 1–5), HealthConnect (Weeks 6–9) and SmartCity Accra (Weeks 10–14).
- **The CESI PBL cycle** has four stages, repeated once per PROSIT: Clarify (what is really being asked), Explore (what users and the literature say), Systematize (which architecture, tools and trade-offs apply) and Implement (build, test with real users, measure impact).
- **History of the cloud is a steady hand-off of work to the provider.** It went from mainframe time-sharing (1960s), to companies running their own servers (1990s), to virtualization (one physical machine running many isolated virtual machines, 2000s), to AWS S3 and EC2 (2006, renting compute by the hour), to containers and PaaS (2010s), to serverless (2014 onward, paying per function call).
- **Cloud computing (NIST definition)** means on-demand network access to a shared pool of configurable computing resources that can be set up and released quickly with little effort.
- **CapEx to OpEx.** Owning servers is a capital expense (big up-front purchase, fixed capacity). The cloud turns this into an operating expense (pay as you go, capacity that can grow and shrink).
- **Service models are a spectrum of control versus convenience.** The more the provider manages, the less control you have but the faster you can ship. A mature system usually mixes models rather than picking one.
- **IaaS (Infrastructure as a Service)** gives you virtual machines. You patch the OS, install the runtime, set firewall rules, plan backups and decide on scaling. Teams pick it for maximum control and no framework lock-in.
- **PaaS (Platform as a Service)** lets you push code and the platform builds, deploys and scales it. You lose some control over the runtime and may pay more per unit of compute.
- **SaaS (Software as a Service)** is finished software you only configure and use. You accept the vendor's data model, security and pricing. Rule from the slides: never build your own payment processor.
- **Deployment models** describe who owns and shares the infrastructure: public (shared, cheapest, fastest to start), private (dedicated, used for sensitive government data), hybrid (a mix) and community (shared by organisations with common concerns, such as a regional health cloud). Local data centres and national data-residency laws (rules about where data must be stored) also matter in Ghana.
- **Community-engaged work has ground rules:** get informed consent before collecting data, respect community leaders, collect only the data the system needs (data minimisation), and use AI tools only when explicitly allowed.
- **A cloud architect** turns community or business needs into a design they can justify, then explains it to both engineers and non-technical people. "It is the default" is never a justification.
- **Netflix case study:** design for failure (Chaos Monkey randomly kills production servers to prove the system survives), autoscale (capacity follows real demand) and split the system into many small services.

**Numbers, models and frameworks to remember**

- NIST SP 800-145, five essential characteristics:
  1. On-demand self-service: you create resources yourself, any time, with no human at the provider involved.
  2. Broad network access: reachable over standard internet protocols from phones, laptops and tablets.
  3. Resource pooling (multi-tenancy): many customers share physical hosts, kept apart by the hypervisor (the software that runs virtual machines); you do not control the exact physical location.
  4. Rapid elasticity: capacity seems unlimited and can be added or removed at any time (in practice limited by account quotas).
  5. Measured service: every byte and second is metered, which makes pay-per-use possible.
- Service model responsibility split:

  | Model | You manage | Provider manages | Examples |
  |---|---|---|---|
  | IaaS | OS, runtime, data, apps | Servers, storage, network, virtualization | EC2, Azure VMs, Compute Engine |
  | PaaS | Data, app code | The above plus OS, runtime, middleware | Elastic Beanstalk, App Service, App Engine |
  | SaaS | Configuration and data only | Everything else | Gmail, Salesforce, Canvas |

- Four deployment models: public, private, hybrid, community.
- CESI cycle order: Clarify, Explore, Systematize, Implement.
- Course assessment: quizzes and tests 15%, labs and projects 25%, midterm 15%, attendance 5%, final exam 20% and final project 20%. Each PROSIT is graded on technical excellence, community/context impact, innovation and autonomous learning.
- Decisions every PROSIT must justify: cloud platform (global or African provider), SQL or NoSQL, authentication method, offline strategy (local storage plus sync), and security (encryption and privacy).
- Provider strengths as given: AWS has the broadest catalogue, Azure the strongest enterprise and government integration, GCP the strongest data and ML tooling.
- AgroConnect context figures: 15,000+ farmers; 70% basic smartphones, 25% feature phones, 5% no phone; intermittent 2G/3G.

**Likely exam questions**

- State the NIST definition of cloud computing and its five essential characteristics. (Hint: self-service, network access, pooling, elasticity, measured service.)
- Compare IaaS, PaaS and SaaS: what does the customer manage in each? Give an example of each. (Hint: control versus convenience.)
- A university wants hosted email and never wants to run a mail server again. Which service model? And a team that needs full OS control for a custom driver? (Hint: SaaS; IaaS.)
- Which NIST characteristic makes pay-per-use cost models possible? (Hint: measured service.)
- Name the four deployment models and say when you would use a private or hybrid cloud. (Hint: sensitive government data.)

**Where HealthConnect uses this**

- HealthConnect mixes service models: EC2 compute is IaaS, RDS PostgreSQL is a managed (PaaS-style) database, and Lambda later is serverless. Lab reports should justify each choice as a control-versus-convenience trade-off.
- Health records are sensitive, so the ground rules apply directly: data minimisation, consent, and thinking about data residency.

## Week 2: Cloud architecture for scalability, elasticity and fault tolerance

**Key ideas**

- **Three different properties, often confused.** Scalability means the system can handle more load by adding resources (by hand or automatically). Elasticity means resources grow and shrink automatically with demand, and you pay only for what you use. Fault tolerance means the system keeps working correctly when a part fails.
- **They are independent.** A system can be scalable but not elastic (a human must add servers), or elastic but not fault tolerant (auto-scaling does not fix a single point of failure, meaning one part whose failure stops everything).
- **Vertical scaling** (scale up) means moving to a bigger machine. **Horizontal scaling** (scale out) means adding more machines behind a load balancer (a component that spreads requests across servers).
- **Stateless versus stateful.** A stateless service keeps no request data on one particular server, so any server can handle any request. A stateful service depends on data stored on one server (for example an in-memory login session). Statelessness is what makes horizontal scaling and auto-scaling safe.
- **How to make a service stateless:** move session data to a shared store such as Redis, a database, or a signed token held by the client (JWT, a JSON Web Token). Course rule: the API tier is stateless; the database is where state lives.
- **Fault tolerance patterns:** redundancy (two or more copies of anything critical), health checks with auto-healing (the load balancer stops sending traffic to a broken server and the auto-scaling group replaces it), graceful degradation (if one feature fails, the rest still works) and circuit breakers (stop calling a failing service, fail fast, retry later).
- **In rural areas, fault tolerance also means tolerating network failure,** which is why the client must work offline.
- **Proportionality, not perfection.** A class project does not need extreme availability, but it does need an honest, written answer to "what happens when this part fails?"
- **Regions and Availability Zones.** A region is a geographic area (the slides name eu-west-1, Ireland, as the closest AWS region to West Africa). An Availability Zone (AZ) is an isolated data centre inside a region; deploying across two or more AZs gives resilience.
- **Latency is physics.** Accra to a European region is about 120–180 ms round trip, and 2G/3G adds more, so one request can take 300–500 ms before the app even starts work. Reduce round trips, batch requests, cache, and avoid chaining calls one after another.
- **Disaster recovery (DR)** is the plan for getting back after a major failure. RTO (Recovery Time Objective) is how long you can be down. RPO (Recovery Point Objective) is how much data, measured in time since the last backup, you can afford to lose. State both explicitly, even if the target is modest.
- **Observability** means being able to see what the system is doing. Logs are timestamped events, metrics are numbers over time (requests per second, CPU), and traces follow one request across several services. Minimum for an MVP: durable application logs plus the provider's basic metrics.
- **Instance sizing.** Pick the instance family that matches the workload. A bursty, mostly idle API suits burstable or general-purpose instances. Buying a compute-optimised instance for a workload that mostly waits on the database wastes money.
- **Single-region risk.** Several outages in AWS us-east-1 showed that a single-region design has a limit on how available it can be. For an MVP it is fine to accept that risk, as long as you say so.
- **Architecture Decision Record (ADR):** a short document for one significant decision. It records context, options, the choice and its consequences. Keep a running log.
- **Vendor lock-in** is when moving off a provider's proprietary service becomes too costly. Standard Linux VMs, Docker containers and Postgres are portable; deeply provider-specific services are not. Accept lock-in on purpose and record it in an ADR.

**Numbers, models and frameworks to remember**

- AWS Well-Architected Framework, six pillars: Operational Excellence, Security, Reliability, Performance Efficiency, Cost Optimization, Sustainability. Every architecture report should address all six.
- Vertical versus horizontal scaling:

  | | Vertical | Horizontal |
  |---|---|---|
  | Method | Bigger instance | More instances behind a load balancer |
  | Ceiling | Largest instance type | Effectively unlimited |
  | Downtime | Usually needs a restart | Add or remove with no downtime |
  | Best for | Databases at first, stateful legacy apps | Stateless web and API tiers |

- Availability "nines" (approximate downtime):

  | Availability | Per year | Per month |
  |---|---|---|
  | 99% | 3.65 days | 7.3 hours |
  | 99.9% | 8.76 hours | 43.8 minutes |
  | 99.95% | 4.38 hours | 21.9 minutes |
  | 99.99% | 52.6 minutes | 4.4 minutes |

- Series availability formula: overall availability = A1 x A2 x ... for parts chained in series. Two parts at 99.9% each give about 99.8%. Redundant (parallel) parts raise availability.
- Course availability targets: HealthConnect 99.7% (Week 9), SmartCity 99.5% (Week 10).
- DR strategies, cheapest to most resilient:

  | Strategy | Typical RTO | Typical RPO | Cost |
  |---|---|---|---|
  | Backup and restore | Hours | Hours | Lowest |
  | Pilot light | Tens of minutes | Minutes | Low to medium |
  | Warm standby | Minutes | Seconds to minutes | Medium to high |
  | Multi-site active/active | Near zero | Near zero | Highest |

- Latency perception: under ~100 ms feels instant, 100–300 ms responsive, over 1 s sluggish, over 10 s looks broken.
- Instance families: general purpose (AWS t3, m5), compute-optimised (c5), memory-optimised (r5), burstable (t3). Free-tier starter VMs: AWS t3.micro, Azure B1s, GCP e2-micro.
- ADR template: Title, Status, Context, Decision, Consequences.

**Likely exam questions**

- A rule launches a new server when CPU passes 80%. Is that scalability, elasticity or both? (Hint: automatic, so elasticity, which also shows scalability.)
- Why does storing user sessions in a server's local memory break horizontal scaling? (Hint: the next request may hit a different server.)
- Explain RTO and RPO, and rank the four DR strategies by cost and recovery speed.
- Two components at 99.9% are chained in series. What is the overall availability, and how would you improve it? (Hint: multiply; add redundancy.)
- Name the six Well-Architected pillars and say which ones an instance-sizing decision should address. (Hint: Performance Efficiency, Cost Optimization.)

**Where HealthConnect uses this**

- The Node API sits behind a load balancer in a VPC and must be stateless (sessions in tokens or the database, not in server memory) so it can scale horizontally; the load balancer's health checks remove broken instances.
- HealthConnect's 99.7% availability target and its RTO/RPO should be stated in an ADR, along with the choice of region, single-region risk, and multi-AZ options for RDS.
- Latency from Ghana to the nearest region is one reason the PWA must work offline and keep round trips few.

## Week 3: Containerization and microservices (Docker and Kubernetes foundations)

**Key ideas**

- **Containers solve "works on my machine".** A container packages the app and its dependencies (not a whole OS), so it runs the same on a laptop, a VM or a cluster.
- **Containers versus VMs.** A VM runs a full guest OS on a hypervisor. A container is an isolated process that shares the host's OS kernel, so it starts in seconds, is smaller, and many more fit on one host.
- **Docker architecture.** The Docker CLI (client) sends requests to the Docker daemon (dockerd, the background process that builds images and runs containers). A registry stores images. The flow is build, then run, then push.
- **Core Docker terms.** An image is a read-only template. A container is a running instance of an image. A Dockerfile is the step-by-step build recipe. A registry (Docker Hub, AWS ECR) stores and shares images.
- **Immutable infrastructure:** you never patch a running container; you build a new image and redeploy it.
- **Dockerfile good habits:** use a small base image (alpine or slim) for size and a smaller attack surface; copy dependency files before source code so Docker can reuse the cached install step; run as a non-root user.
- **Multi-stage builds** use one stage to build the app and a second, smaller stage that contains only what is needed to run it. This often shrinks images 5–10 times.
- **Containers are ephemeral** (their own filesystem is lost when removed). A named volume is Docker-managed storage that survives removal; a bind mount maps a host folder into the container and is mostly for local development. Real data belongs in a managed database, keeping containers stateless.
- **Health checks.** A container can be running while the app inside is broken. Docker's HEALTHCHECK calls an endpoint such as /health. Kubernetes has a liveness probe (is the app stuck and needing a restart?) and a readiness probe (is it ready to receive traffic?).
- **Microservices** split a system into small services that can be deployed and scaled independently, so one bug does not take down everything. The cost is more operational work (networking, monitoring, data consistency). Draw boundaries along team boundaries and independent scaling needs, and do not over-split a small team's MVP.
- **Kubernetes (K8s)** is a system that runs containers across machines and keeps them at a declared "desired state". A Pod is the smallest unit (one or more tightly linked containers). A Deployment keeps a set number of Pod copies running and handles updates. A Service gives Pods a stable network address and load balancing. A Namespace separates environments inside one cluster.
- **Kubernetes architecture.** The control plane (the brain) has the API server, the scheduler (chooses which node runs a Pod), the controller manager (makes reality match desired state) and etcd (the cluster's database). Worker nodes run the kubelet (the node agent) and a container runtime (containerd or CRI-O).
- **Declarative YAML manifests** describe what you want and are kept in version control, instead of typing one-off commands. This leads into Infrastructure as Code later.
- **ConfigMaps and Secrets** inject configuration into Pods. Secrets are only base64-encoded (an encoding, not encryption) unless encryption at rest is turned on, so they are not enough by themselves for very sensitive data. Never bake secrets into an image.
- **Rolling updates** replace old Pods with new ones gradually so the service stays up; a rollout undo returns to the previous version.
- **Managed Kubernetes** (EKS, AKS, GKE) is usually not justified for a small, short, low-budget MVP. Containers on a VM or a light container service (ECS Fargate, Azure Container Apps, Cloud Run) is often the better choice.
- **Tag images with real version numbers;** do not rely only on ":latest".

**Numbers, models and frameworks to remember**

- Containers versus VMs: VM boots in minutes, images in GBs, tens per host; container starts in seconds (often under 1 s), images in MBs to low GBs, hundreds per host.
- Kubernetes objects: Pod, Deployment, Service, ConfigMap, Secret, Namespace, Ingress (HTTP routing into the cluster from outside).
- Control plane parts: API server, scheduler, controller manager, etcd. Node parts: kubelet, container runtime.
- Probes: liveness (restart if stuck) versus readiness (send traffic only when ready).
- Course rule of thumb: 3–5 microservices maximum per team.
- Multi-stage builds: often 5–10x smaller images.
- Case studies: Google runs billions of containers per week on Borg (which inspired Kubernetes); Spotify moved from a monolith to hundreds of microservices. Both moved because of real pain, not fashion.

**Likely exam questions**

- Why does a container start in under a second while a VM takes minutes? (Hint: shares the host kernel, no OS boot.)
- What is the difference between a Docker named volume and a bind mount?
- In Kubernetes, what is the difference between a liveness probe and a readiness probe?
- Why are Kubernetes Secrets alone not enough protection for highly sensitive data? (Hint: base64 is not encryption.)
- When should a system be split into microservices, and what does it cost? (Hint: team and scaling boundaries; operational complexity.)

**Where HealthConnect uses this**

- The Node API exposes a /health endpoint, which is the same pattern the load balancer uses to decide which instances get traffic.
- Database passwords and API keys must never be committed to the repo or baked into an image; they belong in environment variables or a secrets manager.
- The "do not over-split" advice supports keeping HealthConnect's API small and justifying any extra service in an ADR.

## Week 4: Cloud storage, databases and offline-first architecture

**Key ideas**

- **Three storage types.** Block storage gives raw fixed-size blocks, like a disk (used for VM boot disks and database volumes). Object storage keeps whole files plus metadata, reached over an HTTP API (used for photos, audio, backups, static files). File storage is a shared filesystem many machines can mount (used for shared config or older apps).
- **Store large files in object storage, not in the database.** Keep the file in a bucket and save its reference URL in the database.
- **SQL versus NoSQL.** Relational (SQL) databases have a fixed schema, strong consistency and powerful joins, and usually scale up first. NoSQL (document or key-value) databases have a flexible schema, are tuned for known access patterns, and scale out easily, often with eventual consistency (copies agree after a short delay). Choose based on the data, not on trends.
- **The slides' suggested split:** a small managed relational database (for example Postgres) as the source of truth, plus client-side NoSQL-style local storage for offline use. Teams must justify their own choice.
- **ACID versus BASE.** ACID transactions either fully happen or not at all and stay safe once committed. BASE systems favour availability and accept that data becomes consistent over time. This is the same tension as the CAP theorem: during a network partition you must choose consistency or availability.
- **Indexes** (usually a B-tree) let the database jump straight to matching rows instead of scanning every row. Each index costs storage and slows writes, so index the columns you often filter or join on, not every column.
- **Normalisation** splits data into related tables to avoid repeating it (for example a people table and a separate table linked by an ID). **Denormalisation** copies data on purpose to avoid joins and speed up reads. Prefer a normalised relational schema at MVP scale.
- **Progressive Web App (PWA):** a web app that behaves like a native app. It needs no app store, is small, runs on older Android phones and uses data efficiently.
- **Service worker:** a background script that intercepts network requests and makes offline behaviour possible. It only runs over HTTPS.
- **Web App Manifest:** a JSON file (name, icons, start URL, display mode, colours, language) that makes the app installable to the home screen.
- **Caching strategies, chosen per type of data:** cache-first (fast but can be stale; good for data that rarely changes), network-first (freshest when online, falls back to cache; good for data that changes often) and stale-while-revalidate (show the cached copy now and fetch a fresh one in the background for next time).
- **Cache API versus IndexedDB.** The Cache API stores HTTP request and response pairs (static files, GET responses). IndexedDB is a full transactional database inside the browser, the right place to queue structured writes made offline. The idb library is a small Promise-based wrapper that makes it easier to use.
- **Background Sync:** the client saves pending writes locally (in IndexedDB), and a sync event replays them against the API when connectivity returns.
- **Conflict resolution** is the hard part of offline-first: what happens when two people edit the same record while offline? Options, from simplest to most robust: last-write-wins by timestamp (simple, can silently lose data), field-level merge (only fields that actually clash need resolving) and an application-level conflict queue (a human decides). Last-write-wins is acceptable for an MVP only if it is documented as a known limitation.
- **Replication** keeps copies of data on several machines for fault tolerance and read scaling. In leader-follower (primary-replica) replication, all writes go to the leader and reads can be spread across followers. Replication lag means a follower may be briefly out of date, so a user may not immediately see their own write.
- **Backups.** Minimum policy: automated daily snapshots kept for at least 7 days. State the retention period and recovery point (links back to RPO), and test a restore at least once; an untested backup is only a hope.
- **Migrations** are version-controlled scripts that change the database schema in a repeatable way (tools such as node-pg-migrate, Flyway, or numbered .sql files). Every schema change lives in Git and is applied the same way everywhere, never by hand in a database GUI.
- **Common storage mistakes:** making a bucket public by accident (default to private), storing large binaries inside the relational database, and treating offline-first as an afterthought.
- **Messaging apps (WhatsApp, Signal)** queue messages offline and send them later, like Background Sync. Ordering across devices uses advanced tools such as vector clocks and CRDTs (Conflict-free Replicated Data Types), which are out of scope but worth knowing by name.

**Numbers, models and frameworks to remember**

- Storage types: block (EBS, Azure Managed Disks, Persistent Disk), object (S3, Blob Storage, Cloud Storage), file (EFS, Azure Files, Filestore).
- SQL examples: RDS/Aurora, Azure SQL, Cloud SQL. NoSQL examples: DynamoDB, Cosmos DB, Firestore, MongoDB Atlas.
- ACID: Atomicity, Consistency, Isolation, Durability. BASE: Basically Available, Soft state, Eventually consistent.
- CAP theorem (as given in the slides): under a network partition, choose consistency or availability, not both.
- Four PWA technologies: service worker, Web App Manifest, HTTPS, responsive design.
- Three caching strategies: cache-first, network-first, stale-while-revalidate.
- Three conflict strategies: last-write-wins, field-level merge, conflict queue.
- Backup minimum: daily automated snapshots, 7-day retention, test a restore.
- MVP database size: a small db.t3.micro-class managed instance is enough.

**Likely exam questions**

- Why store an uploaded image in object storage with a database reference instead of in the database itself?
- Why choose stale-while-revalidate (or network-first) over cache-first for data that changes often? (Hint: freshness versus speed.)
- What problem does an index solve, and what does it cost you?
- Name one difference between the Cache API and IndexedDB. (Hint: HTTP responses versus structured queued writes.)
- Two people edit the same record offline and both sync later. What does last-write-wins do, and what would field-level merge change?

**Where HealthConnect uses this**

- RDS PostgreSQL is the ACID source of truth for health records, with a normalised schema, indexes on frequently searched columns, schema changes as migration files in Git, and automated backups with a stated retention and RPO.
- The offline PWA uses a service worker and manifest, caches the app shell with the Cache API, queues offline writes in IndexedDB and replays them with Background Sync; the chosen conflict strategy (for example last-write-wins) must be documented as a known limitation.
- Any stored files (scans, attachments) belong in a private object storage bucket, never a public one, with only a reference in the database.

## Cross-week glossary

- **ACID:** database guarantee that a transaction fully happens or not at all and is safe once committed.
- **ADR (Architecture Decision Record):** a short document recording one design decision, its context, options and consequences.
- **Availability Zone (AZ):** an isolated data centre inside a cloud region; spreading across AZs adds resilience.
- **BASE:** a model that favours availability and lets data become consistent over time.
- **CAP theorem:** during a network partition a distributed system must choose consistency or availability.
- **Container:** an app and its dependencies packaged to run as an isolated process sharing the host kernel.
- **Elasticity:** resources grow and shrink automatically with demand, and you pay only for what you use.
- **Fault tolerance:** the system keeps working correctly when a component fails.
- **Horizontal scaling:** adding more machines behind a load balancer (scale out).
- **IaaS / PaaS / SaaS:** service models where the provider manages progressively more of the stack.
- **Index:** a data structure that speeds up lookups at the cost of storage and slower writes.
- **IndexedDB:** a transactional database built into the browser, used to queue offline writes.
- **Leader-follower replication:** all writes go to one leader that copies changes to read-only followers.
- **Load balancer:** spreads incoming requests across healthy servers and stops routing to failed ones.
- **Microservice:** a small, independently deployable service owning one part of the system.
- **Object storage:** stores whole files plus metadata reached over HTTP (for example S3).
- **PWA (Progressive Web App):** a web app that is installable and can work offline like a native app.
- **Region:** a geographic area containing several Availability Zones.
- **RPO (Recovery Point Objective):** the maximum data loss you can accept, measured in time since the last backup.
- **RTO (Recovery Time Objective):** the maximum time the system can be down before it is unacceptable.
- **Service worker:** a background browser script that intercepts requests and enables offline behaviour.
- **Stateless service:** a service where any instance can handle any request because no data lives only on one instance.
- **Vendor lock-in:** when leaving a provider's proprietary service becomes too costly to be realistic.
- **Well-Architected Framework:** AWS's six pillars for judging an architecture (operations, security, reliability, performance, cost, sustainability).
