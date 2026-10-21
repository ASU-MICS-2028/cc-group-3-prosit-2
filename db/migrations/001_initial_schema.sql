-- =============================================================================
-- HealthConnect Ghana — 001_initial_schema.sql
-- Lab 6 Part C: FHIR-aligned data model
--
-- Decisions referenced. Team-wide ones are in docs/decisions.md (D-),
-- data-layer-only ones in docs/data-decisions.md (DATA-):
--   D-011     Client-generated UUID primary keys
--   D-012     Consent enforced by composite foreign key + trigger
--   D-013     Clinical rows are corrected, never deleted
--   D-014     Consent is recorded per purpose
--   D-015     Audit: columns stamped by the database (+ audit trail in 003)
--   D-017     Appointment end time + double-booking guard
--   DATA-001  Build to the team plan, not the lab starter
--   DATA-002  LOINC codes in a lookup table (seeded in 002_loinc_reference.sql)
--   DATA-003  practitioners table replaces free-text recorded_by
--   DATA-004  access_log has no foreign key to patients
--   DATA-005  Observation category held per LOINC code
--
-- Requires PostgreSQL 13+ (gen_random_uuid() is built in).
-- Run inside one transaction so a failure leaves nothing half-built.
-- =============================================================================

BEGIN;

-- btree_gist lets one constraint combine "same specialist" (=) with
-- "overlapping time" (&&): used by the appointments double-booking guard.
-- Available on Amazon RDS for PostgreSQL.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- -----------------------------------------------------------------------------
-- Record-level audit columns                                         (D-015)
-- Every table except access_log carries:
--   created_at, created_by, updated_at, updated_by
-- They are stamped by a trigger, never trusted from the client:
--   * the acting user comes from the transaction setting app.user_id, which the
--     API sets from the authenticated user:  SET LOCAL app.user_id = '<uuid>';
--   * a write with no acting user is refused, so a psql session must identify
--     itself too;
--   * created_at / created_by can never be changed after insert.
-- -----------------------------------------------------------------------------
CREATE FUNCTION current_actor() RETURNS UUID
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v TEXT := current_setting('app.user_id', true);
BEGIN
  IF v IS NULL OR v = '' THEN
    RAISE EXCEPTION 'No acting user set. Run  SET LOCAL app.user_id = ''<practitioner uuid>''  before writing.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN v::uuid;
END;
$$;

CREATE FUNCTION stamp_audit_columns() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
    NEW.created_by := current_actor();
  ELSE
    NEW.created_at := OLD.created_at;   -- immutable
    NEW.created_by := OLD.created_by;   -- immutable
  END IF;
  NEW.updated_at := now();
  NEW.updated_by := current_actor();
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- practitioners  →  FHIR Practitioner (+ PractitionerRole, simplified)
-- Who records readings, gives consent on a patient's behalf, and sees patients.
-- Replaces the starter's free-text `recorded_by`, and gives Lab 7's
-- appointments a real specialist to point at.
-- -----------------------------------------------------------------------------
CREATE TABLE practitioners (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),           -- D-011
  full_name   TEXT NOT NULL,
  role        TEXT NOT NULL
              CHECK (role IN ('chv', 'nurse', 'doctor', 'specialist', 'ghs_official', 'admin', 'system')),  -- roles from S8 vocabulary
  facility    TEXT,                                                 -- clinic / CHPS compound
  active      BOOLEAN NOT NULL DEFAULT true,                        -- deactivate, never delete
  created_at  TIMESTAMPTZ NOT NULL,
  created_by  UUID NOT NULL REFERENCES practitioners(id),
  updated_at  TIMESTAMPTZ NOT NULL,
  updated_by  UUID NOT NULL REFERENCES practitioners(id)
);

CREATE TRIGGER practitioners_audit_trg
  BEFORE INSERT OR UPDATE ON practitioners
  FOR EACH ROW EXECUTE FUNCTION stamp_audit_columns();

-- Bootstrap: a fixed 'system' account that owns rows written by migrations
-- (e.g. the LOINC seed in 002). It creates itself, so the FK is satisfied.
SET LOCAL app.user_id = '00000000-0000-0000-0000-000000000000';
INSERT INTO practitioners (id, full_name, role)
VALUES ('00000000-0000-0000-0000-000000000000', 'HealthConnect system (migrations)', 'system');

