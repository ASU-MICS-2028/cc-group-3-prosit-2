-- =============================================================================
-- HealthConnect Ghana — 003_audit_trail.sql
-- Full change history for every table.                                (D-015)
--
--   access_log   = who LOOKED at what   (reads; written by the API, Lab 6 Part D)
--   audit_trail  = who CHANGED what     (writes; written by the database itself)
--
-- Every INSERT, UPDATE and DELETE on an audited table adds one row here,
-- automatically, whichever route made the change (API, psql, script).
--
-- Middle-ground redaction (agreed 20 Oct 2026):
--   * clinical fields  → old and new VALUES are stored
--   * identity fields  → only the field NAME is stored; values are replaced by
--                         "[redacted]" so the trail is not a second copy of
--                         patients' identifying details (Act 843 minimisation)
-- Identity fields are passed per table as trigger arguments below.
-- =============================================================================

BEGIN;

CREATE TABLE audit_trail (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,  -- server-only rows; gives a strict order
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  table_name      TEXT NOT NULL,
  row_id          UUID NOT NULL,
  patient_id      UUID,                 -- whose record this touched, for "show me everything done to Ama"
  action          TEXT NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
  changed_fields  TEXT[] NOT NULL,
  old_values      JSONB,                -- NULL on insert; identity fields redacted
  new_values      JSONB,                -- NULL on delete; identity fields redacted
  actor           UUID NOT NULL,        -- app.user_id (no FK: the trail must outlive anything it describes)
  db_role         TEXT NOT NULL DEFAULT session_user,  -- the database login: exposes direct psql use
  transaction_id  BIGINT NOT NULL DEFAULT txid_current()  -- groups changes made together
);

CREATE INDEX audit_trail_patient_idx ON audit_trail (patient_id, occurred_at DESC);
CREATE INDEX audit_trail_row_idx     ON audit_trail (table_name, row_id, occurred_at DESC);
CREATE INDEX audit_trail_actor_idx   ON audit_trail (actor, occurred_at DESC);

-- -----------------------------------------------------------------------------
-- The trigger function.
-- SECURITY DEFINER: runs with the migration owner's rights, so the app's
-- database role never needs (and should never get) direct INSERT on
-- audit_trail. It cannot write fake history, only cause real history.
-- -----------------------------------------------------------------------------
CREATE FUNCTION audit_row_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  old_row    JSONB := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END;
  new_row    JSONB := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END;
  subject    JSONB := COALESCE(new_row, old_row);
  -- Bookkeeping columns: already captured by occurred_at / actor; diffing them is noise.
  ignored    TEXT[] := ARRAY['created_at', 'created_by', 'updated_at', 'updated_by'];
  redacted   TEXT[] := COALESCE(TG_ARGV, '{}');   -- identity fields for this table (NULL when none given)
  changed    TEXT[];
  old_out    JSONB;
  new_out    JSONB;
  k          TEXT;
BEGIN
  -- Which fields changed? (On insert: every field that was given a value.
  -- On delete: every field that had one.)
  SELECT COALESCE(array_agg(key ORDER BY key), '{}')
    INTO changed
    FROM jsonb_object_keys(subject) AS key
   WHERE key <> ALL (ignored)
     AND (old_row -> key) IS DISTINCT FROM (new_row -> key)
     AND NOT (TG_OP = 'INSERT' AND new_row -> key = 'null'::jsonb)
     AND NOT (TG_OP = 'DELETE' AND old_row -> key = 'null'::jsonb);

  -- An update that changed nothing meaningful is not history.
  IF TG_OP = 'UPDATE' AND cardinality(changed) = 0 THEN
    RETURN NULL;
  END IF;

  -- Keep only the changed fields, then mask identity fields.
  SELECT jsonb_object_agg(key, old_row -> key) INTO old_out FROM unnest(changed) AS key WHERE old_row IS NOT NULL;
  SELECT jsonb_object_agg(key, new_row -> key) INTO new_out FROM unnest(changed) AS key WHERE new_row IS NOT NULL;

  FOREACH k IN ARRAY redacted LOOP
    IF old_out ? k THEN old_out := jsonb_set(old_out, ARRAY[k], '"[redacted]"'); END IF;
    IF new_out ? k THEN new_out := jsonb_set(new_out, ARRAY[k], '"[redacted]"'); END IF;
  END LOOP;

  INSERT INTO audit_trail (table_name, row_id, patient_id, action, changed_fields,
                           old_values, new_values, actor)
  VALUES (
    TG_TABLE_NAME,
    (subject ->> 'id')::uuid,
    CASE WHEN TG_TABLE_NAME = 'patients' THEN (subject ->> 'id')::uuid
         ELSE (subject ->> 'patient_id')::uuid END,
    lower(TG_OP),
    changed,
    old_out,
    new_out,
    current_actor()            -- from 001: refuses the write if no acting user is set
  );

  RETURN NULL;                 -- AFTER trigger: return value is ignored
END;
$$;

-- -----------------------------------------------------------------------------
-- Attach to every table. Arguments = identity fields whose values are masked.
-- -----------------------------------------------------------------------------
CREATE TRIGGER patients_audit_trail_trg
  AFTER INSERT OR UPDATE OR DELETE ON patients
  FOR EACH ROW EXECUTE FUNCTION audit_row_change('full_name', 'phone', 'date_of_birth');

CREATE TRIGGER consents_audit_trail_trg
  AFTER INSERT OR UPDATE OR DELETE ON consents
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();

CREATE TRIGGER observations_audit_trail_trg
  AFTER INSERT OR UPDATE OR DELETE ON observations
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();

CREATE TRIGGER appointments_audit_trail_trg
  AFTER INSERT OR UPDATE OR DELETE ON appointments
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();

CREATE TRIGGER practitioners_audit_trail_trg
  AFTER INSERT OR UPDATE OR DELETE ON practitioners
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();

CREATE TRIGGER loinc_codes_audit_trail_trg
  AFTER INSERT OR UPDATE OR DELETE ON loinc_codes
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();

-- -----------------------------------------------------------------------------
-- The trail itself is append-only.
-- -----------------------------------------------------------------------------
CREATE FUNCTION forbid_change_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; % is not allowed.', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER audit_trail_append_only_trg
  BEFORE UPDATE OR DELETE ON audit_trail
  FOR EACH ROW EXECUTE FUNCTION forbid_change_append_only();

CREATE TRIGGER audit_trail_no_truncate_trg
  BEFORE TRUNCATE ON audit_trail
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_truncate();   -- defined in 001

COMMIT;
