# Shared vocabulary (S8)

The words we use for people and for data, so code, report and talk match. Details: [`../docs/fhir-mapping.md`](../docs/fhir-mapping.md); role translation in code: [`../backend/src/roles.ts`](../backend/src/roles.ts).

## People (roles)

The database and the app name roles differently. The API checks database names and translates only what it sends to the app.

| Say | Database role | App role | Does |
|---|---|---|---|
| Community health volunteer (CHV) | `chv` | `chv` | Registers patients, records vitals offline, refers |
| Patient | `patient` | `patient` | Sees and books their own care; signs in with a PIN only |
| Nurse, doctor, specialist | `nurse`, `doctor`, `specialist` | `clinician` | Consults, prescribes (doctor), answers referrals and emergencies |
| Pharmacist | `pharmacist` | `pharmacist` | Checks a prescription code, dispenses once |
| Traditional healer | `traditional_healer` | `healer` | Refers to a clinic with the patient's consent |
| Ghana Health Service official | `ghs_official` | `ghs` | Watches surveillance, confirms outbreaks, last step of escalation |
| Health centre admin | `health_centre_admin` | `facility_admin` | Runs one facility: staff, stock, reports |
| Platform admin | `admin` | `platform_admin` | Users, roles, audit, revenue |
| (none) | `system` | (none) | Owns migration rows; can never sign in |

## Data (resources)

Each table maps to the nearest FHIR resource, so exports and a future national exchange line up.

| Say | Table | FHIR resource |
|---|---|---|
| Patient | `patients` | Patient |
| Observation (vitals, symptoms) | `observations` | Observation (LOINC coded) |
| Consent | `consents` | Consent |
| Audit event (who read or changed what) | `access_log`, `audit_trail` | AuditEvent (+ Provenance) |
| Practitioner | `practitioners` | Practitioner + PractitionerRole |
| Appointment | `appointments` | Appointment |
| Referral | `referrals` | ServiceRequest |
| Emergency | `emergencies` | Flag (+ Communication) |
| Prescription | `prescriptions` | MedicationRequest (+ MedicationDispense) |
| Facility | `facilities` | Location (+ Organization) |

Rule of thumb: every read of a patient's data writes an audit event; every change keeps its history. The data is synthetic (D-034).