-- -----------------------------------------------------------------------------
-- patients  →  FHIR Patient
-- Every column must be justified in docs/fhir-mapping.md (Data Minimisation section).
-- Removed from the starter: fhir_resource_type (constant; the table name says
-- it) and consent_given_at (moved to the consents table, D-012).
-- -----------------------------------------------------------------------------
CREATE TABLE patients (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),  -- D-011: app supplies it
  full_name              TEXT NOT NULL,
  phone                  TEXT
                         CHECK (phone ~ '^\+[1-9][0-9]{7,14}$'),      -- E.164, e.g. +233000000001
  date_of_birth          DATE
                         CHECK (date_of_birth <= CURRENT_DATE),
  birth_date_estimated   BOOLEAN NOT NULL DEFAULT false,              -- many patients know only their approximate age
  gender                 TEXT
                         CHECK (gender IN ('male', 'female', 'other', 'unknown')),  -- FHIR AdministrativeGender
  country_code           CHAR(2) NOT NULL DEFAULT 'GH'
                         CHECK (country_code ~ '^[A-Z]{2}$'),         -- ISO 3166; partition key (Lab 5 Part C)
  region                 TEXT,
  preferred_language     TEXT,
  created_at             TIMESTAMPTZ NOT NULL,
  created_by             UUID NOT NULL REFERENCES practitioners(id),
  updated_at             TIMESTAMPTZ NOT NULL,
  updated_by             UUID NOT NULL REFERENCES practitioners(id)
);

CREATE INDEX patients_country_region_idx ON patients (country_code, region);

CREATE TRIGGER patients_audit_trg
  BEFORE INSERT OR UPDATE ON patients
  FOR EACH ROW EXECUTE FUNCTION stamp_audit_columns();

-- -----------------------------------------------------------------------------
-- consents  →  FHIR Consent                                           (D-012)
-- One row per grant of consent for one purpose. Withdrawal sets withdrawn_at;
-- rows are never deleted and never otherwise changed.
-- -----------------------------------------------------------------------------
CREATE TABLE consents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id     UUID NOT NULL REFERENCES patients(id),
  purpose        TEXT NOT NULL
                 CHECK (purpose IN ('clinical_care', 'appointment_reminders', 'health_advisory')),
  given_by       TEXT NOT NULL
                 CHECK (given_by IN ('patient', 'guardian', 'chv_on_behalf')),
  recorded_by    UUID NOT NULL REFERENCES practitioners(id),
  given_at       TIMESTAMPTZ NOT NULL,
  withdrawn_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL,
  created_by     UUID NOT NULL REFERENCES practitioners(id),
  updated_at     TIMESTAMPTZ NOT NULL,
  updated_by     UUID NOT NULL REFERENCES practitioners(id),   -- on a withdrawal: who recorded it

  CHECK (withdrawn_at IS NULL OR withdrawn_at >= given_at),

  -- Target of the composite foreign key on observations: lets Postgres prove
  -- that a reading's consent belongs to the same patient.
  UNIQUE (id, patient_id)
);

CREATE INDEX consents_patient_idx ON consents (patient_id, purpose);

-- Consents are append-only, except for recording a withdrawal once.
CREATE FUNCTION consents_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Consent records cannot be deleted. Record a withdrawal by setting withdrawn_at.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  -- UPDATE: only NULL -> timestamp on withdrawn_at is allowed.
  IF OLD.withdrawn_at IS NOT NULL THEN
    RAISE EXCEPTION 'Consent % was already withdrawn on %; it cannot be changed. Record a new consent instead.',
      OLD.id, OLD.withdrawn_at
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF (NEW.id, NEW.patient_id, NEW.purpose, NEW.given_by, NEW.recorded_by, NEW.given_at)
     IS DISTINCT FROM
     (OLD.id, OLD.patient_id, OLD.purpose, OLD.given_by, OLD.recorded_by, OLD.given_at) THEN
    RAISE EXCEPTION 'Only withdrawn_at may be set on an existing consent.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER consents_guard_trg
  BEFORE UPDATE OR DELETE ON consents
  FOR EACH ROW EXECUTE FUNCTION consents_guard();

CREATE TRIGGER consents_audit_trg
  BEFORE INSERT OR UPDATE ON consents
  FOR EACH ROW EXECUTE FUNCTION stamp_audit_columns();

-- -----------------------------------------------------------------------------
-- loinc_codes  →  local stand-in for a FHIR terminology server       (DATA-002)
-- Table only; permitted codes are seeded in 002_loinc_reference.sql.
-- -----------------------------------------------------------------------------
CREATE TABLE loinc_codes (
  code            TEXT PRIMARY KEY
                  CHECK (code ~ '^[0-9]{1,7}-[0-9]$'),   -- LOINC format: digits, hyphen, check digit
  label           TEXT NOT NULL,
  unit            TEXT NOT NULL,                         -- UCUM, e.g. 'Cel', 'mm[Hg]'
  unit_display    TEXT NOT NULL,                         -- for people, e.g. '°C', 'mmHg'
  category        TEXT NOT NULL                          -- FHIR Observation.category (DATA-005)
                  CHECK (category IN ('vital-signs', 'laboratory')),
  min_plausible   NUMERIC NOT NULL,                      -- catches typos, NOT a clinical threshold
  max_plausible   NUMERIC NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL,
  created_by      UUID NOT NULL REFERENCES practitioners(id),
  updated_at      TIMESTAMPTZ NOT NULL,
  updated_by      UUID NOT NULL REFERENCES practitioners(id),
  CHECK (min_plausible < max_plausible)
);

