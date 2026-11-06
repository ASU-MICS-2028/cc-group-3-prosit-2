-- =============================================================================
-- HealthConnect Ghana — 004_full_brief_core.sql
-- Final sprint, task E-M part 1 (D-029, D-035): new roles and the Tier 1 tables.
--
--   1. Roles: pharmacist, traditional_healer, health_centre_admin, patient;
--      a patient login is tied to its own patient record (practitioners.patient_id)
--   2. Facilities, and which facility each health worker belongs to
--   3. Referrals (FHIR ServiceRequest), with priority and consent
--   4. Emergencies: raised, acknowledged, escalated, resolved
--   5. Prescriptions (FHIR MedicationRequest): dispensed once only
--
-- The phone app names some roles differently (healer, facility_admin, ghs,
-- clinician); the API translates between the app's names and these.
-- =============================================================================

BEGIN;

-- Rows written by a migration are attributed to the 'system' account (D-015).
SET LOCAL app.user_id = '00000000-0000-0000-0000-000000000000';

-- ---------------------------------------------------------------------------
-- 1. Roles
-- A CHECK rule can't be edited, so the old one is dropped and a wider one added.
-- Existing rows all use the old names, so they still pass.
-- ---------------------------------------------------------------------------
ALTER TABLE practitioners DROP CONSTRAINT practitioners_role_check;
ALTER TABLE practitioners ADD CONSTRAINT practitioners_role_check
  CHECK (role IN ('chv', 'nurse', 'doctor', 'specialist', 'ghs_official', 'admin', 'system',
                  'pharmacist', 'traditional_healer', 'health_centre_admin', 'patient'));

-- A patient's login points at their own patient record, so it can only open that one.
-- Rule: a 'patient' login must have patient_id; every other role must not.
-- One login per patient record (UNIQUE).
ALTER TABLE practitioners ADD COLUMN patient_id UUID UNIQUE REFERENCES patients(id);
ALTER TABLE practitioners ADD CONSTRAINT practitioners_patient_login_check
  CHECK ((role = 'patient') = (patient_id IS NOT NULL));

-- ---------------------------------------------------------------------------
-- 2. Facilities: the places care happens (FHIR: Location / Organization)
-- A CHPS compound is Ghana's village health post (Community-based Health
-- Planning and Services). Facilities are switched off (active = false), never
-- deleted, because past records point at them.
-- ---------------------------------------------------------------------------
CREATE TABLE facilities (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),           -- D-011
  name        TEXT NOT NULL,
  type        TEXT NOT NULL
              CHECK (type IN ('chps', 'health_centre', 'clinic', 'hospital', 'pharmacy')),
  region      TEXT NOT NULL,                                        -- one of Ghana's 16 regions
  district    TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL,
  created_by  UUID NOT NULL REFERENCES practitioners(id),
  updated_at  TIMESTAMPTZ NOT NULL,
  updated_by  UUID NOT NULL REFERENCES practitioners(id)
);

CREATE TRIGGER facilities_audit_trg
  BEFORE INSERT OR UPDATE ON facilities
  FOR EACH ROW EXECUTE FUNCTION stamp_audit_columns();
CREATE TRIGGER facilities_audit_trail_trg
  AFTER INSERT OR UPDATE OR DELETE ON facilities
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
-- 001's forbid_delete() hints at observations, so the new tables use this one,
-- which takes the hint as an argument: what to do instead of deleting.
CREATE FUNCTION forbid_delete_with_hint() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows cannot be deleted.', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation', HINT = TG_ARGV[0];
END;
$$;

CREATE TRIGGER facilities_no_delete_trg
  BEFORE DELETE ON facilities
  FOR EACH ROW EXECUTE FUNCTION forbid_delete_with_hint('Switch it off instead: set active = false.');

-- Each health worker belongs to one facility, so a health centre admin can be
-- limited to their own. The old free-text `facility` column stays (never
-- rewrite history); new code uses facility_id.
ALTER TABLE practitioners ADD COLUMN facility_id UUID REFERENCES facilities(id);

