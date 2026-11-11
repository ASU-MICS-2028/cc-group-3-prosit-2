-- =============================================================================
-- HealthConnect Ghana — 010_community_programs.sql
-- Final sprint, task E-M part 2 (insurance is already in 011):
--
--   1. Surveys and their anonymous answers (FHIR Questionnaire, QuestionnaireResponse)
--   2. Pregnancies and children (FHIR EpisodeOfCare, Patient + RelatedPerson)
--   3. Visit schedules for both (FHIR Appointment, status proposed)
--   4. Courses and each person's progress
--   5. Stock at a facility (FHIR SupplyDelivery, closest)
--
-- Act 843, data minimisation: survey answers name nobody; a pregnancy holds only
-- the expected due date; a child holds only a given name and date of birth.
-- =============================================================================

BEGIN;

SET LOCAL app.user_id = '00000000-0000-0000-0000-000000000000';

-- ---------------------------------------------------------------------------
-- 1. Surveys. Questions are multiple choice only: free text in an anonymous
-- survey invites people's names. Only a GHS official builds one; a closed
-- survey stays closed and the questions can't change, because answers refer to them.
-- ---------------------------------------------------------------------------
CREATE TABLE surveys (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),           -- D-011
  title       TEXT NOT NULL CHECK (length(trim(title)) > 0),
  questions   JSONB NOT NULL CHECK (jsonb_typeof(questions) = 'array' AND jsonb_array_length(questions) > 0),
                                 -- [{"id": "q1", "text": "...", "options": ["Yes", "No"]}]
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at  TIMESTAMPTZ NOT NULL,
  created_by  UUID NOT NULL REFERENCES practitioners(id),
  updated_at  TIMESTAMPTZ NOT NULL,
  updated_by  UUID NOT NULL REFERENCES practitioners(id)
);

CREATE FUNCTION surveys_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  actor_role TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT role INTO actor_role FROM practitioners WHERE id = current_actor();
    IF actor_role IS DISTINCT FROM 'ghs_official' THEN
      RAISE EXCEPTION 'Only a GHS official can build a survey (this account is %).', coalesce(actor_role, 'unknown')
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.title, NEW.questions) IS DISTINCT FROM (OLD.title, OLD.questions) THEN
    RAISE EXCEPTION 'A survey cannot be edited once it exists: its answers refer to these questions.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status = 'closed' AND NEW.status <> 'closed' THEN
    RAISE EXCEPTION 'A closed survey stays closed.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER surveys_guard_trg
  BEFORE INSERT OR UPDATE ON surveys
  FOR EACH ROW EXECUTE FUNCTION surveys_guard();
CREATE TRIGGER surveys_audit_trg
  BEFORE INSERT OR UPDATE ON surveys
  FOR EACH ROW EXECUTE FUNCTION stamp_audit_columns();
CREATE TRIGGER surveys_audit_trail_trg
  AFTER INSERT OR UPDATE OR DELETE ON surveys
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER surveys_no_delete_trg
  BEFORE DELETE ON surveys
  FOR EACH ROW EXECUTE FUNCTION forbid_delete_with_hint('Close it instead: set status = ''closed''.');

-- One filled-in survey. Deliberately no patient column: the answers are anonymous.
-- created_by is the volunteer who collected it, not the person who answered.
CREATE TABLE survey_answers (
  id          UUID PRIMARY KEY,                                     -- from the phone, so a retry can't double-count (D-011)
  survey_id   UUID NOT NULL REFERENCES surveys(id),
  answers     JSONB NOT NULL CHECK (jsonb_typeof(answers) = 'object'),   -- {"q1": "Yes"}
  created_at  TIMESTAMPTZ NOT NULL,
  created_by  UUID NOT NULL REFERENCES practitioners(id),
  updated_at  TIMESTAMPTZ NOT NULL,
  updated_by  UUID NOT NULL REFERENCES practitioners(id)
);

CREATE INDEX survey_answers_survey_idx ON survey_answers (survey_id);