CREATE TRIGGER loinc_codes_audit_trg
  BEFORE INSERT OR UPDATE ON loinc_codes
  FOR EACH ROW EXECUTE FUNCTION stamp_audit_columns();

-- -----------------------------------------------------------------------------
-- observations  →  FHIR Observation
-- -----------------------------------------------------------------------------
CREATE TABLE observations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),            -- D-011
  patient_id     UUID NOT NULL REFERENCES patients(id),
  consent_id     UUID NOT NULL,
  loinc_code     TEXT NOT NULL REFERENCES loinc_codes(code),            -- DATA-002
  value          NUMERIC NOT NULL,                                      -- unit comes from loinc_codes
  group_id       UUID,              -- links readings taken together, e.g. systolic + diastolic
  status         TEXT NOT NULL DEFAULT 'final'
                 CHECK (status IN ('final', 'amended', 'entered-in-error')),  -- FHIR ObservationStatus
  recorded_by    UUID NOT NULL REFERENCES practitioners(id),  -- who took the measurement (FHIR performer)
  effective_at   TIMESTAMPTZ NOT NULL,                  -- when it was measured (may be offline, before sync)
  created_at     TIMESTAMPTZ NOT NULL,                  -- when the database received it
  created_by     UUID NOT NULL REFERENCES practitioners(id),  -- who submitted it (may differ from recorded_by)
  updated_at     TIMESTAMPTZ NOT NULL,
  updated_by     UUID NOT NULL REFERENCES practitioners(id),

  -- D-012 guard 1: the consent exists AND belongs to this patient.
  FOREIGN KEY (consent_id, patient_id) REFERENCES consents (id, patient_id),

  CHECK (effective_at <= created_at + interval '5 minutes')   -- no readings from the future (small clock-skew allowance)
);

CREATE TRIGGER observations_audit_trg
  BEFORE INSERT OR UPDATE ON observations
  FOR EACH ROW EXECUTE FUNCTION stamp_audit_columns();

CREATE INDEX observations_patient_idx ON observations (patient_id, effective_at DESC);
CREATE INDEX observations_group_idx   ON observations (group_id) WHERE group_id IS NOT NULL;

-- D-012 guard 2 + DATA-002 plausibility: runs for the API, psql and scripts alike.
CREATE FUNCTION observations_before_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  c  consents%ROWTYPE;
  l  loinc_codes%ROWTYPE;
BEGIN
  SELECT * INTO c FROM consents WHERE id = NEW.consent_id;
  -- (A missing consent is caught by the foreign key; guard here so the
  --  messages below never dereference a NULL row.)
  IF FOUND THEN
    IF c.purpose <> 'clinical_care' THEN
      RAISE EXCEPTION 'Consent % covers "%", not clinical care. Obtain clinical-care consent before recording.',
        c.id, c.purpose
        USING ERRCODE = 'check_violation';
    END IF;

    IF c.withdrawn_at IS NOT NULL THEN
      RAISE EXCEPTION 'Consent % was withdrawn on %. Obtain new consent before recording.',
        c.id, to_char(c.withdrawn_at AT TIME ZONE 'UTC', 'DD Mon YYYY')
        USING ERRCODE = 'check_violation', HINT = 'consent_withdrawn';
    END IF;

    IF NEW.effective_at < c.given_at THEN
      RAISE EXCEPTION 'Reading taken at % is before consent % was given at %.',
        NEW.effective_at, c.id, c.given_at
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  SELECT * INTO l FROM loinc_codes WHERE code = NEW.loinc_code;
  IF FOUND AND (NEW.value < l.min_plausible OR NEW.value > l.max_plausible) THEN
    RAISE EXCEPTION '% of % % is outside the plausible range (% to %). Check for a typing error.',
      l.label, NEW.value, l.unit_display, l.min_plausible, l.max_plausible
      USING ERRCODE = 'check_violation', HINT = 'implausible_value';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER observations_before_insert_trg
  BEFORE INSERT ON observations
  FOR EACH ROW EXECUTE FUNCTION observations_before_insert();

-- Clinical records are corrected, never deleted: set status = 'entered-in-error'.
CREATE FUNCTION forbid_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows cannot be deleted.', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation',
          HINT = 'Correct an observation by setting status = ''entered-in-error''.';
