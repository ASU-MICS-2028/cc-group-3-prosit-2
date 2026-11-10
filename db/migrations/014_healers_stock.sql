-- =============================================================================
-- HealthConnect Ghana — 014_healers_stock.sql
-- Final sprint, task FB-9b:
--
--   1. Consent for a healer referral: its own purpose, separate from clinical care
--   2. The healer directory: community and practice on the practitioner (synthetic)
--   3. Referrals to or from a healer need that consent, checked by the database
--   4. Stock moved between facilities (FHIR SupplyDelivery): who, what, from, to
-- =============================================================================

BEGIN;

SET LOCAL app.user_id = '00000000-0000-0000-0000-000000000000';

-- ---------------------------------------------------------------------------
-- 1. Agreeing to clinical care isn't agreeing to have your name and complaint
-- sent to a healer, who is outside the clinical team (Act 843: per purpose).
-- ---------------------------------------------------------------------------
ALTER TABLE consents DROP CONSTRAINT consents_purpose_check;
ALTER TABLE consents ADD CONSTRAINT consents_purpose_check
  CHECK (purpose IN ('clinical_care', 'appointment_reminders', 'health_advisory', 'healer_referral'));

ALTER TABLE access_log DROP CONSTRAINT access_log_resource_type_check;
ALTER TABLE access_log ADD CONSTRAINT access_log_resource_type_check
  CHECK (resource_type IN ('Patient', 'Observation', 'Consent', 'Appointment', 'Media', 'Prescription', 'Referral'));

-- ---------------------------------------------------------------------------
-- 2. Directory columns. Only a healer has them.
-- ---------------------------------------------------------------------------
ALTER TABLE practitioners ADD COLUMN community TEXT;
ALTER TABLE practitioners ADD COLUMN practice TEXT;
ALTER TABLE practitioners ADD CONSTRAINT practitioners_directory_check
  CHECK (role = 'traditional_healer' OR (community IS NULL AND practice IS NULL));

-- What the healer says the patient is using, as told: not reviewed by anyone.
ALTER TABLE referrals ADD COLUMN remedies TEXT;

-- ---------------------------------------------------------------------------
-- 3. Same rules as require_clinical_consent, except when a healer is on either
-- end: then only a healer_referral consent will do.
-- ---------------------------------------------------------------------------
CREATE FUNCTION require_referral_consent() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  c       consents%ROWTYPE;
  needed  TEXT := 'clinical_care';
BEGIN
  IF EXISTS (SELECT 1 FROM practitioners WHERE role = 'traditional_healer' AND id IN (NEW.to_practitioner_id, current_actor())) THEN
    needed := 'healer_referral';
  END IF;
  SELECT * INTO c FROM consents WHERE id = NEW.consent_id;
  IF FOUND AND c.purpose <> needed THEN
    RAISE EXCEPTION 'Consent % covers "%", not "%".', c.id, c.purpose, needed
      USING ERRCODE = 'check_violation', HINT = 'consent_wrong_purpose';
  END IF;
  IF FOUND AND c.withdrawn_at IS NOT NULL THEN
    RAISE EXCEPTION 'Consent % was withdrawn. Obtain new consent first.', c.id
      USING ERRCODE = 'check_violation', HINT = 'consent_withdrawn';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER referrals_consent_trg ON referrals;
CREATE TRIGGER referrals_consent_trg
  BEFORE INSERT ON referrals
  FOR EACH ROW EXECUTE FUNCTION require_referral_consent();

-- ---------------------------------------------------------------------------
-- 4. A transfer is one row, and writing it moves the stock in the same
-- statement, so the record and the levels can't disagree. stock_items' own
-- CHECK (quantity >= 0) refuses a move of more than is there.
-- ---------------------------------------------------------------------------
CREATE TABLE stock_transfers (
  id                UUID PRIMARY KEY,                               -- from the phone, so a retry can't move it twice (D-011)
  from_facility_id  UUID NOT NULL,
  to_facility_id    UUID NOT NULL REFERENCES facilities(id),
  item_name         TEXT NOT NULL,
  unit              TEXT NOT NULL,
  quantity          INTEGER NOT NULL CHECK (quantity > 0),
  created_at        TIMESTAMPTZ NOT NULL,
  created_by        UUID NOT NULL REFERENCES practitioners(id),     -- who moved it
  updated_at        TIMESTAMPTZ NOT NULL,
  updated_by        UUID NOT NULL REFERENCES practitioners(id),

  FOREIGN KEY (from_facility_id, item_name) REFERENCES stock_items (facility_id, name),
  CHECK (from_facility_id <> to_facility_id)
);

CREATE INDEX stock_transfers_from_idx ON stock_transfers (from_facility_id, created_at DESC);
CREATE INDEX stock_transfers_to_idx ON stock_transfers (to_facility_id, created_at DESC);

-- AFTER INSERT: a retried id stopped by ON CONFLICT DO NOTHING never gets here, so stock can't move twice.
CREATE FUNCTION stock_transfers_apply() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO stock_items (facility_id, name, unit, quantity)
    VALUES (NEW.to_facility_id, NEW.item_name, NEW.unit, 0)
    ON CONFLICT (facility_id, name) DO NOTHING;
  -- Lock both rows in id order, so A to B and B to A at the same moment can't deadlock.
  PERFORM 1 FROM stock_items
    WHERE name = NEW.item_name AND facility_id IN (NEW.from_facility_id, NEW.to_facility_id)
    ORDER BY id FOR UPDATE;
  UPDATE stock_items SET quantity = quantity - NEW.quantity
    WHERE facility_id = NEW.from_facility_id AND name = NEW.item_name AND unit = NEW.unit AND active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This item is switched off or counted in different units at the sending facility.' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE stock_items SET quantity = quantity + NEW.quantity
    WHERE facility_id = NEW.to_facility_id AND name = NEW.item_name AND unit = NEW.unit AND active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The receiving facility counts this item in different units, or has switched it off.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE FUNCTION stock_transfers_no_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'A transfer cannot be changed. Move the stock back with a new one.' USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER stock_transfers_no_update_trg
  BEFORE UPDATE ON stock_transfers
  FOR EACH ROW EXECUTE FUNCTION stock_transfers_no_update();
CREATE TRIGGER stock_transfers_apply_trg
  AFTER INSERT ON stock_transfers
  FOR EACH ROW EXECUTE FUNCTION stock_transfers_apply();
CREATE TRIGGER stock_transfers_audit_trg
  BEFORE INSERT OR UPDATE ON stock_transfers
  FOR EACH ROW EXECUTE FUNCTION stamp_audit_columns();
CREATE TRIGGER stock_transfers_audit_trail_trg
  AFTER INSERT OR UPDATE OR DELETE ON stock_transfers
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER stock_transfers_no_delete_trg
  BEFORE DELETE ON stock_transfers
  FOR EACH ROW EXECUTE FUNCTION forbid_delete_with_hint('Move the stock back with a new transfer.');

COMMIT;
