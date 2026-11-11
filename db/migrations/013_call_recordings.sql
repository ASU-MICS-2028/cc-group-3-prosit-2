-- =============================================================================
-- HealthConnect Ghana — 013_call_recordings.sql
-- Final sprint, task FB-4b: consent and quality-assurance records for call recordings.
--
-- ONLY the facts are stored here: who agreed, when, how long, who reviewed.
-- The recording itself never reaches the server. It stays encrypted on the doctor's
-- phone, because the S3 media path (SVC-2) isn't built.
-- =============================================================================

BEGIN;

SET LOCAL app.user_id = '00000000-0000-0000-0000-000000000000';

CREATE TABLE call_recordings (
  id                   UUID PRIMARY KEY,      -- made by the phone, so a retried request can't make a second one
  appointment_id       UUID NOT NULL REFERENCES appointments(id),
  clinician_agreed_at  TIMESTAMPTZ,
  patient_agreed_at    TIMESTAMPTZ,
  patient_agreed_by    UUID REFERENCES practitioners(id),   -- the patient's own login, or the CHV with them
  withdrawn_at         TIMESTAMPTZ,
  withdrawn_by         UUID REFERENCES practitioners(id),
  ended_at             TIMESTAMPTZ,
  seconds              INTEGER CHECK (seconds >= 0),
  created_at           TIMESTAMPTZ NOT NULL,
  created_by           UUID NOT NULL REFERENCES practitioners(id),
  updated_at           TIMESTAMPTZ NOT NULL,
  updated_by           UUID NOT NULL REFERENCES practitioners(id),
  CHECK ((patient_agreed_at IS NULL) = (patient_agreed_by IS NULL)),
  CHECK ((withdrawn_at IS NULL) = (withdrawn_by IS NULL)),
  -- A finished recording without both agreements can't exist, whatever the API does.
  CHECK (ended_at IS NULL OR (clinician_agreed_at IS NOT NULL AND patient_agreed_at IS NOT NULL))
);

CREATE INDEX call_recordings_appointment_idx ON call_recordings (appointment_id);

CREATE TRIGGER call_recordings_audit_trg
  BEFORE INSERT OR UPDATE ON call_recordings
  FOR EACH ROW EXECUTE FUNCTION stamp_audit_columns();
CREATE TRIGGER call_recordings_audit_trail_trg
  AFTER INSERT OR UPDATE OR DELETE ON call_recordings
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER call_recordings_no_delete_trg
  BEFORE DELETE ON call_recordings
  FOR EACH ROW EXECUTE FUNCTION forbid_delete_with_hint('A record of consent stays on file.');

CREATE TABLE recording_reviews (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id  UUID NOT NULL REFERENCES call_recordings(id),
  outcome       TEXT NOT NULL CHECK (outcome IN ('meets_standard', 'needs_follow_up')),
  note          TEXT CHECK (length(note) <= 500),
  created_at    TIMESTAMPTZ NOT NULL,
  created_by    UUID NOT NULL REFERENCES practitioners(id),   -- the reviewer
  updated_at    TIMESTAMPTZ NOT NULL,
  updated_by    UUID NOT NULL REFERENCES practitioners(id),
  UNIQUE (recording_id, created_by)
);

CREATE TRIGGER recording_reviews_audit_trg
  BEFORE INSERT OR UPDATE ON recording_reviews
  FOR EACH ROW EXECUTE FUNCTION stamp_audit_columns();
CREATE TRIGGER recording_reviews_audit_trail_trg
  AFTER INSERT OR UPDATE OR DELETE ON recording_reviews
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER recording_reviews_no_delete_trg
  BEFORE DELETE ON recording_reviews
  FOR EACH ROW EXECUTE FUNCTION forbid_delete_with_hint('A review stays on record.');

COMMIT;
