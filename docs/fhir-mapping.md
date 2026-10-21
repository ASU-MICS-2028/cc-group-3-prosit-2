# FHIR Mapping, Gap Analysis and Data Minimisation — HealthConnect Data Layer

| | |
| --- | --- |
| Created | 21 Oct 2026 |
| Last updated | 21 Oct 2026 |
| Lab | Lab 6 Part C |
| Schema version | migrations 001–003 (21 Oct 2026) |
| FHIR version | R4 (4.0.1) |
| Status | Draft for team review (mapping, gap analysis, data minimisation) |

**Purpose.** This shows how each HealthConnect table would become a FHIR resource. Moving to a real FHIR server should then be a translation step, not a redesign. Every field in the database either maps to a FHIR element or is listed as a gap.

**Why R4 (D-016).** R4 is the version most FHIR servers and national programmes have actually deployed. R5 changed Consent substantially, so we name R4 explicitly. (D-016)

**How to read the tables.** ✅ maps directly · 🔁 maps with a small conversion · ❌ no clean match (a gap; see the gap analysis).

---

## Overview

| Table | FHIR resource | Fit |
| --- | --- | --- |
| `patients` | Patient | Good |
| `observations` | Observation | Good; blood pressure is the exception |
| `practitioners` | Practitioner + PractitionerRole | Good |
| `consents` | Consent | Partial |
| `appointments` | Appointment | Good |
| `access_log` | AuditEvent | Good |
| `audit_trail` | AuditEvent + Provenance | Good |
| `loinc_codes` | No resource; a stand-in for a terminology server | n/a |
| `created_*` / `updated_*` columns | `meta.lastUpdated` + Provenance | Partial |

---

## patients → Patient

| Column | FHIR element | Fit | Notes |
| --- | --- | --- | --- |
| `id` | `Patient.id` | ✅ | UUIDs are valid FHIR ids (D-011) |
| `full_name` | `Patient.name[0].text` | 🔁 | FHIR splits names into `family` and `given`; we only fill `text` |
| `phone` | `Patient.telecom[0]` | 🔁 | `{system: "phone", use: "mobile", value: "+233…"}` |
| `date_of_birth` | `Patient.birthDate` | ✅ | |
| `birth_date_estimated` | none | ❌ | No core element; needs a custom extension |
| `gender` | `Patient.gender` | ✅ | Our CHECK uses FHIR's exact codes: male, female, other, unknown |
| `country_code` | `Patient.address[0].country` | ✅ | ISO 3166 code |
| `region` | `Patient.address[0].state` | 🔁 | Free text; FHIR accepts text, but codes would be better |
| `preferred_language` | `Patient.communication[0].language` | 🔁 | FHIR expects a BCP-47 code (`ee` Ewe, `ak` Akan/Twi, `gaa` Ga); we store free text |
| `created_at`, `updated_at` | `Patient.meta.lastUpdated` | 🔁 | FHIR keeps only the last-updated time on the resource |
| `created_by`, `updated_by` | Provenance resource | 🔁 | FHIR records "who" in a separate Provenance resource |

## observations → Observation

| Column | FHIR element | Fit | Notes |
| --- | --- | --- | --- |
| `id` | `Observation.id` | ✅ | |
| `status` | `Observation.status` | ✅ | `final`, `amended`, `entered-in-error` are FHIR codes (D-013) |
| `loinc_code` | `Observation.code.coding[0]` | ✅ | `{system: "http://loinc.org", code: "8310-5", display: "Body temperature"}` |
| `value` + `loinc_codes.unit` | `Observation.valueQuantity` | ✅ | `{value: 36.8, unit: "°C", system: "http://unitsofmeasure.org", code: "Cel"}`; why units are UCUM (DATA-002) |
| `patient_id` | `Observation.subject` | ✅ | `Reference(Patient/<id>)` |
| `recorded_by` | `Observation.performer` | ✅ | `Reference(Practitioner/<id>)` |
| `effective_at` | `Observation.effectiveDateTime` | ✅ | When it was measured, possibly offline |
| `created_at` | `Observation.issued` | ✅ | When it reached the system |
| `group_id` | `Observation.component` | ❌ | FHIR stores blood pressure as **one** Observation with two components; we store two linked rows |
| `consent_id` | none | 🔁 | FHIR doesn't attach consent to each reading; a server checks Consent before accepting it. Our link is stricter |
| `loinc_codes.category` | `Observation.category` | ✅ | `vital-signs` or `laboratory`, held per code (closed by DATA-005) |

Ama's reading as FHIR, built only from our columns:

