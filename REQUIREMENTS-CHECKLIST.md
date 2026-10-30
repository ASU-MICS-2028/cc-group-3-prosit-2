# HealthConnect Ghana — Full Requirements Checklist (PROSIT 2)

Every requirement in `cloud_computing_Prosit_2.pdf`, page by page, with how the app meets it.
**Scope: the full brief (Weeks 1–4).** Nothing is "deferred" without a written reason.

**How each item is met**
- **Build:** working feature in the app.
- **Build (sandbox):** working feature against a test/mock service with the same interface as the real one, clearly labelled "Test mode". Used where the real partner system needs access a student team can't get (NHIS, DHIMS2, WHO, hospitals, pharmacies).
- **Design:** documented in the report with an architecture diagram, not built. Must say why.

---

## Users and roles (p.6–7)

| Role | Who | Main jobs in the app |
|---|---|---|
| **CHV** (Community Health Volunteer) | Trained local volunteer | Register patients, consent, vitals, photos, voice notes, follow-ups, referrals, emergencies, surveys, maternal/child visits, book consultations, join calls |
| **Patient** | Rural patient, mixed literacy | Consent (voice/visual), appointments, video call, pay fee, insurance premium, reminders, health education. Mostly through the CHV's phone or SMS |
| **Doctor / nurse / specialist** | Urban health professionals | Appointments, patient history, video consultation, prescriptions, referral inbox, emergency escalation |
| **Pharmacist** | Licensed pharmacy | Verify and dispense prescriptions |
| **Traditional healer** (certified) | Community healer | Collaboration: receive/refer patients with consent, share remedies in use (W4) |
| **GHS official** | District/regional officer | Surveillance dashboard, map, outbreak alerts, policy dashboard, SDG 3 dashboard |
| **Health centre admin** | Facility/community lead | Manage local users, stock, training, reports (community ownership tools) |
| **Platform admin** | Team | Users, roles, audit log, system settings |

Access is role-based and enforced on the server, not only hidden in the UI (p.2).

---

## Week 1 — Community health record system (p.2)

| Requirement | How we meet it | Type |
|---|---|---|
| Offline PWA for patient data | Service worker + encrypted IndexedDB, sync queue | Build |
| "HIPAA-compliant" | Design against HIPAA Security Rule safeguards (access control, audit, integrity, transmission security, backup); **Ghana Data Protection Act 2012 (Act 843)** as the legal basis. Both in the report | Build + Design |
| Biometric (fingerprint) for illiterate patients | Staff login with phone fingerprint (WebAuthn). Patient identity: photo + spoken consent recorded on the CHV's phone. Report explains why patient fingerprints on a shared phone aren't reliable, and how a USB fingerprint scanner at facilities would work | Build (partial) + Design |
| Five languages: English, Twi, Ewe, Dagbani, Hausa | All five language files; English and Twi complete; others marked for native-speaker completion | Build |
| Voice-to-text for limited literacy | Offline voice notes on every free-text field; server transcription when online (labelled); Listen buttons for instructions and consent | Build |
| Photo documentation (skin, wounds) | Capture, compress on phone (~100 KB), encrypted storage, sync after text | Build |
| Vital signs: BP, temperature, weight, height | Vitals entry, history chart, range flags (thresholds from medical partner) | Build |
| Ghana Data Protection Act compliance | Consent per purpose, data minimisation, access logs, right to view own data | Build |
| End-to-end encryption | TLS in transit; device data encrypted with a key unlocked by the PIN (WebCrypto); field-level encryption of sensitive fields on the server (KMS); video calls encrypted by WebRTC (DTLS-SRTP). Report states honestly what is and isn't strictly end-to-end | Build |
| Role-based access for worker levels | Roles above, server-enforced | Build |
| Audit trails for all access/changes | Every read/write logged (who, what, when); audit viewer for admins | Build |
| Secure backup and sync | Encrypted sync with conflict handling; automated database backups (cloud) | Build (cloud lead) |
| Real patient data with consent; Dodowa CHV training; traditional healer and community leader engagement | Consent flow in app; field testing and engagement documented | Process + Build |
| Choose and justify: cloud health platform (HealthLake / Azure Health / GCP Healthcare API) | Team decision, justified in report | Design (cloud lead) |
| FHIR-compliant records | Patient, Observation (vitals), Media (photos), Encounter, Appointment, ServiceRequest (referral), MedicationRequest (prescription) resources | Build |
| OAuth 2.0 / JWT, encryption | JWT access + refresh tokens, roles in claims | Build |
| Offline storage with conflict resolution | Per-record version numbers; server detects conflicts; "Needs attention" screen to resolve | Build |
| GHS systems integration | Sandbox adapter (FHIR export) | Build (sandbox) + Design |

## Week 2 — Telemedicine (p.3)

