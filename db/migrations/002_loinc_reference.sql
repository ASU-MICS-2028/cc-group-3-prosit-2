-- =============================================================================
-- HealthConnect Ghana — 002_loinc_reference.sql
-- Permitted LOINC codes, UCUM units and plausible ranges.            (DATA-002)
--
-- BEFORE APPLYING: confirm every code and its long name on https://loinc.org/
-- (codes below are the FHIR vital-signs set plus blood glucose).
--
-- min_plausible / max_plausible exist to catch typing errors (368 for 36.8).
-- They are deliberately wide and are NOT clinical thresholds: a reading inside
-- the range can still be dangerous, and that judgement belongs to triage logic.
--
-- Adding a code later = one INSERT by an admin role. No schema change.
-- =============================================================================

BEGIN;

-- Rows written by a migration are attributed to the 'system' account (D-015).
SET LOCAL app.user_id = '00000000-0000-0000-0000-000000000000';

INSERT INTO loinc_codes (code, label, unit, unit_display, category, min_plausible, max_plausible) VALUES
  ('8310-5',  'Body temperature',                     'Cel',     '°C',          'vital-signs', 25,   45),
  ('8480-6',  'Systolic blood pressure',              'mm[Hg]',  'mmHg',        'vital-signs', 40,  300),
  ('8462-4',  'Diastolic blood pressure',             'mm[Hg]',  'mmHg',        'vital-signs', 20,  200),
  ('8867-4',  'Heart rate',                           '/min',    'beats/min',   'vital-signs', 20,  300),
  ('9279-1',  'Respiratory rate',                     '/min',    'breaths/min', 'vital-signs',  4,  100),
  ('59408-5', 'Oxygen saturation by pulse oximetry',  '%',       '%',           'vital-signs', 50,  100),
  ('29463-7', 'Body weight',                          'kg',      'kg',          'vital-signs', 0.3, 350),
  ('8302-2',  'Body height',                          'cm',      'cm',          'vital-signs', 20,  250),
  ('15074-8', 'Blood glucose',                        'mmol/L',  'mmol/L',      'laboratory',   1,   50);
  -- 15074-8 is the mmol/L glucose code, the unit used in Ghanaian clinics.
  -- Blood pressure is two rows sharing observations.group_id (systolic + diastolic).

COMMIT;