```json
{
  "resourceType": "Observation",
  "id": "e3b442be-66a3-4d3b-befb-749147da9987",
  "status": "final",
  "category": [{ "coding": [{ "system": "http://terminology.hl7.org/CodeSystem/observation-category", "code": "vital-signs" }] }],
  "code": { "coding": [{ "system": "http://loinc.org", "code": "8310-5", "display": "Body temperature" }] },
  "subject":   { "reference": "Patient/aaaaaaaa-0000-0000-0000-000000000001" },
  "performer": [{ "reference": "Practitioner/11111111-1111-1111-1111-111111111111" }],
  "effectiveDateTime": "2026-10-15T10:00:00Z",
  "issued": "2026-10-15T10:00:04Z",
  "valueQuantity": { "value": 36.8, "unit": "°C", "system": "http://unitsofmeasure.org", "code": "Cel" }
}
```

## practitioners → Practitioner + PractitionerRole

| Column | FHIR element | Fit | Notes |
| --- | --- | --- | --- |
| `id` | `Practitioner.id` | ✅ | |
| `full_name` | `Practitioner.name[0].text` | 🔁 | Same family/given split as Patient |
| `active` | `Practitioner.active` | ✅ | |
| `role` | `PractitionerRole.code` | 🔁 | FHIR keeps role separately, so one person can hold several roles at several facilities; we allow one |
| `facility` | `PractitionerRole.location` | ❌ | FHIR expects a Location/Organization resource; we store text |

## consents → Consent

