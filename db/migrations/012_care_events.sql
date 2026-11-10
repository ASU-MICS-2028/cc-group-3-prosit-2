-- =============================================================================
-- HealthConnect Ghana: 012_care_events.sql
-- FB-5 / SVC-7: one append-only record of what happened to a referral or an
-- emergency: each step of an escalation, and the message that went with it.
--
-- `message` is what would be sent to `notified`. It is only logged: this system
-- sends no SMS, and the app says so wherever a message is shown.
-- `at` is when the step fell due (an escalation by the clock); `recorded_at` is
-- when the row was written. The two differ only when nobody asked for a while.
-- =============================================================================

BEGIN;

SET LOCAL app.user_id = '00000000-0000-0000-0000-000000000000';

CREATE TABLE care_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id   UUID REFERENCES referrals(id),
  emergency_id  UUID REFERENCES emergencies(id),
  kind          TEXT NOT NULL
                CHECK (kind IN ('sent', 'accepted', 'declined', 'completed', 'raised', 'escalated', 'acknowledged', 'resolved', 'cancelled')),
  level         INTEGER,                                 -- escalation level this step reached
  actor         UUID REFERENCES practitioners(id),       -- NULL = done by the clock, not a person
  notified      TEXT,                                    -- names, as they stood at the time
  message       TEXT NOT NULL,
  at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(referral_id, emergency_id) = 1)
);

CREATE INDEX care_events_referral_idx ON care_events (referral_id, at) WHERE referral_id IS NOT NULL;
CREATE INDEX care_events_emergency_idx ON care_events (emergency_id, at) WHERE emergency_id IS NOT NULL;

CREATE TRIGGER care_events_append_only_trg
  BEFORE UPDATE OR DELETE ON care_events
  FOR EACH ROW EXECUTE FUNCTION access_log_append_only();

ALTER TABLE access_log DROP CONSTRAINT access_log_resource_type_check;
ALTER TABLE access_log ADD CONSTRAINT access_log_resource_type_check
  CHECK (resource_type IN ('Patient', 'Observation', 'Consent', 'Appointment', 'Media', 'Prescription', 'Referral', 'Emergency'));

COMMIT;