END;
$$;

CREATE TRIGGER observations_no_delete_trg
  BEFORE DELETE ON observations
  FOR EACH ROW EXECUTE FUNCTION forbid_delete();

-- -----------------------------------------------------------------------------
-- appointments  →  FHIR Appointment            (needed by Lab 7 Part A)
-- Lab 7's starter inserts (patient_id, specialist_id, time); `time` is renamed
-- starts_at here, and ids are UUIDs, so its INSERT needs a small update.
-- -----------------------------------------------------------------------------
CREATE TABLE appointments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),            -- D-011
  patient_id     UUID NOT NULL REFERENCES patients(id),
  specialist_id  UUID NOT NULL REFERENCES practitioners(id),
  starts_at      TIMESTAMPTZ NOT NULL,
  ends_at        TIMESTAMPTZ NOT NULL,                  -- FHIR Appointment.end; filled by trigger if omitted (D-017)
  status         TEXT NOT NULL DEFAULT 'booked'
                 CHECK (status IN ('booked', 'cancelled', 'fulfilled', 'noshow')),  -- subset of FHIR AppointmentStatus
  created_at     TIMESTAMPTZ NOT NULL,
  created_by     UUID NOT NULL REFERENCES practitioners(id),
  updated_at     TIMESTAMPTZ NOT NULL,
  updated_by     UUID NOT NULL REFERENCES practitioners(id),

  CHECK (ends_at > starts_at),

  -- No double-booking: a specialist cannot have two overlapping 'booked'
  -- appointments. Enforced by Postgres, so two CHVs booking the same slot at
  -- the same moment cannot both succeed. Cancelled slots free up automatically.
  EXCLUDE USING gist (
    specialist_id WITH =,
    tstzrange(starts_at, ends_at) WITH &&
  ) WHERE (status = 'booked')
);

-- Default length: if the client sends only a start time (as Lab 7's starter
-- does), the appointment is 30 minutes long.
CREATE FUNCTION appointments_default_end() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.ends_at IS NULL THEN
    NEW.ends_at := NEW.starts_at + interval '30 minutes';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER appointments_default_end_trg
  BEFORE INSERT OR UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION appointments_default_end();

CREATE TRIGGER appointments_audit_trg
  BEFORE INSERT OR UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION stamp_audit_columns();

CREATE INDEX appointments_specialist_time_idx ON appointments (specialist_id, starts_at);
CREATE INDEX appointments_patient_idx         ON appointments (patient_id, starts_at);

-- -----------------------------------------------------------------------------
-- access_log  →  FHIR AuditEvent                (Lab 6 Part D)
-- Append-only, so it has no updated_* columns: accessed_by / accessed_at ARE
-- its created_by / created_at. patient_id deliberately has NO foreign key:
--   * attempts on a non-existent patient id (404s, probing) must still be logged;
--   * a foreign key would tie the audit trail's survival to the patient table.
-- -----------------------------------------------------------------------------
CREATE TABLE access_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),   -- server-generated: the server writes these rows
  accessed_by    UUID REFERENCES practitioners(id),            -- NULL = unauthenticated / unknown caller
  patient_id     UUID,                                         -- no FK, see above
  resource_type  TEXT NOT NULL
                 CHECK (resource_type IN ('Patient', 'Observation', 'Consent', 'Appointment')),
  action         TEXT NOT NULL
                 CHECK (action IN ('read', 'create', 'update', 'delete')),
  outcome        TEXT NOT NULL
                 CHECK (outcome IN ('success', 'denied', 'not_found', 'error')),
  source_ip      INET,
  accessed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX access_log_patient_idx ON access_log (patient_id, accessed_at DESC);
CREATE INDEX access_log_actor_idx   ON access_log (accessed_by, accessed_at DESC);

CREATE FUNCTION access_log_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'access_log is append-only; % is not allowed.', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER access_log_append_only_trg
  BEFORE UPDATE OR DELETE ON access_log
  FOR EACH ROW EXECUTE FUNCTION access_log_append_only();

-- TRUNCATE skips row triggers, so block it separately on the protected tables.
CREATE FUNCTION forbid_truncate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% cannot be truncated.', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER access_log_no_truncate_trg   BEFORE TRUNCATE ON access_log   FOR EACH STATEMENT EXECUTE FUNCTION forbid_truncate();
CREATE TRIGGER observations_no_truncate_trg BEFORE TRUNCATE ON observations FOR EACH STATEMENT EXECUTE FUNCTION forbid_truncate();
CREATE TRIGGER consents_no_truncate_trg     BEFORE TRUNCATE ON consents     FOR EACH STATEMENT EXECUTE FUNCTION forbid_truncate();

COMMIT;
