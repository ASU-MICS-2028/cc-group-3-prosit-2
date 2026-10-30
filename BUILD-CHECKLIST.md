# Build checklist: the full-brief PWA (Phase 6)

**Tick a box when the thing works on a real phone, not when the code is written.** Progress is counted by `npm run progress` (in `frontend/`).
The task owners and blockers live in [`PLAN.md`](./PLAN.md) (Phase 6); the brief page for every requirement is in [`REQUIREMENTS-CHECKLIST.md`](./REQUIREMENTS-CHECKLIST.md). This file is only the tick-list, so if the two ever disagree, PLAN.md wins.

Legend: `[x]` done · `[ ]` to do · 🔄 being worked on now · 🧪 mock/sandbox (labelled "Test mode")

**Branch rule:** one branch and one PR per step, started from `main` once the previous PR is merged (`feat/fb3-…`, `feat/fb4-…`).

---

## FB-0 Plan and approvals
- [x] Full-brief plan, eight roles, services list (PLAN Phase 6)
- [x] D-028 (Act 843 + HIPAA safeguards) and D-029 (full brief in scope) written
- [x] Fonts and licences in `frontend/public/fonts/`
- [ ] Teammates confirm D-028 and D-029 (then mark D-005 and D-008 as Replaced)

## FB-1 Tokens and component gallery ✅ merged (PR #27)
- [x] `tokens.css` with every colour, size, radius, font
- [x] `/dev/gallery` with all v0.2 components in every state
- [x] Tests: contrast, tokens-only styling, accessible names
- [x] Checked on a phone

## FB-2 Sign-in, lock and screens for every role (PR open)
- [x] Eight roles and the tabs for each (at most five)
- [x] Test-mode sign-in behind the `AuthApi` interface 🧪
- [x] Per-person PIN, five wrong tries wipe it
- [x] 5-minute app lock, and PIN asked again on restart
- [x] Staff fingerprint unlock (WebAuthn) written
- [ ] Fingerprint checked on a real phone over https
- [x] Role shown under the name on every screen
- [x] Switch account (test mode only)
- [x] Basic screens: CHV (17)
- [x] Basic screens: patient (6) · doctor/nurse/specialist (8) · pharmacist (3) · traditional healer (3)
- [x] Basic screens: GHS official (5) · health centre admin (5) · platform admin (4) · Me and Sync
- [x] A role can't open another role's screens (UI guard)
- [x] 72 tests pass
- [ ] PR #FB-2 approved and merged

## FB-3 Patient records that work offline 🔄 next
- [ ] Service worker: the app opens in airplane mode
- [ ] Encrypted local database on the phone (key made from the PIN)
- [ ] Register a patient (UUID made on the phone, D-011)
- [ ] Consent per purpose, with listen buttons (D-014)
- [ ] Record vitals with range flags (thresholds from config)
- [ ] Take a photo: compress to about 100 KB, encrypt, store
- [ ] Voice note: record offline, "Transcribing later" badge
- [ ] Patient history screen reads from the phone
- [ ] Sync queue with the four sync badges
- [ ] Retry-safe sync: same record twice gives one record
- [ ] Conflict: detected, and a "Needs attention" screen to resolve it
- [ ] Records shaped as FHIR (Patient, Observation, Consent, Media)
- [ ] Every read and write recorded in an audit list
- [ ] Mock API for sync (`MODE=mock`) so it works before the backend exists 🧪
- [ ] Airplane-mode demo: record, reconnect, sync, resolve a conflict (evidence)

## FB-4 Appointments, video call, fee
- [ ] Book a visit (times stored in UTC, shown in local time)
- [ ] Reminder in the patient's language 🧪
- [ ] Video call (WebRTC) from `webrtc-spike/`
- [ ] Audio-only fallback on a weak network
- [ ] Connection indicator and pre-call check
- [ ] Recording with both-side consent and a visible indicator
- [ ] Quality-assurance review list
- [ ] Consultation fee through votex365 test mode 🧪

