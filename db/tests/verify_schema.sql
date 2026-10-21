-- =============================================================================
-- verify_schema.sql — allow/deny evidence for every guard in 001 + 002.
-- Run on a scratch database AFTER both migrations:
--   psql -d healthconnect_test -v ON_ERROR_STOP=0 -f db/tests/verify_schema.sql
-- Every "SHOULD FAIL" line must print an ERROR; every "SHOULD PASS" must not.
-- =============================================================================
\set QUIET on
\pset footer off

-- Fixed UUIDs so the output is readable.
\set chv     '''11111111-1111-1111-1111-111111111111'''
\set spec    '''22222222-2222-2222-2222-222222222222'''
\set ama     '''aaaaaaaa-0000-0000-0000-000000000001'''
\set kofi    '''bbbbbbbb-0000-0000-0000-000000000002'''
\set c_ama   '''cccccccc-0000-0000-0000-00000000000a'''
\set c_kofi  '''cccccccc-0000-0000-0000-00000000000b'''
\set c_sms   '''cccccccc-0000-0000-0000-00000000000c'''

\set admin   '''99999999-9999-9999-9999-999999999999'''

\echo '--- D-015: audit columns ---'
\echo 'SHOULD FAIL: write with no acting user set'
INSERT INTO practitioners (full_name, role) VALUES ('Nobody', 'nurse');

-- Bootstrap an admin as the system account, then act as that admin.
SET app.user_id = '00000000-0000-0000-0000-000000000000';
INSERT INTO practitioners (id, full_name, role) VALUES (:admin, 'Esi Admin', 'admin');
SET app.user_id = '99999999-9999-9999-9999-999999999999';
INSERT INTO practitioners (id, full_name, role) VALUES
  (:chv,  'Abena Mensah', 'chv'),
  (:spec, 'Dr. Yaw Boateng', 'specialist');
\echo 'SHOULD PASS: created_by / updated_by stamped as the admin, not supplied by the client'
SELECT full_name, created_by = :admin AS created_by_admin, updated_by = :admin AS updated_by_admin
FROM practitioners WHERE id = :chv;

-- From here on the CHV is the acting user.
SET app.user_id = '11111111-1111-1111-1111-111111111111';

\echo '--- D-011: client-generated UUID, retried upload ---'
\echo 'SHOULD PASS: first upload of Ama'
INSERT INTO patients (id, full_name, phone, date_of_birth, gender, region, preferred_language)
VALUES (:ama, 'Ama Owusu', '+233000000001', '1990-04-12', 'female', 'Volta', 'ewe');
\echo 'SHOULD PASS: retry of the same upload is recognised, not duplicated (0 rows inserted)'
INSERT INTO patients (id, full_name) VALUES (:ama, 'Ama Owusu') ON CONFLICT (id) DO NOTHING;
SELECT count(*) AS ama_rows FROM patients WHERE id = :ama;
\echo 'SHOULD FAIL: malformed id'
INSERT INTO patients (id, full_name) VALUES ('not-a-uuid', 'X');

INSERT INTO patients (id, full_name, gender) VALUES (:kofi, 'Kofi Asante', 'male');

\echo '--- patients column checks ---'
\echo 'SHOULD FAIL: phone not in E.164'
INSERT INTO patients (full_name, phone) VALUES ('Bad Phone', '0200000001');
\echo 'SHOULD FAIL: gender outside FHIR AdministrativeGender'
INSERT INTO patients (full_name, gender) VALUES ('Bad Gender', 'F');

\echo '--- consents ---'
INSERT INTO consents (id, patient_id, purpose, given_by, recorded_by, given_at) VALUES
  (:c_ama,  :ama,  'clinical_care',         'patient',       :chv, '2026-10-01 09:00Z'),
  (:c_kofi, :kofi, 'clinical_care',         'chv_on_behalf', :chv, '2026-10-01 09:00Z'),
  (:c_sms,  :ama,  'appointment_reminders', 'patient',       :chv, '2026-10-01 09:00Z');

