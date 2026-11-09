-- =============================================================================
-- HealthConnect Ghana — 011_insurance.sql
-- Final sprint, task FB-9a: insurance plans and enrolments, the insurance part of E-M part 2.
-- 010 stays free for the rest of E-M part 2. The plans and prices are examples: we have no insurer as a partner.
-- =============================================================================

BEGIN;

SET LOCAL app.user_id = '00000000-0000-0000-0000-000000000000';

CREATE TABLE insurance_plans (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  monthly_premium NUMERIC(10, 2) NOT NULL CHECK (monthly_premium > 0),
  covers          TEXT NOT NULL
);

INSERT INTO insurance_plans (id, name, monthly_premium, covers) VALUES
  ('community', 'Community plan', 10, 'Video visits with a doctor and basic medicines'),
  ('family', 'Family plan', 25, 'The same, for up to five people in one home');

-- One enrolment per patient. Changing plan updates it, so premiums already paid still point at it.
CREATE TABLE insurance_enrolments (
  id          UUID PRIMARY KEY,
  patient_id  UUID NOT NULL UNIQUE REFERENCES patients(id),
  plan_id     TEXT NOT NULL REFERENCES insurance_plans(id),
  since       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL,
  created_by  UUID NOT NULL REFERENCES practitioners(id),
  updated_at  TIMESTAMPTZ NOT NULL,
  updated_by  UUID NOT NULL REFERENCES practitioners(id)
);

CREATE FUNCTION insurance_enrolments_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.patient_id IS DISTINCT FROM OLD.patient_id THEN
    RAISE EXCEPTION 'An enrolment cannot move to another patient.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER insurance_enrolments_guard_trg
  BEFORE UPDATE ON insurance_enrolments
  FOR EACH ROW EXECUTE FUNCTION insurance_enrolments_guard();
CREATE TRIGGER insurance_enrolments_audit_trg
  BEFORE INSERT OR UPDATE ON insurance_enrolments
  FOR EACH ROW EXECUTE FUNCTION stamp_audit_columns();
CREATE TRIGGER insurance_enrolments_audit_trail_trg
  AFTER INSERT OR UPDATE OR DELETE ON insurance_enrolments
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER insurance_enrolments_no_delete_trg
  BEFORE DELETE ON insurance_enrolments
  FOR EACH ROW EXECUTE FUNCTION forbid_delete_with_hint('An enrolment stays on record, because payments point at it.');

COMMIT;
