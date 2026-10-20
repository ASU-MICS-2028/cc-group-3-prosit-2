# The Prosit 2 brief, summarised

**"PROSIT 2: HealthConnect Ghana Challenge"**: a cloud platform that connects rural Ghanaian
communities with healthcare: health records, telemedicine and disease monitoring. The full brief
and launch deck are on Canvas and in the team Drive ([`workspace.md`](./workspace.md)).

## The problem, in numbers (from the brief)

- 1 doctor per 10,000 people (WHO recommends 1 per 1,000).
- 40% of Ghanaians live more than 5 km from a health facility.
- Specialists are concentrated in Accra and Kumasi.
- Records are on paper, so there is no continuity of care.
- 83% of Ghanaians own a mobile phone; 15,000+ trained Community Health Volunteers (CHVs) need better tools.

## The four "weeks" of the brief

| Week | Theme | Asks for |
|---|---|---|
| 1 | Community health records | Offline PWA for CHVs; patient data and vitals (BP, temperature, weight, height); photos of wounds/skin; fingerprint login for patients who can't read; English, Twi, Ewe, Dagbani, Hausa; voice-to-text. Act 843 compliance, end-to-end encryption, role-based access, audit trails, secure backup and sync. Choose and justify: health cloud platform, FHIR-shaped database, OAuth/JWT, offline conflict resolution, GHS integration |
| 2 | Telemedicine | Video calls that work on 2G/3G; appointment scheduling; e-prescriptions with pharmacies; mobile-money consultation fees; compressed medical-image sharing; specialist referrals with automatic prioritisation. WebRTC, load balancing, HL7 FHIR, prescription fraud checks, emergency escalation |
| 3 | Disease surveillance | Outbreak-detection dashboard, disease maps, predictive analytics, mobile health surveys, health education in local languages, maternal/child reminders; ML prediction, outbreak alerts, DHIMS2 and WHO integration |
| 4 | Sustainable ecosystem | Community health insurance via mobile money, traditional medicine integration, medicine supply chain, health-worker training and certification, revenue model, SDG 3 dashboard |

## Users

- **CHVs:** limited medical training, high community trust, mixed technical literacy. Need simple, reliable tools.
- **Rural patients:** mixed literacy (voice/visual interfaces), use mobile money, may prefer traditional medicine.
- **Health professionals:** overloaded urban doctors and specialists. Need secure, efficient consultations and patient history.
- **Public health officials (GHS):** need real-time data for decisions and outbreak detection.

## Targets the brief sets

99.7% uptime; zero breaches; telemedicine works on 2G; 50,000+ patient records and 1,000+ concurrent users; works with existing GHS systems.

## Assessment (from the brief and the launch deck)

- **Brief:** Technical 40% (healthcare security, clinical integration, FHIR, telemedicine quality) · Community health impact 25% · Healthcare innovation 20% · Autonomous leadership 15%.
- **Launch deck (400 points):** Technical 40% · Innovation thinking 25% · Ubuntu leadership 20% · Autonomous learning 15%. It also expects daily learning logs and weekly peer evaluations.

## How we read it

The brief is far bigger than four weeks. We build the foundation properly (secure offline records,
FHIR-shaped API, audit, the security controls), build one telemedicine slice in Lab 7, and design
and document the rest, being honest about the gaps. The scope table is in [`../PLAN.md`](../PLAN.md).