\echo '--- DATA-002: LOINC lookup + plausibility ---'
\echo 'SHOULD PASS: Ama, temperature 36.8 under her own consent'
INSERT INTO observations (patient_id, consent_id, loinc_code, value, recorded_by, effective_at)
VALUES (:ama, :c_ama, '8310-5', 36.8, :chv, '2026-10-15 10:00Z');
\echo 'SHOULD FAIL: code not on the permitted list'
INSERT INTO observations (patient_id, consent_id, loinc_code, value, recorded_by, effective_at)
VALUES (:ama, :c_ama, 'blood_pressure', 120, :chv, '2026-10-15 10:00Z');
\echo 'SHOULD FAIL: 368 °C typed instead of 36.8'
INSERT INTO observations (patient_id, consent_id, loinc_code, value, recorded_by, effective_at)
VALUES (:ama, :c_ama, '8310-5', 368, :chv, '2026-10-15 10:00Z');

\echo '--- D-012 guard 1: composite foreign key ---'
\echo 'SHOULD FAIL: Ama''s reading under Kofi''s consent'
INSERT INTO observations (patient_id, consent_id, loinc_code, value, recorded_by, effective_at)
VALUES (:ama, :c_kofi, '8310-5', 36.8, :chv, '2026-10-15 10:00Z');
\echo 'SHOULD FAIL: consent id that does not exist'
INSERT INTO observations (patient_id, consent_id, loinc_code, value, recorded_by, effective_at)
VALUES (:ama, gen_random_uuid(), '8310-5', 36.8, :chv, '2026-10-15 10:00Z');

\echo '--- D-012 guard 2: trigger ---'
\echo 'SHOULD FAIL: SMS-reminder consent used for a clinical reading'
INSERT INTO observations (patient_id, consent_id, loinc_code, value, recorded_by, effective_at)
VALUES (:ama, :c_sms, '8310-5', 36.8, :chv, '2026-10-15 10:00Z');
\echo 'SHOULD FAIL: reading taken before consent was given'
INSERT INTO observations (patient_id, consent_id, loinc_code, value, recorded_by, effective_at)
VALUES (:ama, :c_ama, '8310-5', 36.8, :chv, '2026-09-20 10:00Z');

\echo 'Ama withdraws consent in December; the specialist records it'
SET app.user_id = '22222222-2222-2222-2222-222222222222';
UPDATE consents SET withdrawn_at = '2026-12-05 12:00Z' WHERE id = :c_ama;
\echo 'SHOULD PASS: created_by is still the CHV, updated_by is now the specialist'
SELECT created_by = :chv AS created_by_chv, updated_by = :spec AS updated_by_specialist,
       updated_at > created_at OR updated_at = created_at AS updated_at_set
FROM consents WHERE id = :c_ama;
\echo 'SHOULD PASS (silently ignored): attempt to rewrite created_by / created_at'
UPDATE patients SET created_by = :spec, created_at = '2000-01-01Z' WHERE id = :ama;
SELECT created_by = :chv AS created_by_unchanged, created_at > '2000-01-02Z' AS created_at_unchanged,
       updated_by = :spec AS updated_by_specialist
FROM patients WHERE id = :ama;
SET app.user_id = '11111111-1111-1111-1111-111111111111';
\echo 'SHOULD FAIL: January reading -> "withdrawn on 05 Dec 2026. Obtain new consent"'
INSERT INTO observations (patient_id, consent_id, loinc_code, value, recorded_by, effective_at)
VALUES (:ama, :c_ama, '8310-5', 37.1, :chv, now());
\echo 'SHOULD PASS: October reading is still there'
SELECT loinc_code, value, effective_at FROM observations WHERE patient_id = :ama;

\echo '--- consents are append-only ---'
\echo 'SHOULD FAIL: delete a consent'
DELETE FROM consents WHERE id = :c_ama;
\echo 'SHOULD FAIL: change a withdrawn consent'
UPDATE consents SET withdrawn_at = NULL WHERE id = :c_ama;
\echo 'SHOULD FAIL: rewrite given_at on an active consent'
UPDATE consents SET given_at = '2026-01-01Z' WHERE id = :c_kofi;

\echo '--- observations are corrected, not deleted ---'
\echo 'SHOULD FAIL: delete an observation'
DELETE FROM observations WHERE patient_id = :ama;
\echo 'SHOULD FAIL: truncate observations'
TRUNCATE observations;

