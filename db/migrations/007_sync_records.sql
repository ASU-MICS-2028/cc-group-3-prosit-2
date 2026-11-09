-- =============================================================================
-- HealthConnect Ghana — 007_sync_records.sql
-- Final sprint, task J2 (D-032, D-037): what the phones send and download.
--
-- sync_records keeps the phone's whole record exactly as sent, with its version
-- and a running number (seq) that says "changed after this point". The API also
-- writes each record into its proper table (patients, consents, observations,
-- appointments), so all of Elise's rules still decide what's allowed.
-- =============================================================================

BEGIN;

SET LOCAL app.user_id = '00000000-0000-0000-0000-000000000000';

CREATE SEQUENCE sync_records_seq;

CREATE TABLE sync_records (
  id               UUID PRIMARY KEY,                     -- the phone's id (D-011)
  resource_type    TEXT NOT NULL
                   CHECK (resource_type IN ('Patient', 'Consent', 'Observation', 'Media', 'Appointment')),
  patient_id       UUID NOT NULL,                        -- whose record; for a Patient, its own id
  practitioner_id  UUID REFERENCES practitioners(id),    -- for an Appointment: the doctor or specialist
  owner            UUID NOT NULL REFERENCES practitioners(id),  -- who first sent it
  version          INTEGER NOT NULL CHECK (version >= 1),
  seq              BIGINT NOT NULL UNIQUE,               -- taken again on every change: the download bookmark
  resource         JSONB NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL,
  created_by       UUID NOT NULL REFERENCES practitioners(id),
  updated_at       TIMESTAMPTZ NOT NULL,
  updated_by       UUID NOT NULL REFERENCES practitioners(id)
);

CREATE INDEX sync_records_patient_idx ON sync_records (patient_id, resource_type);
CREATE INDEX sync_records_owner_idx ON sync_records (owner, resource_type);
CREATE INDEX sync_records_practitioner_idx ON sync_records (practitioner_id) WHERE practitioner_id IS NOT NULL;

CREATE TRIGGER sync_records_audit_trg
  BEFORE INSERT OR UPDATE ON sync_records
  FOR EACH ROW EXECUTE FUNCTION stamp_audit_columns();
CREATE TRIGGER sync_records_no_delete_trg
  BEFORE DELETE ON sync_records
  FOR EACH ROW EXECUTE FUNCTION forbid_delete_with_hint('Records are corrected, never deleted: send a new version.');

-- Photos and voice notes are records too, and their reads and writes get logged.
ALTER TABLE access_log DROP CONSTRAINT access_log_resource_type_check;
ALTER TABLE access_log ADD CONSTRAINT access_log_resource_type_check
  CHECK (resource_type IN ('Patient', 'Observation', 'Consent', 'Appointment', 'Media'));

COMMIT;