-- ---------------------------------------------------------------------------
-- Shared by the new clinical tables (referrals, prescriptions): the consent
-- they point at must be for clinical care and not withdrawn (D-012, D-014).
-- The foreign key (consent_id, patient_id) already proves the consent exists
-- and belongs to the same patient.
-- ---------------------------------------------------------------------------
CREATE FUNCTION require_clinical_consent() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  c  consents%ROWTYPE;
BEGIN
  SELECT * INTO c FROM consents WHERE id = (to_jsonb(NEW) ->> 'consent_id')::uuid;
  IF FOUND AND c.purpose <> 'clinical_care' THEN
    RAISE EXCEPTION 'Consent % covers "%", not clinical care.', c.id, c.purpose
      USING ERRCODE = 'check_violation';
  END IF;
  IF FOUND AND c.withdrawn_at IS NOT NULL THEN
    RAISE EXCEPTION 'Consent % was withdrawn. Obtain new consent first.', c.id
      USING ERRCODE = 'check_violation', HINT = 'consent_withdrawn';
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Referrals: a patient sent on to a specialist, a facility or a healer
-- (FHIR ServiceRequest). Priority uses the app's four words. priority_reason
-- says why, so the priority can be explained (rules are illustrative until a
-- medical partner signs them off). Cancelled, never deleted.
-- ---------------------------------------------------------------------------
CREATE TABLE referrals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),   -- D-011
  patient_id          UUID NOT NULL REFERENCES patients(id),
  consent_id          UUID NOT NULL,
  to_practitioner_id  UUID REFERENCES practitioners(id),            -- a specialist, doctor or healer
  to_facility_id      UUID REFERENCES facilities(id),
  reason              TEXT NOT NULL,
  priority            TEXT NOT NULL
                      CHECK (priority IN ('emergency', 'urgent', 'soon', 'routine')),
  priority_reason     TEXT,                                         -- e.g. 'temperature above 39 C'
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'accepted', 'completed', 'declined', 'cancelled')),
  created_at          TIMESTAMPTZ NOT NULL,
  created_by          UUID NOT NULL REFERENCES practitioners(id),   -- who referred
  updated_at          TIMESTAMPTZ NOT NULL,
  updated_by          UUID NOT NULL REFERENCES practitioners(id),

  FOREIGN KEY (consent_id, patient_id) REFERENCES consents (id, patient_id),   -- D-012
  CHECK (to_practitioner_id IS NOT NULL OR to_facility_id IS NOT NULL)       -- it must go somewhere
);

-- The receiver's inbox: their open referrals.
CREATE INDEX referrals_inbox_idx ON referrals (to_practitioner_id, status);

CREATE TRIGGER referrals_consent_trg
  BEFORE INSERT ON referrals
  FOR EACH ROW EXECUTE FUNCTION require_clinical_consent();
CREATE TRIGGER referrals_audit_trg
  BEFORE INSERT OR UPDATE ON referrals
  FOR EACH ROW EXECUTE FUNCTION stamp_audit_columns();
CREATE TRIGGER referrals_audit_trail_trg
  AFTER INSERT OR UPDATE OR DELETE ON referrals
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER referrals_no_delete_trg
  BEFORE DELETE ON referrals
  FOR EACH ROW EXECUTE FUNCTION forbid_delete_with_hint('Cancel it instead: set status = ''cancelled''.');

