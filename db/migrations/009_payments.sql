-- =============================================================================
-- HealthConnect Ghana — 009_payments.sql
-- Final sprint, task SVC-4 (D-039): mobile-money fees and premiums through votex365.
-- A payment's id comes from the phone, so a retry can't charge twice (D-011).
-- =============================================================================

BEGIN;

SET LOCAL app.user_id = '00000000-0000-0000-0000-000000000000';

CREATE TABLE payments (
  id            UUID PRIMARY KEY,
  patient_id    UUID NOT NULL REFERENCES patients(id),
  purpose       TEXT NOT NULL CHECK (purpose IN ('consultation_fee', 'insurance_premium')),
  subject_id    UUID NOT NULL,        -- the appointment or the insurance enrolment being paid for
  amount        NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  currency      TEXT NOT NULL DEFAULT 'GHS' CHECK (currency = 'GHS'),
  network       TEXT NOT NULL CHECK (network IN ('mtn', 'telecel', 'airteltigo')),
  provider      TEXT NOT NULL CHECK (provider IN ('votex365', 'simulated')),
  provider_ref  TEXT UNIQUE,
  checkout_url  TEXT,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'successful', 'failed')),
  created_at    TIMESTAMPTZ NOT NULL,
  created_by    UUID NOT NULL REFERENCES practitioners(id),
  updated_at    TIMESTAMPTZ NOT NULL,
  updated_by    UUID NOT NULL REFERENCES practitioners(id)
);
-- The phone number isn't kept here: votex365 needs it for the payment, and we don't (Act 843, data minimisation).

CREATE INDEX payments_patient_idx ON payments (patient_id, created_at DESC);
CREATE INDEX payments_status_idx ON payments (status, created_at);

-- One visit can't be charged twice, even through two ids. A failed try doesn't count, so they can try again.
CREATE UNIQUE INDEX payments_one_fee_per_visit ON payments (subject_id) WHERE purpose = 'consultation_fee' AND status <> 'failed';

-- A payment that has finished stays finished.
CREATE FUNCTION payments_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'pending' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Payment % is already %; it cannot change.', OLD.id, OLD.status USING ERRCODE = 'check_violation';
  END IF;
  IF (NEW.amount, NEW.patient_id, NEW.purpose, NEW.subject_id) IS DISTINCT FROM (OLD.amount, OLD.patient_id, OLD.purpose, OLD.subject_id) THEN
    RAISE EXCEPTION 'What a payment was for, and how much, cannot be edited.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER payments_guard_trg
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION payments_guard();
CREATE TRIGGER payments_audit_trg
  BEFORE INSERT OR UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION stamp_audit_columns();
CREATE TRIGGER payments_audit_trail_trg
  AFTER INSERT OR UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER payments_no_delete_trg
  BEFORE DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION forbid_delete_with_hint('A payment stays on record. A failed one stays as failed.');

COMMIT;