-- Every question answered, with one of its own options, and nothing extra.
CREATE FUNCTION survey_answers_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  s surveys%ROWTYPE;
  actor_role TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'A survey answer cannot be changed after it is sent.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT role INTO actor_role FROM practitioners WHERE id = current_actor();
  IF actor_role IS NULL OR actor_role NOT IN ('chv', 'nurse') THEN
    RAISE EXCEPTION 'Only a CHV or nurse can record survey answers (this account is %).', coalesce(actor_role, 'unknown')
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO s FROM surveys WHERE id = NEW.survey_id;
  IF s.status IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'This survey is closed.' USING ERRCODE = 'check_violation', HINT = 'survey_closed';
  END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(NEW.answers)) <> jsonb_array_length(s.questions)
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(s.questions) q
                WHERE NOT coalesce((q -> 'options') ? (NEW.answers ->> (q ->> 'id')), false)) THEN
    RAISE EXCEPTION 'Answer every question, using one of its options.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER survey_answers_guard_trg
  BEFORE INSERT OR UPDATE ON survey_answers
  FOR EACH ROW EXECUTE FUNCTION survey_answers_guard();
CREATE TRIGGER survey_answers_audit_trg
  BEFORE INSERT OR UPDATE ON survey_answers
  FOR EACH ROW EXECUTE FUNCTION stamp_audit_columns();
CREATE TRIGGER survey_answers_audit_trail_trg
  AFTER INSERT OR UPDATE OR DELETE ON survey_answers
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER survey_answers_no_delete_trg
  BEFORE DELETE ON survey_answers
  FOR EACH ROW EXECUTE FUNCTION forbid_delete_with_hint('Answers are kept so the totals stay true.');

-- ---------------------------------------------------------------------------
-- 2. Pregnancies and children. Both need the mother's clinical-care consent.
-- Edited only by closing: a wrong entry is marked entered_in_error (D-013)
-- and entered again, so old values aren't quietly overwritten.
-- ---------------------------------------------------------------------------
CREATE TABLE pregnancies (
  id                 UUID PRIMARY KEY,                              -- D-011
  patient_id         UUID NOT NULL REFERENCES patients(id),
  consent_id         UUID NOT NULL,
  expected_due_date  DATE NOT NULL,
  status             TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'delivered', 'ended', 'entered_in_error')),
  created_at         TIMESTAMPTZ NOT NULL,
  created_by         UUID NOT NULL REFERENCES practitioners(id),
  updated_at         TIMESTAMPTZ NOT NULL,
  updated_by         UUID NOT NULL REFERENCES practitioners(id),

  FOREIGN KEY (consent_id, patient_id) REFERENCES consents (id, patient_id)   -- D-012
);

-- One active pregnancy per patient.
CREATE UNIQUE INDEX pregnancies_one_active_idx ON pregnancies (patient_id) WHERE status = 'active';

CREATE TABLE children (
  id             UUID PRIMARY KEY,                                  -- D-011
  mother_id      UUID NOT NULL REFERENCES patients(id),
  consent_id     UUID NOT NULL,
  given_name     TEXT NOT NULL CHECK (length(trim(given_name)) > 0),
  date_of_birth  DATE NOT NULL,
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'entered_in_error')),
  created_at     TIMESTAMPTZ NOT NULL,
  created_by     UUID NOT NULL REFERENCES practitioners(id),
  updated_at     TIMESTAMPTZ NOT NULL,
  updated_by     UUID NOT NULL REFERENCES practitioners(id),

  FOREIGN KEY (consent_id, mother_id) REFERENCES consents (id, patient_id)   -- D-012
);

CREATE INDEX children_mother_idx ON children (mother_id);

CREATE FUNCTION pregnancies_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.expected_due_date NOT BETWEEN current_date - 14 AND current_date + 300 THEN
      RAISE EXCEPTION 'The expected due date must be within the next 43 weeks.' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.patient_id, NEW.consent_id, NEW.expected_due_date) IS DISTINCT FROM (OLD.patient_id, OLD.consent_id, OLD.expected_due_date) THEN
    RAISE EXCEPTION 'A pregnancy record cannot be edited. Mark it entered in error and add it again.' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status <> 'active' THEN
    RAISE EXCEPTION 'This pregnancy record is already closed.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION children_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.date_of_birth > current_date OR NEW.date_of_birth < current_date - interval '5 years' THEN
      RAISE EXCEPTION 'Child records are for children under 5: check the date of birth.' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.mother_id, NEW.consent_id, NEW.given_name, NEW.date_of_birth) IS DISTINCT FROM (OLD.mother_id, OLD.consent_id, OLD.given_name, OLD.date_of_birth) THEN
    RAISE EXCEPTION 'A child record cannot be edited. Mark it entered in error and add it again.' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status <> 'active' THEN
    RAISE EXCEPTION 'This child record is already closed.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER pregnancies_consent_trg
  BEFORE INSERT ON pregnancies
  FOR EACH ROW EXECUTE FUNCTION require_clinical_consent();