-- ---------------------------------------------------------------------------
-- 4. Emergencies: the emergency button (FHIR: Flag / Communication).
-- NO consent check on purpose: in an emergency there may be no time to ask,
-- and care goes ahead on implied consent. The patient is optional (they may
-- not be registered yet).
-- The escalation TIMER lives in the API; the database stores the level and
-- the times, so "who knew, and when" can always be answered.
-- ---------------------------------------------------------------------------
CREATE TABLE emergencies (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),     -- D-011
  patient_id        UUID REFERENCES patients(id),                   -- optional
  facility_id       UUID REFERENCES facilities(id),
  location_note     TEXT,                                           -- e.g. 'house behind the market, Sokode'
  description       TEXT NOT NULL,                                  -- what's happening
  status            TEXT NOT NULL DEFAULT 'raised'
                    CHECK (status IN ('raised', 'acknowledged', 'resolved', 'cancelled')),
  escalation_level  INTEGER NOT NULL DEFAULT 0 CHECK (escalation_level BETWEEN 0 AND 5),
  escalated_at      TIMESTAMPTZ,                                    -- last time it went up a level
  acknowledged_by   UUID REFERENCES practitioners(id),
  acknowledged_at   TIMESTAMPTZ,
  resolved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL,                           -- when it was raised
  created_by        UUID NOT NULL REFERENCES practitioners(id),     -- who pressed the button
  updated_at        TIMESTAMPTZ NOT NULL,
  updated_by        UUID NOT NULL REFERENCES practitioners(id),

  -- Acknowledged (or later) means someone responded: say who and when.
  CHECK (status NOT IN ('acknowledged', 'resolved') OR (acknowledged_by IS NOT NULL AND acknowledged_at IS NOT NULL)),
  CHECK (status <> 'resolved' OR resolved_at IS NOT NULL),
  CHECK (escalation_level = 0 OR escalated_at IS NOT NULL)
);

-- The open-emergencies list, oldest first.
CREATE INDEX emergencies_open_idx ON emergencies (created_at) WHERE status IN ('raised', 'acknowledged');

-- Rules that compare before and after, which a CHECK can't do:
--   * the level never goes down, and each step up records a new escalated_at
--   * a resolved or cancelled emergency is closed: no more changes
CREATE FUNCTION emergencies_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('resolved', 'cancelled') THEN
    RAISE EXCEPTION 'Emergency % is % and closed; it cannot be changed.', OLD.id, OLD.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.escalation_level < OLD.escalation_level THEN
    RAISE EXCEPTION 'The escalation level cannot go down (% to %).', OLD.escalation_level, NEW.escalation_level
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.escalation_level > OLD.escalation_level
     AND NEW.escalated_at IS NOT DISTINCT FROM OLD.escalated_at THEN
    RAISE EXCEPTION 'Escalating to level % needs a new escalated_at time.', NEW.escalation_level
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER emergencies_guard_trg
  BEFORE UPDATE ON emergencies
  FOR EACH ROW EXECUTE FUNCTION emergencies_guard();
CREATE TRIGGER emergencies_audit_trg
  BEFORE INSERT OR UPDATE ON emergencies
  FOR EACH ROW EXECUTE FUNCTION stamp_audit_columns();
CREATE TRIGGER emergencies_audit_trail_trg
  AFTER INSERT OR UPDATE OR DELETE ON emergencies
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER emergencies_no_delete_trg
  BEFORE DELETE ON emergencies
  FOR EACH ROW EXECUTE FUNCTION forbid_delete_with_hint('A false alarm is set to status = ''cancelled''.');

-- ---------------------------------------------------------------------------
-- 5. Prescriptions (FHIR MedicationRequest)
-- The brief's must-implement fraud checks, split by who can do them best:
--   database (here): only a doctor or specialist prescribes; only a pharmacist
--     dispenses; a prescription is dispensed ONCE, never after it expires,
--     and is closed after that; never deleted.
--   API (Joseph): flags for a person to look at, such as the same medicine
--     twice for one patient, or too many prescriptions from one prescriber.
--     They're warnings, not blocks: a patient can genuinely need both.
-- ---------------------------------------------------------------------------
CREATE TABLE prescriptions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),  -- D-011
  patient_id            UUID NOT NULL REFERENCES patients(id),
  consent_id            UUID NOT NULL,
  medication            TEXT NOT NULL,                                -- e.g. 'Amoxicillin 500 mg capsule'
  dose                  TEXT NOT NULL,                                -- e.g. '1 capsule'
  frequency             TEXT NOT NULL,                                -- e.g. '3 times a day'
  duration_days         INTEGER NOT NULL CHECK (duration_days BETWEEN 1 AND 365),
  quantity              INTEGER NOT NULL CHECK (quantity > 0),
  instructions          TEXT,
  verification_code     TEXT NOT NULL UNIQUE CHECK (length(verification_code) >= 8),  -- shown as a QR code
  expires_at            TIMESTAMPTZ NOT NULL,
  status                TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'dispensed', 'cancelled', 'expired')),
  dispensed_by          UUID REFERENCES practitioners(id),
  dispensed_at          TIMESTAMPTZ,
  dispensed_facility_id UUID REFERENCES facilities(id),
  created_at            TIMESTAMPTZ NOT NULL,
  created_by            UUID NOT NULL REFERENCES practitioners(id),   -- the prescriber
  updated_at            TIMESTAMPTZ NOT NULL,
  updated_by            UUID NOT NULL REFERENCES practitioners(id),

  FOREIGN KEY (consent_id, patient_id) REFERENCES consents (id, patient_id),   -- D-012
  CHECK (status <> 'dispensed' OR (dispensed_by IS NOT NULL AND dispensed_at IS NOT NULL))
);

