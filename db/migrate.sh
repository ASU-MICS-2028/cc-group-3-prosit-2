#!/usr/bin/env bash
# =============================================================================
# Applies the migrations in db/migrations/ that this database hasn't had yet.
#
# The database keeps a logbook, the table schema_migrations: one row per file
# already applied (name, when, by whom, and a sha256 fingerprint of the file).
# Each run:
#   * creates the logbook if it's missing
#   * refuses to run if an applied file was edited since (fingerprint changed):
#     applied migrations are never edited; add a new numbered file instead
#   * applies every file not in the logbook, in order, stopping at the first
#     error, and records each one after it succeeds
#
# Connection comes from the usual Postgres variables (PGHOST, PGPORT,
# PGDATABASE, PGUSER, PGPASSWORD, PGSSLMODE). Works on local Postgres and on
# RDS through the SSM tunnel (infra/README.md "Running database migrations").
#
# Usage, from the repo root:
#   db/migrate.sh                  apply what's missing
#   db/migrate.sh --dry-run        only list what would be applied
#   db/migrate.sh --baseline 003   one-off, for a database that already has
#                                  001..003 but no logbook (our RDS): records
#                                  them as applied WITHOUT running them
#
# Known gap: each migration file has its own BEGIN/COMMIT, so the logbook row
# is written just after the file commits, not in the same transaction. If the
# connection drops in that split second, the change is in but not recorded, and
# the next run fails on "already exists". Fix by hand: check the change is
# there, then INSERT the row into schema_migrations.
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

MODE=apply
BASELINE=""
case "${1:-}" in
  "")         ;;
  --dry-run)  MODE=dry-run ;;
  --baseline) MODE=baseline; BASELINE="${2:-}"
              case "$BASELINE" in
                [0-9][0-9][0-9]) ;;
                *) echo "Usage: db/migrate.sh --baseline NNN   (e.g. 003)" >&2; exit 2 ;;
              esac ;;
  *)          echo "Usage: db/migrate.sh [--dry-run | --baseline NNN]" >&2; exit 2 ;;
esac

psql_q() { psql -X -q -At -v ON_ERROR_STOP=1 "$@"; }

# sha256 of a file: sha256sum on Linux (CI), shasum on macOS.
fingerprint() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
  else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

# Adds one row to the logbook. Fed through stdin because psql only fills in
# :'variables' there, not in -c.
record() {
  echo "INSERT INTO schema_migrations (filename, checksum) VALUES (:'name', :'sum');" \
    | psql_q -v name="$1" -v sum="$(fingerprint "$2")" >/dev/null
}

echo "Database: $(psql_q -c "SELECT current_database() || ' on ' || coalesce(inet_server_addr()::text, 'local socket') || ' as ' || current_user")"

# What the logbook already has, as "filename checksum" lines. A dry run never
# changes the database, so it only reads the logbook if it already exists.
if [ "$(psql_q -c "SELECT to_regclass('schema_migrations') IS NOT NULL")" = t ]; then
  RECORDED="$(psql_q -F ' ' -c "SELECT filename, checksum FROM schema_migrations ORDER BY filename")"
elif [ "$MODE" = dry-run ]; then
  RECORDED=""
else
  psql_q -c "CREATE TABLE schema_migrations (
    filename   TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    applied_by TEXT NOT NULL DEFAULT current_user,
    checksum   TEXT NOT NULL
  )" >/dev/null
  RECORDED=""
fi

# 1. Applied files must be unchanged.
if [ -n "$RECORDED" ]; then
  while read -r name sum; do
    file="db/migrations/$name"
    if [ ! -f "$file" ]; then
      echo "Refusing: $name is recorded as applied but the file is gone from db/migrations/." >&2; exit 1
    fi
    if [ "$(fingerprint "$file")" != "$sum" ]; then
      echo "Refusing: $name was edited after it was applied. Undo the edit and put the change in a new numbered migration." >&2
      exit 1
    fi
  done <<EOF
$RECORDED
EOF
fi

is_recorded() { printf '%s\n' "$RECORDED" | cut -d' ' -f1 | grep -qx "$1"; }

# 2. Baseline: record without running.
if [ "$MODE" = baseline ]; then
  if [ -n "$RECORDED" ]; then
    echo "Refusing: schema_migrations already has rows. --baseline is only for a database with no logbook yet." >&2; exit 1
  fi
  # Baseline means "these already ran here". On an empty database that would be
  # a lie, and the next normal run would skip them.
  if [ "$(psql_q -c "SELECT to_regclass('patients') IS NULL")" = t ]; then
    echo "Refusing: this database has no patients table, so 001 never ran here. Run db/migrate.sh without --baseline." >&2; exit 1
  fi
  n=0
  for file in db/migrations/*.sql; do
    name="$(basename "$file")"
    [ "${name%%_*}" \> "$BASELINE" ] && break
    record "$name" "$file"
    echo "recorded (not run): $name"; n=$((n+1))
  done
  echo "Baseline done: $n file(s) recorded up to $BASELINE."
  exit 0
fi

# 3. Apply (or list) what's missing, in order.
n=0
for file in db/migrations/*.sql; do
  name="$(basename "$file")"
  is_recorded "$name" && continue
  if [ "$MODE" = dry-run ]; then echo "would apply: $name"; n=$((n+1)); continue; fi
  echo "applying: $name"
  if ! psql -X -q -v ON_ERROR_STOP=1 -f "$file"; then
    echo "FAILED: $name. Nothing after it was run, and it is not recorded." >&2; exit 1
  fi
  record "$name" "$file"
  n=$((n+1))
done

if [ "$MODE" = dry-run ]; then echo "$n migration(s) would be applied."; else echo "$n migration(s) applied."; fi
