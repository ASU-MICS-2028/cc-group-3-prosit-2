-- =============================================================================
-- HealthConnect Ghana — 006_auth_sessions.sql
-- Final sprint, task J1 (SVC-1, D-035): real sign-in for the API.
--
--   1. practitioner_credentials: username, password hash, failed-attempt lock
--   2. refresh_tokens: long-lived sign-in, stored only as a hash, used once
--   3. login_events: every sign-in attempt, append-only
--
-- Number 006, not 005: 005 is reserved for E-M part 2. Nothing here depends on it.
-- These tables have no created_by/updated_by columns on purpose: at sign-in
-- nobody is authenticated yet, so there is no acting user to record (D-015).
-- =============================================================================

BEGIN;

CREATE TABLE practitioner_credentials (
  practitioner_id  UUID PRIMARY KEY REFERENCES practitioners(id),
  username         TEXT NOT NULL UNIQUE CHECK (length(username) BETWEEN 1 AND 100),
  password_hash    TEXT NOT NULL,        -- scrypt, never the password itself
  failed_attempts  INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until     TIMESTAMPTZ           -- too many wrong passwords: refused until then
);

CREATE TABLE refresh_tokens (
  token_hash       TEXT PRIMARY KEY,     -- sha256: a database leak doesn't give working tokens
  practitioner_id  UUID NOT NULL REFERENCES practitioners(id),
  expires_at       TIMESTAMPTZ NOT NULL,
  used_at          TIMESTAMPTZ,          -- set when swapped for a new one, or on sign-out
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX refresh_tokens_practitioner_idx ON refresh_tokens (practitioner_id) WHERE used_at IS NULL;

CREATE TABLE login_events (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  practitioner_id  UUID REFERENCES practitioners(id),  -- NULL: the username doesn't exist
  outcome          TEXT NOT NULL CHECK (outcome IN ('success', 'wrong_password', 'unknown_user', 'locked', 'inactive')),
  source_ip        INET,
  occurred_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX login_events_practitioner_idx ON login_events (practitioner_id, occurred_at DESC);

-- Same rule as access_log: history can't be rewritten.
CREATE TRIGGER login_events_append_only_trg
  BEFORE UPDATE OR DELETE ON login_events
  FOR EACH ROW EXECUTE FUNCTION access_log_append_only();

COMMIT;