CREATE TRIGGER pregnancies_guard_trg
  BEFORE INSERT OR UPDATE ON pregnancies
  FOR EACH ROW EXECUTE FUNCTION pregnancies_guard();
CREATE TRIGGER pregnancies_audit_trg
  BEFORE INSERT OR UPDATE ON pregnancies
  FOR EACH ROW EXECUTE FUNCTION stamp_audit_columns();
CREATE TRIGGER pregnancies_audit_trail_trg
  AFTER INSERT OR UPDATE OR DELETE ON pregnancies
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER pregnancies_no_delete_trg
  BEFORE DELETE ON pregnancies
  FOR EACH ROW EXECUTE FUNCTION forbid_delete_with_hint('Set status = ''entered_in_error'' instead.');

CREATE TRIGGER children_consent_trg
  BEFORE INSERT ON children
  FOR EACH ROW EXECUTE FUNCTION require_clinical_consent();
CREATE TRIGGER children_guard_trg
  BEFORE INSERT OR UPDATE ON children
  FOR EACH ROW EXECUTE FUNCTION children_guard();
CREATE TRIGGER children_audit_trg
  BEFORE INSERT OR UPDATE ON children
  FOR EACH ROW EXECUTE FUNCTION stamp_audit_columns();
CREATE TRIGGER children_audit_trail_trg
  AFTER INSERT OR UPDATE OR DELETE ON children
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER children_no_delete_trg
  BEFORE DELETE ON children
  FOR EACH ROW EXECUTE FUNCTION forbid_delete_with_hint('Set status = ''entered_in_error'' instead.');

-- ---------------------------------------------------------------------------
-- 3. Visit schedules: one row per planned visit, for a pregnancy or a child.
-- The app turns these into reminders. A visit is marked done once.
-- ---------------------------------------------------------------------------
CREATE TABLE visit_schedules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),         -- D-011
  pregnancy_id  UUID REFERENCES pregnancies(id),
  child_id      UUID REFERENCES children(id),
  label         TEXT NOT NULL CHECK (length(trim(label)) > 0),
  due_on        DATE NOT NULL,
  done_at       TIMESTAMPTZ,
  done_by       UUID REFERENCES practitioners(id),
  created_at    TIMESTAMPTZ NOT NULL,
  created_by    UUID NOT NULL REFERENCES practitioners(id),
  updated_at    TIMESTAMPTZ NOT NULL,
  updated_by    UUID NOT NULL REFERENCES practitioners(id),

  CHECK (num_nonnulls(pregnancy_id, child_id) = 1),                 -- for exactly one of the two
  CHECK ((done_at IS NULL) = (done_by IS NULL))                     -- done means saying who and when
);

CREATE INDEX visit_schedules_pregnancy_idx ON visit_schedules (pregnancy_id);
CREATE INDEX visit_schedules_child_idx ON visit_schedules (child_id);

CREATE FUNCTION visit_schedules_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.pregnancy_id, NEW.child_id, NEW.label, NEW.due_on) IS DISTINCT FROM (OLD.pregnancy_id, OLD.child_id, OLD.label, OLD.due_on) THEN
    RAISE EXCEPTION 'A planned visit cannot be moved or relabelled.' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.done_at IS NOT NULL THEN
    RAISE EXCEPTION 'This visit is already marked done.' USING ERRCODE = 'check_violation', HINT = 'already_done';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER visit_schedules_guard_trg
  BEFORE UPDATE ON visit_schedules
  FOR EACH ROW EXECUTE FUNCTION visit_schedules_guard();
CREATE TRIGGER visit_schedules_audit_trg
  BEFORE INSERT OR UPDATE ON visit_schedules
  FOR EACH ROW EXECUTE FUNCTION stamp_audit_columns();
