-- =============================================================================
-- HealthConnect Ghana — 008_prescription_checks.sql
-- Final sprint, task FB-6 (SVC-6, D-035): fraud checks on top of Elise's prescriptions table.
--
--   1. prescriber_licences: a SANDBOX stand-in for the GMDC register. We have no
--      access to the real one, and the report says so.
--   2. prescription_flags: warnings for a person to look at. Not blocks: a patient
--      can genuinely need the same medicine twice. A pharmacist must see them first.
--   3. The expiry and consent of a prescription can't be edited afterwards. Without
--      this, an update could bring an expired prescription back to life.
-- =============================================================================

BEGIN;

SET LOCAL app.user_id = '00000000-0000-0000-0000-000000000000';

CREATE TABLE prescriber_licences (
  practitioner_id  UUID PRIMARY KEY REFERENCES practitioners(id),
  licence_number   TEXT NOT NULL UNIQUE,
  valid_until      DATE NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL,
  created_by       UUID NOT NULL REFERENCES practitioners(id),
  updated_at       TIMESTAMPTZ NOT NULL,
  updated_by       UUID NOT NULL REFERENCES practitioners(id)
);

CREATE TRIGGER prescriber_licences_audit_trg
  BEFORE INSERT OR UPDATE ON prescriber_licences
  FOR EACH ROW EXECUTE FUNCTION stamp_audit_columns();

CREATE TABLE prescription_flags (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id  UUID NOT NULL REFERENCES prescriptions(id),
  kind             TEXT NOT NULL CHECK (kind IN ('duplicate', 'repeated', 'prescriber_rate', 'unlicensed')),
  detail           TEXT NOT NULL,        -- plain words, shown to the pharmacist
  reviewed_by      UUID REFERENCES practitioners(id),
  reviewed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL,
  created_by       UUID NOT NULL REFERENCES practitioners(id),
  updated_at       TIMESTAMPTZ NOT NULL,
  updated_by       UUID NOT NULL REFERENCES practitioners(id),
  CHECK ((reviewed_by IS NULL) = (reviewed_at IS NULL))
);

CREATE INDEX prescription_flags_prescription_idx ON prescription_flags (prescription_id);

CREATE TRIGGER prescription_flags_audit_trg
  BEFORE INSERT OR UPDATE ON prescription_flags
  FOR EACH ROW EXECUTE FUNCTION stamp_audit_columns();
CREATE TRIGGER prescription_flags_audit_trail_trg
  AFTER INSERT OR UPDATE OR DELETE ON prescription_flags
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER prescription_flags_no_delete_trg
  BEFORE DELETE ON prescription_flags
  FOR EACH ROW EXECUTE FUNCTION forbid_delete_with_hint('A flag stays on record once it is raised.');

-- Prescriber lookups for the "too many in an hour" check.
CREATE INDEX prescriptions_prescriber_idx ON prescriptions (created_by, created_at DESC);

CREATE FUNCTION prescriptions_lock_terms() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.expires_at, NEW.consent_id) IS DISTINCT FROM (OLD.expires_at, OLD.consent_id) THEN
    RAISE EXCEPTION 'The expiry and consent of a prescription cannot be edited. Cancel it and write a new one.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER prescriptions_lock_terms_trg
  BEFORE UPDATE ON prescriptions
  FOR EACH ROW EXECUTE FUNCTION prescriptions_lock_terms();

ALTER TABLE access_log DROP CONSTRAINT access_log_resource_type_check;
ALTER TABLE access_log ADD CONSTRAINT access_log_resource_type_check
  CHECK (resource_type IN ('Patient', 'Observation', 'Consent', 'Appointment', 'Media', 'Prescription'));

COMMIT;