-- Fast lookups for the API's duplicate check and the patient's medicine list.
CREATE INDEX prescriptions_patient_idx ON prescriptions (patient_id, status);

CREATE FUNCTION prescriptions_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  actor_role  TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT role INTO actor_role FROM practitioners WHERE id = current_actor();
    IF actor_role IS DISTINCT FROM 'doctor' AND actor_role IS DISTINCT FROM 'specialist' THEN
      RAISE EXCEPTION 'Only a doctor or specialist can prescribe (this account is %).', coalesce(actor_role, 'unknown')
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.expires_at <= now() THEN
      RAISE EXCEPTION 'A new prescription must expire in the future.' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF OLD.status IN ('dispensed', 'cancelled', 'expired') THEN
    RAISE EXCEPTION 'Prescription % is already % and closed; it cannot be dispensed or changed again.', OLD.id, OLD.status
      USING ERRCODE = 'check_violation', HINT = 'already_' || OLD.status;
  END IF;
  IF NEW.status = 'dispensed' THEN
    IF OLD.expires_at <= now() THEN
      RAISE EXCEPTION 'Prescription % expired on %; it cannot be dispensed.', OLD.id, OLD.expires_at
        USING ERRCODE = 'check_violation', HINT = 'expired';
    END IF;
    IF NEW.dispensed_by IS NULL THEN
      RAISE EXCEPTION 'Say who dispensed it: set dispensed_by to the pharmacist.'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT role INTO actor_role FROM practitioners WHERE id = NEW.dispensed_by;
    IF actor_role IS DISTINCT FROM 'pharmacist' THEN
      RAISE EXCEPTION 'Only a pharmacist can dispense (dispensed_by is a %).', coalesce(actor_role, 'unknown account')
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  -- What was prescribed can't be edited afterwards: cancel and write a new one.
  IF (NEW.patient_id, NEW.medication, NEW.dose, NEW.frequency, NEW.duration_days, NEW.quantity, NEW.verification_code)
     IS DISTINCT FROM
     (OLD.patient_id, OLD.medication, OLD.dose, OLD.frequency, OLD.duration_days, OLD.quantity, OLD.verification_code) THEN
    RAISE EXCEPTION 'What was prescribed cannot be edited. Cancel it and write a new prescription.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER prescriptions_consent_trg
  BEFORE INSERT ON prescriptions
  FOR EACH ROW EXECUTE FUNCTION require_clinical_consent();
CREATE TRIGGER prescriptions_guard_trg
  BEFORE INSERT OR UPDATE ON prescriptions
  FOR EACH ROW EXECUTE FUNCTION prescriptions_guard();
CREATE TRIGGER prescriptions_audit_trg
  BEFORE INSERT OR UPDATE ON prescriptions
  FOR EACH ROW EXECUTE FUNCTION stamp_audit_columns();
CREATE TRIGGER prescriptions_audit_trail_trg
  AFTER INSERT OR UPDATE OR DELETE ON prescriptions
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER prescriptions_no_delete_trg
  BEFORE DELETE ON prescriptions
  FOR EACH ROW EXECUTE FUNCTION forbid_delete_with_hint('Cancel it instead: set status = ''cancelled''.');

COMMIT;