| Column | FHIR element | Fit | Notes |
| --- | --- | --- | --- |
| `id` | `Consent.id` | ✅ | |
| `patient_id` | `Consent.patient` | ✅ | |
| `withdrawn_at` | `Consent.status` | 🔁 | NULL → `active`; set → `inactive` |
| `withdrawn_at` | `Consent.provision.period.end` | 🔁 | The date the permission stopped |
| `given_at` | `Consent.dateTime` + `provision.period.start` | ✅ | |
| `given_by` | `Consent.performer` | 🔁 | `patient` → Patient; `guardian` → RelatedPerson (we don't store who); `chv_on_behalf` → Practitioner |
| `purpose` | `Consent.provision.purpose` | 🔁 | `clinical_care` → v3 PurposeOfUse `TREAT`; reminders and advisory need local codes |
| `recorded_by` | Provenance | 🔁 | |
| (none) | `Consent.scope`, `Consent.category` | 🔁 | Required in R4; constant values (`treatment`, and a LOINC consent-document code) |
| (none) | `Consent.policy` | ❌ | FHIR points to the governing policy; we would cite Act 843 here |

## appointments → Appointment

| Column | FHIR element | Fit | Notes |
| --- | --- | --- | --- |
| `id` | `Appointment.id` | ✅ | |
| `status` | `Appointment.status` | ✅ | `booked`, `cancelled`, `fulfilled`, `noshow` are FHIR codes |
| `starts_at` | `Appointment.start` | ✅ | |
| `patient_id` | `Appointment.participant[].actor` | ✅ | `Reference(Patient)`, `status: accepted` |
| `specialist_id` | `Appointment.participant[].actor` | ✅ | `Reference(Practitioner)` |
| `created_at` | `Appointment.created` | ✅ | |
| `ends_at` | `Appointment.end` | ✅ | Defaults to start + 30 min; Postgres blocks overlapping bookings per specialist (closed by D-017) |

## access_log → AuditEvent (reads)

| Column | FHIR element | Fit | Notes |
| --- | --- | --- | --- |
| `id` | `AuditEvent.id` | ✅ | |
| `action` | `AuditEvent.action` | 🔁 | read → `R`, create → `C`, update → `U`, delete → `D` |
| `outcome` | `AuditEvent.outcome` | 🔁 | success → `0`; denied / not_found → `4`; error → `8` |
| `accessed_at` | `AuditEvent.recorded` | ✅ | |
| `accessed_by` | `AuditEvent.agent[0].who` | ✅ | `Reference(Practitioner)` |
| `source_ip` | `AuditEvent.agent[0].network.address` | ✅ | |
| `patient_id`, `resource_type` | `AuditEvent.entity[0].what` | ✅ | `Reference(Patient/<id>)` |
| (none) | `AuditEvent.source` | 🔁 | Constant: "HealthConnect API" |

## audit_trail → AuditEvent + Provenance (changes)

| Column | FHIR element | Fit | Notes |
| --- | --- | --- | --- |
| `action` | `AuditEvent.action` | 🔁 | insert → `C`, update → `U`, delete → `D` |
| `occurred_at` | `AuditEvent.recorded` | ✅ | |
| `actor` | `AuditEvent.agent[0].who` | ✅ | |
| `table_name` + `row_id` | `AuditEvent.entity[0].what` | 🔁 | `Reference(<Resource>/<id>)` |
| `changed_fields`, `old_values`, `new_values` | `AuditEvent.entity[0].detail` | 🔁 | FHIR allows free key/value detail; real servers keep versions instead (`_history`) |
| `db_role`, `transaction_id` | none | ❌ | Database-level detail; would go in an extension |

## loinc_codes → no resource

This table is a **local stand-in for a terminology server**. A real FHIR setup checks codes with `ValueSet/$validate-code` against the full LOINC catalogue (100,000+ codes). We check against our list of 9 (DATA-002).

---

# Gap Analysis

**Bottom line.** The schema is FHIR-*shaped*, not FHIR-*compatible*. Every table maps to a resource and most fields convert directly. What remains are gaps in **identity**, **terminology** and **the API layer**: we cannot reliably tell which real person a record belongs to, we validate codes against our own short list, and nothing speaks FHIR's REST protocol yet.

## Closed by design (lab starter → our schema)

The lab asks us to name one missing field. These were the obvious candidates, and the schema already closes them:

| Gap in the lab starter | Closed by |
| --- | --- |
| Free-text `observation_type` | LOINC codes, UCUM units, plausible ranges (DATA-002) |
| `SERIAL` ids, unusable offline and across systems | Client-generated UUIDs (D-011) |
| `consent_given_at` recorded but not enforced | Per-purpose consent, enforced by FK + trigger (D-012, D-014) |
| Free-text `recorded_by` | `practitioners` table with references (DATA-003) |
| No Observation status | FHIR status codes, correct-don't-delete (D-013) |
| No AuditEvent | `access_log` and `audit_trail` (DATA-004, D-015) |
| No Observation category | `loinc_codes.category` (DATA-005) |
| No Appointment end | `ends_at` + double-booking guard (D-017) |

## What still blocks real interoperability

Ordered by impact: the first rows would stop a real integration; the last are conversions.

| # | Gap | Why it matters | Fix | Effort |
| --- | --- | --- | --- | --- |
| 1 | **No business identifier** (NHIS number, Ghana Card) on Patient | Another system can't confirm that our Ama is its Ama. UUIDs stop duplicate *records* but not duplicate *people* (D-011) | `Patient.identifier` as a separate table (system + value). Collect it only once a stated purpose needs it: minimisation applies | Medium |
| 2 | **No terminology server**: codes checked against our 9, not the real catalogue | A partner may send a valid LOINC code we reject, and we can't prove ours are current | Validate against a terminology service (`ValueSet/$validate-code`); keep `loinc_codes` as the permitted subset | Medium |
| 3 | **No FHIR API**: no `/Patient/{id}` endpoints, no `_history`, no SMART on FHIR authorisation | Other systems can't call us the standard way; resource versions live in `audit_trail`, not as FHIR versions | A translation layer that serves this mapping as FHIR R4 JSON, or a sync into AWS HealthLake (R4, D-016) | High |
| 4 | **No Encounter** | Readings aren't tied to a visit, so a clinician can't see "everything from Tuesday's triage" as one event | `encounters` table; `observations.encounter_id` | Medium |
| 5 | **Blood pressure as two linked rows** | FHIR expects one Observation (`85354-9`) with systolic and diastolic components | Translation layer merges rows sharing `group_id`; no schema change | Low |
| 6 | **Name stored as one field** | FHIR HumanName splits family and given. Ghanaian names (day names, varied surname conventions) make an automatic split unreliable | Capture family and given names at registration; keep `text` as entered | Low–Medium |
| 7 | **Facility as text** | FHIR expects Location / Organization resources, which national registries hold | `facilities` table keyed to the Ghana Health Service facility list | Medium |
| 8 | **Consent details** | Only `clinical_care` has a standard code (`TREAT`); no policy reference; a guardian's identity isn't stored | Local CodeSystem for reminder and advisory purposes; `Consent.policy` → Act 843; RelatedPerson for guardians | Low |
| 9 | **Language and region as free text** | FHIR expects codes (BCP-47 languages; region codes) | CHECK constraints or lookup tables, like `loinc_codes` | Low |
| 10 | **`birth_date_estimated` has no core element** | Lost in translation unless defined | Custom extension, published with our profile | Low |
| 11 | **Who-did-what is in columns, not Provenance** | FHIR tools expect Provenance resources | Generated from `created_by` / `updated_by` / `audit_trail` by the translation layer | Low |

## What we'd say in Lab 8

The schema cleanly converts to FHIR R4, but HealthConnect can't yet *exchange* data. The three blockers are: no business identifier for matching people (#1), validating against our own code list rather than LOINC itself (#2), and no FHIR API (#3). Gaps #5, #10 and #11 need no schema change, only a translation layer.

# Data Minimisation (Act 843)

**Rule.** Act 843 says personal data may be collected only if it is adequate, relevant and not excessive for the stated purpose (its minimality principle; exact section to be confirmed by Joseph's clause check in L5-C2). For every column in `patients`, one sentence says which stated purpose needs it. If there's no honest sentence, that's a finding.

**HealthConnect's stated purposes:**

1. **Triage support:** helping a CHV judge how urgent a patient is.
2. **Appointment scheduling:** booking patients with specialists, and reminding them.
3. **Health advisory:** sending patients health information relevant to them.
4. **Public health reporting, aggregated and anonymised only** *(added by this review, D-018; see Finding 1)*.

## Column by column

| Column | Purpose | Justification | Verdict |
| --- | --- | --- | --- |
| `id` | All | A random UUID that links a patient's records without using anything identifying (D-011). | Keep |
| `full_name` | 1, 2 | Staff must confirm they have the right person at a visit and when handing a patient to a specialist. | Keep |
| `phone` | 2, 3 | Needed to send appointment reminders and advisories by SMS, and only used where the patient has consented to that purpose (D-014). Optional: patients without a phone are reached through their CHV. | Keep, optional |
| `date_of_birth` | 1 | Triage thresholds change with age in **months** for young children (e.g. WHO's IMCI fast-breathing cut-offs differ for 2–12 months vs 12–59 months), so birth year alone is not enough. | Keep |
| `birth_date_estimated` | 1 | Many patients know only their approximate age; flagging an estimate stops triage treating a guess as exact. | Keep |
| `gender` | 1 | Some triage questions and reference ranges depend on sex, e.g. pregnancy-related danger signs. `unknown` is allowed. | Keep |
| `country_code` | Legal / all | Decides which country's database holds the record (data residency, Lab 5 Part C). Without it we cannot keep each country's data under its own law. | Keep |
| `region` | 2, 3 (and 4, aggregated) | Advisories are region-specific: northern Ghana lies in the meningitis belt and malaria seasons differ by region. Scheduling routes patients to a nearby facility. Reporting uses region **only as aggregated counts**. | Keep (see Finding 1) |
| `preferred_language` | 3 | Advisories only help if the patient can understand them (e.g. Ewe, Twi, Ga). | Keep |
| `created_at`, `created_by`, `updated_at`, `updated_by` | Security | Act 843 requires security safeguards for personal data; these show who changed a record and when (D-015). They describe staff actions, not the patient. | Keep |

## Findings

**Finding 1: region was being justified by an unstated purpose.** The intuitive reasons to keep region are resource allocation and tracking where diseases are more common. Both are *public health reporting*, which was not one of HealthConnect's stated purposes. Under Act 843, an unstated purpose cannot justify collection. We fixed this two ways:
- region is justified by stated purposes 2 and 3 (scheduling, advisory);
- reporting is added as a **fourth stated purpose (D-018), limited to aggregated, anonymised counts**. Identifiable rows never leave for reporting, which matches the residency rule that only anonymised aggregates cross borders.

**Finding 2: two starter columns removed.**
- `consent_given_at` moved into the `consents` table, where consent is per purpose and withdrawal is recorded (D-012, D-014).
- `fhir_resource_type` held the same constant on every row (the table name already says it). It isn't personal data, so this is a cleanliness fix rather than a minimisation one.

**Finding 3: deliberately NOT collected.**

| Data | Why not |
| --- | --- |
| Ghana Card / NHIS number | No stated purpose needs it yet. It would help match patients across systems (gap #1), so collect it only once a purpose such as insurance claims is added. |
| Home address, GPS location | Region is enough to route and advise. |
| Email | Rural patients are reached by SMS or through their CHV. |
| Occupation, religion, ethnicity | No purpose needs them. Ethnicity and religion are special personal data under Act 843: extra risk, no benefit. |

**Finding 4: the audit trail must not become a second copy of identity data.** `audit_trail` stores real values for clinical fields but only *field names* for `full_name`, `phone` and `date_of_birth` (D-015).

**Needs legal review (Joseph, L5-C2):** the exact Act 843 section numbers for the minimality principle, purpose specification, consent, special personal data and retention.

## Sources

- [HL7 FHIR R4 specification](https://hl7.org/fhir/R4/): resource definitions used for every mapping above
- [AWS HealthLake data store: supports R4 only](https://docs.amazonaws.cn/AWSCloudFormation/latest/UserGuide/aws-resource-healthlake-fhirdatastore.html)
- [Health Samurai: Getting ready for FHIR R6](https://www.health-samurai.io/articles/getting-ready-for-fhir-r6-what-you-need-to-know): R4 adoption, R5 uptake, R6 timeline
- LOINC codes in `002_loinc_reference.sql`: **to be verified on [loinc.org](https://loinc.org/)** before migration 002 is applied
