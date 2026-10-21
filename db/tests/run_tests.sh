#!/usr/bin/env bash
# =============================================================================
# Schema test: builds a throwaway database, applies every migration in order,
# runs verify_schema.sql, and checks every step:
#   * each "SHOULD FAIL" step must raise exactly one ERROR (the guard worked)
#   * each "SHOULD PASS" step must raise none
#
# Needs a LOCAL Postgres 13+ (never RDS: it drops and recreates a database).
# Easiest with Docker:
#   docker run -d --name hc-pg -e POSTGRES_PASSWORD=test -p 5432:5432 postgres:16
#   PGHOST=localhost PGUSER=postgres PGPASSWORD=test db/tests/run_tests.sh
#
# Output (the Lab 6 Part C evidence) is written to
#   evidence/lab6/outputs_C_schema_tests.txt
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/../.."

DB="${TEST_DB:-hc_test}"
OUT="${1:-evidence/lab6/outputs_C_schema_tests.txt}"

case "${PGHOST:-}" in
  *rds.amazonaws.com*) echo "Refusing to run: PGHOST points at RDS. This script drops databases." >&2; exit 1 ;;
esac

psql -X -q -d postgres -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB" >/dev/null

mkdir -p "$(dirname "$OUT")"
{
  echo "# Lab 6 Part C: schema tests (db/tests/run_tests.sh)"
  echo "# Run at: $(date -u '+%Y-%m-%d %H:%M UTC')"
  echo "# Server: $(psql -X -At -d "$DB" -c 'SHOW server_version')"
  echo "# Migrations: $(ls db/migrations/*.sql | xargs -n1 basename | tr '\n' ' ')"
  echo
  cat db/migrations/*.sql db/tests/verify_schema.sql \
    | psql -X -q -v ON_ERROR_STOP=0 -d "$DB" 2>&1
} > "$OUT"

# Walk the output: each step starts with a SHOULD PASS / SHOULD FAIL line.
awk '
  /^SHOULD FAIL/ { if (step) check(); step=$0; expect="fail"; errs=0; next }
  /^SHOULD PASS/ { if (step) check(); step=$0; expect="pass"; errs=0; next }
  /^---/         { if (step) check(); step=""; next }
  /ERROR:/       { if (step) errs++; else { print "UNEXPECTED ERROR (setup): " $0; bad++ } }
  function check() {
    if (expect=="fail" && errs!=1) { print "FAILED (expected 1 error, got " errs "): " step; bad++ }
    if (expect=="pass" && errs!=0) { print "FAILED (expected success): " step; bad++ }
    if (expect=="fail") nf++; else np++
    step=""
  }
  END {
    if (step) check()
    printf "%d deny checks, %d allow checks, %d problems\n", nf, np, bad
    exit bad>0
  }
' "$OUT" | tee -a "$OUT"