## FB-5 Referrals and emergencies
- [ ] Refer a patient (CHV)
- [ ] Priority suggested automatically from danger signs and vitals; never lowered from Emergency
- [ ] Referral inbox sorted by priority, then waiting time
- [ ] Emergency button, confirmation and danger-sign chips
- [ ] Escalation timeline; auto-escalates if nobody acknowledges
- [ ] Offline: Call and SMS buttons
- [ ] Doctor acknowledges an emergency

## FB-6 Prescriptions, pharmacist, images
- [ ] Doctor writes a prescription
- [ ] Signed code and QR made on the phone
- [ ] Pharmacist verifies by code or QR scan
- [ ] Dispense once only
- [ ] Fraud checks: duplicate, repeated, unlicensed prescriber
- [ ] Share a medical image (compressed), doctor's viewer
- [ ] Sandbox pharmacy network 🧪

## FB-7 Public health
- [ ] Surveys: admin builds, CHV answers offline
- [ ] Maternal and child records, visit schedule, SMS reminders 🧪
- [ ] Surveillance dashboard (cases by disease, area, week)
- [ ] Outbreak flag from a simple, explainable rule
- [ ] District map
- [ ] Trend and stock forecast, labelled as estimates
- [ ] Official confirms an outbreak, community SMS alert 🧪
- [ ] Policy dashboard with filters and export
- [ ] Symptom decision support ("not a diagnosis")

## FB-8 Learning
- [ ] Education library (audio and video) in local languages
- [ ] Download a lesson, play it offline
- [ ] Health workers and admins upload local content
- [ ] Training modules, quiz, certificate
- [ ] Continuing-education record

## FB-9 Insurance, healers, supply
- [ ] Insurance plans and enrolment
- [ ] Premium paid by mobile money (test mode) 🧪
- [ ] NHIS membership check 🧪
- [ ] Traditional healer directory (certified)
- [ ] Consented two-way referral with a healer
- [ ] Remedies in use record
- [ ] Stock per facility, requests, deliveries
- [ ] Low-stock alert and redistribution suggestion

## FB-10 Admin, SDG 3, exports
- [ ] Health centre admin sees only their own facility
- [ ] Platform admin: users, roles, audit viewer, settings
- [ ] SDG 3 dashboard
- [ ] Revenue view (fees, premiums, training)
- [ ] GHS FHIR export 🧪
- [ ] DHIS2 export 🧪
- [ ] WHO export 🧪

## FB-11 Languages, polish, evidence
- [ ] English complete
- [ ] Twi complete
- [ ] Ewe, Dagbani, Hausa files ready for a native speaker
- [ ] Language switch works on every screen; test line renders with no boxes
- [ ] 200% text size does not break any screen
- [ ] Load test: 1,000 users, 50,000 records (with Eugene)
- [ ] Screenshots for every role

## Backend services to build (owners to be split by Joseph) 🧪
- [ ] SVC-0 patient-record-service: extend (observations, consents, sync, roles migration)
- [ ] SVC-1 auth-service
- [ ] SVC-2 media-service
- [ ] SVC-3 teleconsult-service
- [ ] SVC-4 payments-service (votex365)
- [ ] SVC-5 notification-service
- [ ] SVC-6 prescription-service
- [ ] SVC-7 referral-service
- [ ] SVC-8 surveillance-service
- [ ] SVC-9 decision-support-service
- [ ] SVC-10 community-programs-service
- [ ] SVC-11 learning-service
- [ ] SVC-12 insurance-service
- [ ] SVC-13 supply-service
- [ ] SVC-14 directory-service
- [ ] SVC-15 integration-service
- [ ] SVC-16 reporting-service
- [ ] Decide how the services are hosted within the budget (Eugene)
- [ ] Database migrations for the new roles and tables (Joseph or Elise)

## Report and design items (written, not built)
- [ ] Patient fingerprint: why a shared phone can't do it, and how a USB scanner at a facility would
- [ ] End-to-end encryption: what is and isn't strictly end-to-end
- [ ] HIPAA safeguard-to-control mapping (D-028)
- [ ] ML disease-prediction model design
- [ ] Partnership integration and community engagement
- [ ] Open-source release plan
- [ ] Cloud health platform choice, justified
