-- =============================================================================
-- HealthConnect Ghana — 005_surveillance.sql
-- Final sprint, task FB-7a (SVC-8): disease surveillance and outbreak alerts.
--
--   1. weekly_case_counts: cases per district, per week, per condition.
--      TOTALS ONLY, no patient ids or names (D-018: public health reporting
--      uses anonymised totals). Rows say whether they're synthetic (D-034).
--   2. outbreak_signals (a view): the outbreak rule, with a plain-words reason.
--   3. outbreak_alerts: a signal a GHS official confirms or dismisses; the
--      community alert goes out (test mode) only once confirmed.
--
-- Number 005: surveillance came before E-M part 2, which moves to 010.
-- The rule's thresholds are illustrative, not signed off by a medical partner.
-- =============================================================================

BEGIN;

SET LOCAL app.user_id = '00000000-0000-0000-0000-000000000000';   -- D-015

-- ---------------------------------------------------------------------------
-- 1. Weekly case counts
-- ---------------------------------------------------------------------------
CREATE TABLE weekly_case_counts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),           -- D-011
  week_start  DATE NOT NULL CHECK (extract(isodow FROM week_start) = 1),  -- a Monday
  region      TEXT NOT NULL,
  district    TEXT NOT NULL,
  condition   TEXT NOT NULL
              CHECK (condition IN ('cholera', 'malaria', 'measles', 'meningitis', 'diarrhoea', 'typhoid')),
  case_count  INTEGER NOT NULL CHECK (case_count >= 0),
  source      TEXT NOT NULL CHECK (source IN ('synthetic', 'reported')),  -- D-034: say what's real
  created_at  TIMESTAMPTZ NOT NULL,
  created_by  UUID NOT NULL REFERENCES practitioners(id),
  updated_at  TIMESTAMPTZ NOT NULL,
  updated_by  UUID NOT NULL REFERENCES practitioners(id),

  UNIQUE (district, condition, week_start)                          -- one total per district, week and condition
);

CREATE TRIGGER weekly_case_counts_audit_trg
  BEFORE INSERT OR UPDATE ON weekly_case_counts
  FOR EACH ROW EXECUTE FUNCTION stamp_audit_columns();
CREATE TRIGGER weekly_case_counts_audit_trail_trg
  AFTER INSERT OR UPDATE OR DELETE ON weekly_case_counts
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();

-- ---------------------------------------------------------------------------
-- 2. The outbreak rule (a saved query, recalculated every time it's read)
-- For each district and condition, compare a week with the average of the
-- 4 weeks before it. A signal needs BOTH:
--   * at least 5 cases (so 1 case after 0 isn't an "outbreak"), and
--   * more than double the usual (the usual is at least 1, to avoid dividing by 0)
-- Weeks with no row count as missing, not as 0: send a 0 row for a quiet week.
-- ---------------------------------------------------------------------------
CREATE VIEW outbreak_signals AS
WITH history AS (
  SELECT w.*,
         avg(case_count) OVER (PARTITION BY district, condition ORDER BY week_start
                               ROWS BETWEEN 4 PRECEDING AND 1 PRECEDING) AS baseline,
         count(*)        OVER (PARTITION BY district, condition ORDER BY week_start
                               ROWS BETWEEN 4 PRECEDING AND 1 PRECEDING) AS weeks_of_history
  FROM weekly_case_counts w
)
SELECT region, district, condition, week_start, case_count,
       round(baseline, 1) AS baseline,
       format('%s cases of %s in %s in the week of %s, against a usual %s a week (%s times higher). Rule: at least 5 cases and more than double the average of the 4 weeks before.',
              case_count, condition, district, to_char(week_start, 'DD Mon YYYY'),
              round(baseline, 1), round(case_count / greatest(baseline, 1), 1)) AS reason,
       bool_or(source = 'synthetic') OVER (PARTITION BY district, condition) AS synthetic
FROM history
WHERE weeks_of_history = 4
  AND case_count >= 5
  AND case_count > 2 * greatest(baseline, 1);

-- ---------------------------------------------------------------------------
-- 3. Outbreak alerts: a person decides
-- ---------------------------------------------------------------------------
CREATE TABLE outbreak_alerts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),         -- D-011
  region         TEXT NOT NULL,
  district       TEXT NOT NULL,
  condition      TEXT NOT NULL,
  week_start     DATE NOT NULL,
  case_count     INTEGER NOT NULL,
  baseline       NUMERIC NOT NULL,
  reason         TEXT NOT NULL,                                      -- copied from outbreak_signals
  status         TEXT NOT NULL DEFAULT 'suggested'
                 CHECK (status IN ('suggested', 'confirmed', 'dismissed')),
  decided_by     UUID REFERENCES practitioners(id),
  decided_at     TIMESTAMPTZ,
  decision_note  TEXT,
  alert_sent_at  TIMESTAMPTZ,                                        -- community alert, test mode
  created_at     TIMESTAMPTZ NOT NULL,
  created_by     UUID NOT NULL REFERENCES practitioners(id),
  updated_at     TIMESTAMPTZ NOT NULL,
  updated_by     UUID NOT NULL REFERENCES practitioners(id),

  UNIQUE (district, condition, week_start),                          -- one alert per signal
  CHECK (status = 'suggested' OR (decided_by IS NOT NULL AND decided_at IS NOT NULL)),
  CHECK (alert_sent_at IS NULL OR status = 'confirmed')              -- no alert for a dismissed outbreak
);

CREATE FUNCTION outbreak_alerts_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  decider_role  TEXT;
BEGIN
  -- Once decided, an alert is closed: no second decision (even the same one), no
  -- new decider or time, and no second community alert.
  IF OLD.status <> 'suggested' THEN
    RAISE EXCEPTION 'This alert was already % and that decision stands.', OLD.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status <> 'suggested' THEN
    SELECT role INTO decider_role FROM practitioners WHERE id = NEW.decided_by;
    -- A public health decision: GHS officials only. Admins can view but not decide.
    IF decider_role IS DISTINCT FROM 'ghs_official' THEN
      RAISE EXCEPTION 'Only a GHS official can confirm or dismiss an outbreak (decided_by is %).',
        coalesce(decider_role, 'not set')
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  -- The evidence the decision was based on can't change afterwards.
  IF (NEW.district, NEW.condition, NEW.week_start, NEW.case_count, NEW.baseline, NEW.reason)
     IS DISTINCT FROM (OLD.district, OLD.condition, OLD.week_start, OLD.case_count, OLD.baseline, OLD.reason) THEN
    RAISE EXCEPTION 'The figures behind an alert cannot be edited.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER outbreak_alerts_guard_trg
  BEFORE UPDATE ON outbreak_alerts
  FOR EACH ROW EXECUTE FUNCTION outbreak_alerts_guard();
CREATE TRIGGER outbreak_alerts_audit_trg
  BEFORE INSERT OR UPDATE ON outbreak_alerts
  FOR EACH ROW EXECUTE FUNCTION stamp_audit_columns();
CREATE TRIGGER outbreak_alerts_audit_trail_trg
  AFTER INSERT OR UPDATE OR DELETE ON outbreak_alerts
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER outbreak_alerts_no_delete_trg
  BEFORE DELETE ON outbreak_alerts
  FOR EACH ROW EXECUTE FUNCTION forbid_delete_with_hint('Dismiss it instead: set status = ''dismissed''.');

COMMIT;