CREATE TRIGGER visit_schedules_audit_trail_trg
  AFTER INSERT OR UPDATE OR DELETE ON visit_schedules
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER visit_schedules_no_delete_trg
  BEFORE DELETE ON visit_schedules
  FOR EACH ROW EXECUTE FUNCTION forbid_delete_with_hint('A planned visit stays on record.');

-- ---------------------------------------------------------------------------
-- 4. Courses for health workers (screens: FB-8). Switched off, never deleted.
-- ---------------------------------------------------------------------------
CREATE TABLE courses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),         -- D-011
  title         TEXT NOT NULL UNIQUE CHECK (length(trim(title)) > 0),
  lesson_count  INTEGER NOT NULL CHECK (lesson_count > 0),
  pass_mark     INTEGER NOT NULL CHECK (pass_mark BETWEEN 1 AND 100),
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL,
  created_by    UUID NOT NULL REFERENCES practitioners(id),
  updated_at    TIMESTAMPTZ NOT NULL,
  updated_by    UUID NOT NULL REFERENCES practitioners(id)
);

CREATE TABLE course_progress (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),      -- D-011
  course_id        UUID NOT NULL REFERENCES courses(id),
  practitioner_id  UUID NOT NULL REFERENCES practitioners(id),
  lessons_done     INTEGER NOT NULL DEFAULT 0 CHECK (lessons_done >= 0),
  quiz_score       INTEGER CHECK (quiz_score BETWEEN 0 AND 100),
  completed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL,
  created_by       UUID NOT NULL REFERENCES practitioners(id),
  updated_at       TIMESTAMPTZ NOT NULL,
  updated_by       UUID NOT NULL REFERENCES practitioners(id),

  UNIQUE (course_id, practitioner_id),
  CHECK (completed_at IS NULL OR quiz_score IS NOT NULL)            -- finishing means the quiz was taken
);

CREATE TRIGGER courses_audit_trg
  BEFORE INSERT OR UPDATE ON courses
  FOR EACH ROW EXECUTE FUNCTION stamp_audit_columns();
CREATE TRIGGER courses_audit_trail_trg
  AFTER INSERT OR UPDATE OR DELETE ON courses
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER courses_no_delete_trg
  BEFORE DELETE ON courses
  FOR EACH ROW EXECUTE FUNCTION forbid_delete_with_hint('Switch it off instead: set active = false.');

CREATE TRIGGER course_progress_audit_trg
  BEFORE INSERT OR UPDATE ON course_progress
  FOR EACH ROW EXECUTE FUNCTION stamp_audit_columns();
CREATE TRIGGER course_progress_audit_trail_trg
  AFTER INSERT OR UPDATE OR DELETE ON course_progress
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER course_progress_no_delete_trg
  BEFORE DELETE ON course_progress
  FOR EACH ROW EXECUTE FUNCTION forbid_delete_with_hint('Progress and certificates stay on record.');

-- ---------------------------------------------------------------------------
-- 5. Stock at a facility (screens: later). Quantity can't go below zero; every change is in audit_trail.
-- ---------------------------------------------------------------------------
CREATE TABLE stock_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),        -- D-011
  facility_id    UUID NOT NULL REFERENCES facilities(id),
  name           TEXT NOT NULL CHECK (length(trim(name)) > 0),
  unit           TEXT NOT NULL CHECK (length(trim(unit)) > 0),      -- 'tablets', 'sachets'
  quantity       INTEGER NOT NULL CHECK (quantity >= 0),
  reorder_level  INTEGER NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  active         BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL,
  created_by     UUID NOT NULL REFERENCES practitioners(id),
  updated_at     TIMESTAMPTZ NOT NULL,
  updated_by     UUID NOT NULL REFERENCES practitioners(id),

  UNIQUE (facility_id, name)
);

CREATE TRIGGER stock_items_audit_trg
  BEFORE INSERT OR UPDATE ON stock_items
  FOR EACH ROW EXECUTE FUNCTION stamp_audit_columns();
CREATE TRIGGER stock_items_audit_trail_trg
  AFTER INSERT OR UPDATE OR DELETE ON stock_items
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER stock_items_no_delete_trg
  BEFORE DELETE ON stock_items
  FOR EACH ROW EXECUTE FUNCTION forbid_delete_with_hint('Switch it off instead: set active = false.');

COMMIT;