| Requirement | How we meet it | Type |
|---|---|---|
| Low-bandwidth video for 2G/3G | WebRTC with low-resolution profile, automatic audio-only fallback, connection indicator | Build |
| Appointment scheduling across time zones and languages | Slots stored in UTC, shown in local time; reminders in patient's language | Build |
| Digital prescriptions with pharmacy integration | Doctor writes prescription; patient gets code + QR; pharmacy screen verifies and marks dispensed | Build (sandbox pharmacy) |
| Consultation fee via mobile money | Reuse PROSIT 1 payments-service (Flutterwave test mode) | Build |
| Medical image sharing (X-rays, lab results) with compression | Upload/compress images, viewer for doctors | Build |
| Specialist referral with automatic prioritisation | Rule-based priority from danger signs and vitals (rules from medical partner); referral inbox sorted by priority | Build |
| Multi-hospital integration (Korle-Bu, KATH) | Facility directory + sandbox facility adapter | Build (sandbox) + Design |
| Pharmacy networks (mPharma, Pharmalink) | Sandbox pharmacy API | Build (sandbox) + Design |
| NHIS compatibility | NHIS membership check against a sandbox; NHIS number on patient record | Build (sandbox) + Design |
| Quality assurance: consultation recording and monitoring | Optional recording with both-side consent and visible indicator; QA review list | Build |
| Ghana Medical and Dental Council compliance | Provider licence number required; verification status (sandbox) shown on doctor profile | Build (sandbox) |
| **Must implement:** WebRTC | As above | Build |
| **Must implement:** load balancing | Load balancer from Lab 5 in front of services | Build (cloud lead) |
| **Must implement:** HL7 FHIR | As above | Build |
| **Must implement:** prescription verification and fraud prevention | Signed prescription code, one-time dispense, alerts for repeated/duplicate prescriptions | Build |
| **Must implement:** emergency protocols with automatic escalation | Emergency button, escalation timeline, auto-escalate if not acknowledged, call/SMS fallback offline | Build |
| UG Medical School specialists, Kintampo trials, traditional medicine consultation | Process; specialist role in app | Process |

## Week 3 — Public health monitoring (p.4)

| Requirement | How we meet it | Type |
|---|---|---|
| Disease surveillance dashboard with outbreak detection | Case counts by disease/area over time; outbreak flag when cases exceed the recent baseline (simple, explainable statistical rule) | Build |
| Geospatial health mapping | Map of cases by district (lightweight map, cached tiles or district shapes) | Build |
| Predictive analytics for resources and prevention | Trend projection of cases and stock needs (simple forecasting), labelled as estimates | Build |
| Mobile health surveys | Survey builder (admin), offline survey filling (CHV) | Build |
| Health education in local languages with video/audio | Library of short audio/video lessons, downloadable for offline use | Build |
| Maternal and child tracking with automated reminders | Pregnancy and child records, visit schedule, SMS reminders | Build |
| AI/ML disease prediction from symptoms | Symptom checklist feeding a simple model or rules; clearly labelled "decision support, not diagnosis"; ML model design in report | Build (basic) + Design |
| Automated outbreak alerts to communities | When an outbreak flag is confirmed by an official, SMS alert to the area | Build (SMS sandbox) |
| Resource optimisation for medicines and equipment | Stock levels + suggested redistribution between facilities | Build (basic) |
| Health policy dashboard for GHS officials | Key indicators, filters, export | Build |
| WHO African monitoring integration | Export in standard format (sandbox) | Build (sandbox) + Design |
| DHIMS2 integration | Export aggregate data in DHIS2-compatible format (sandbox) | Build (sandbox) + Design |
| Impact measurement: disease cases, care use, maternal care, education scores, emergency response time | Indicators on the dashboards | Build |

## Week 4 — Health ecosystem and ownership (p.4–5)

| Requirement | How we meet it | Type |
|---|---|---|
| Community health insurance with mobile-money premiums | Plans, enrolment, premium payment via payments-service, coverage status | Build |
| Traditional medicine integration with certified healers | Healer directory (certified), consented two-way referral, record of remedies in use | Build |
| Health supply chain for medicines and equipment | Stock levels per facility, requests, deliveries, low-stock alerts | Build |
| Community health education platform with local content creation | Admins/health workers upload audio/video lessons in local languages | Build |
| Health worker training modules with certification | Short courses, quiz, certificate, continuing education record | Build |
| Revenue model (consultation fees, premiums, training fees) | Revenue summary on admin dashboard; model in report | Build + Design |
| Community ownership tools | Health centre admin: users, stock, reports, settings for their facility only | Build |
| Open-source health modules | Publish selected modules with licence and README | Process |
| Local capacity building | Admin guide; training modules | Build + Process |
| Partnership integration | Partner directory; design | Design |
| SDG 3 impact dashboard | Health and well-being indicators | Build |
| Maternal mortality, UHC, health equity, community health measurement | Indicators on SDG 3 dashboard | Build |

## Cross-cutting (p.1, 6–7, 9)

| Requirement | How we meet it | Type |
|---|---|---|
| 99.7% uptime | Multi-AZ, health checks, load balancer, monitoring | Build (cloud lead) |
| Zero breaches, HIPAA | Security design above; threat model in report | Design + Build |
| Telemedicine works on 2G | Audio-only fallback, low-res video, small assets | Build |
| 50,000+ records, 1,000+ concurrent users | Load test results in report | Build (cloud lead) |
| Interoperability with GHS systems | FHIR + DHIS2 exports | Build (sandbox) |
| Cultural sensitivity, traditional medicine respect | Healer collaboration, respectful copy, language support | Build |
| Frugal, mobile-first, preventive focus | Design system rules; education, surveys, maternal reminders | Build |
| PROSIT 2.5 AgriHealth (optional) | Link AgroConnect nutrition data to health records | Optional |
