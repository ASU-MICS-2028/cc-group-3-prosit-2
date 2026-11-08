-- =============================================================================
-- HealthConnect Ghana — db/seed/surveillance_synthetic.sql
-- SYNTHETIC weekly case counts for the surveillance dashboard (FB-7a, D-034).
-- Demo data, not schema: it is NOT a migration and db/migrate.sh doesn't run it.
--
-- Run after the migrations, on a local or demo database:
--   psql -v ON_ERROR_STOP=1 -f db/seed/surveillance_synthetic.sql
-- Safe to run twice: rows that already exist are skipped.
--
-- WHERE THE NUMBERS COME FROM
-- Real input: published regional percentages from the Ghana 2022 Demographic
-- and Health Survey (GH2022DHS), via the DHS Program API, preferred values,
-- fetched 2026-11-08:
--   CH_DIAR_C_DIA  children under 5 with diarrhoea in the 2 weeks before the survey (%)
--   ML_PMAL_C_RDT  malaria prevalence in children 6-59 months, by rapid test (%)
--   https://api.dhsprogram.com/rest/dhs/data?countryIds=GH&surveyIds=GH2022DHS&indicatorIds=CH_DIAR_C_DIA,ML_PMAL_C_RDT&breakdown=subnational
--   Source: ICF, The DHS Program STATcompiler / API. Regional figures only; no
--   individual-level DHS data is used (DHS terms of use, D-034).
-- Made-up output: weekly counts per district = the region's percentage x a
-- fixed scale, +/- up to 20% steady "noise". So regions with more malaria in
-- the survey show more malaria here, but THE COUNTS ARE NOT REAL. Every row is
-- source = 'synthetic', and the dashboard must say so.
-- One planted demo scenario: cholera in Ga East jumps to 12 in the last week,
-- so the outbreak rule fires. The DHS doesn't measure cholera; it's invented.
-- =============================================================================

BEGIN;

SET LOCAL app.user_id = '00000000-0000-0000-0000-000000000000';   -- the system account (D-015)

WITH regions (region, district, diarrhoea_pct, malaria_pct) AS (
  VALUES
  -- region          one district (the regional capital's)   DHS 2022: diarrhoea %, malaria %
  ('Western',        'Sekondi-Takoradi',     4.9, 22.5),
  ('Western North',  'Sefwi Wiawso',        11.9, 11.4),
  ('Central',        'Cape Coast',          15.3, 16.1),
  ('Greater Accra',  'Ga East',              7.0,  3.4),
  ('Greater Accra',  'Ga West',              7.0,  3.4),
  ('Greater Accra',  'Adenta',               7.0,  3.4),
  ('Greater Accra',  'Shai-Osudoku',         7.0,  3.4),
  ('Volta',          'Ho Municipal',         9.1, 11.5),
  ('Oti',            'Krachi East',         14.4, 22.6),
  ('Eastern',        'New Juaben South',     9.2, 14.8),
  ('Ashanti',        'Kumasi',              16.0, 11.1),
  ('Ahafo',          'Asunafo North',        9.6, 21.4),
  ('Bono',           'Sunyani',              8.1, 15.1),
  ('Bono East',      'Techiman',            15.3, 22.1),
  ('Northern',       'Tamale',              18.8, 18.8),
  ('Savannah',       'West Gonja',          22.0, 26.6),
  ('North East',     'East Mamprusi',       18.0, 26.9),
  ('Upper West',     'Wa Municipal',         6.4, 30.2),
  ('Upper East',     'Bolgatanga',           9.1, 33.6)
),
weeks AS (
  -- 8 Mondays: 14 Sep to 2 Nov 2026
  SELECT generate_series(date '2026-09-14', date '2026-11-02', interval '7 days')::date AS week_start
),
shaped AS (
  SELECT r.region, r.district, w.week_start, c.condition,
         -- percentage x scale x (1 +/- up to 20%), the same every run (hashtext, not random())
         greatest(0, round(c.pct * c.scale
           * (1 + ((abs(hashtext(r.district || c.condition || w.week_start)) % 41) - 20) / 100.0)))::int AS case_count
  FROM regions r
  CROSS JOIN weeks w
  CROSS JOIN LATERAL (VALUES ('diarrhoea', r.diarrhoea_pct, 0.6),
                             ('malaria',   r.malaria_pct,   0.8)) AS c(condition, pct, scale)
)
INSERT INTO weekly_case_counts (week_start, region, district, condition, case_count, source)
SELECT week_start, region, district, condition, case_count, 'synthetic' FROM shaped
ON CONFLICT (district, condition, week_start) DO NOTHING;

-- The planted demo outbreak: cholera in Ga East, usually 2 to 4 a week, then 12.
INSERT INTO weekly_case_counts (week_start, region, district, condition, case_count, source)
SELECT date '2026-09-14' + (i::int - 1) * 7, 'Greater Accra', 'Ga East', 'cholera', n, 'synthetic'
FROM unnest(ARRAY[2, 3, 2, 4, 3, 2, 3, 12]) WITH ORDINALITY AS t(n, i)
ON CONFLICT (district, condition, week_start) DO NOTHING;

COMMIT;