\echo '--- appointments (Lab 7 Part A) ---'
\echo 'SHOULD PASS: book Kofi with the specialist'
INSERT INTO appointments (patient_id, specialist_id, starts_at)
VALUES (:kofi, :spec, '2027-01-15 10:00Z') RETURNING status, created_by = :chv AS created_by_chv;
\echo 'SHOULD PASS: no end time sent -> defaults to 30 minutes'
SELECT ends_at - starts_at AS length FROM appointments WHERE patient_id = :kofi;
\echo 'SHOULD FAIL: double-booking the specialist at 10:15 (overlaps 10:00-10:30)'
INSERT INTO appointments (patient_id, specialist_id, starts_at)
VALUES (:ama, :spec, '2027-01-15 10:15Z');
\echo 'SHOULD PASS: back-to-back slot at 10:30 is fine'
INSERT INTO appointments (patient_id, specialist_id, starts_at)
VALUES (:ama, :spec, '2027-01-15 10:30Z');
\echo 'SHOULD PASS: after Kofi cancels, his 10:00 slot can be rebooked'
UPDATE appointments SET status = 'cancelled' WHERE patient_id = :kofi;
INSERT INTO appointments (patient_id, specialist_id, starts_at)
VALUES (:ama, :spec, '2027-01-15 10:00Z');
\echo 'SHOULD FAIL: ends before it starts'
INSERT INTO appointments (patient_id, specialist_id, starts_at, ends_at)
VALUES (:kofi, :spec, '2027-02-01 10:00Z', '2027-02-01 09:00Z');
\echo 'SHOULD FAIL: specialist who does not exist'
INSERT INTO appointments (patient_id, specialist_id, starts_at)
VALUES (:kofi, gen_random_uuid(), '2027-01-15 10:00Z');

\echo '--- access_log (Lab 6 Part D) ---'
\echo 'SHOULD PASS: log a read of Ama, and a probe of a patient id that does not exist'
INSERT INTO access_log (accessed_by, patient_id, resource_type, action, outcome)
VALUES (:chv, :ama, 'Patient', 'read', 'success'),
       (NULL, gen_random_uuid(), 'Patient', 'read', 'not_found');
\echo 'SHOULD FAIL: edit the audit log'
UPDATE access_log SET outcome = 'success';
\echo 'SHOULD FAIL: delete from the audit log'
DELETE FROM access_log;
\echo 'SHOULD FAIL: truncate the audit log'
TRUNCATE access_log;
SELECT count(*) AS audit_rows_remaining FROM access_log;

-- =============================================================================
-- D-015: audit_trail (requires 003_audit_trail.sql)
-- =============================================================================
\echo '--- D-015: audit_trail ---'
\echo 'Ama changes her phone number (identity field)'
SET app.user_id = '11111111-1111-1111-1111-111111111111';
UPDATE patients SET phone = '+233000000099', region = 'Greater Accra' WHERE id = :ama;
\echo 'Ama''s October reading is marked entered-in-error (clinical field)'
UPDATE observations SET status = 'entered-in-error' WHERE patient_id = :ama;

\echo 'SHOULD PASS: Ama''s full history. Phone and name show as [redacted]; region, consent and readings show real values'
SELECT a.id, a.table_name, a.action, a.changed_fields,
       a.old_values, a.new_values, p.full_name AS actor, a.db_role
FROM audit_trail a JOIN practitioners p ON p.id = a.actor
WHERE a.patient_id = :ama
ORDER BY a.id;

\echo 'SHOULD PASS: exactly 1 patient update in history (the phone change); the ignored created_by rewrite left none'
SELECT count(*) AS patient_update_rows FROM audit_trail
WHERE table_name = 'patients' AND row_id = :ama AND action = 'update';

\echo 'SHOULD FAIL: edit the audit trail'
UPDATE audit_trail SET actor = :spec;
\echo 'SHOULD FAIL: delete from the audit trail'
DELETE FROM audit_trail;
\echo 'SHOULD FAIL: truncate the audit trail'
TRUNCATE audit_trail;
