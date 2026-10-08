#!/usr/bin/env bash
# Run the SQL behaviour tests against a throwaway LOCAL Postgres — never Supabase.
#
# Connection comes from the standard libpq variables (PGHOST, PGPORT, PGUSER),
# e.g.  PGHOST=localhost PGUSER=postgres scripts/sql-tests/run.sh
#
# Creates and drops a scratch database, focus_sql_test, on that server.
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=focus_sql_test
psql -d postgres -q -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB"
trap 'psql -d postgres -q -c "DROP DATABASE IF EXISTS $DB"' EXIT
run() { psql -d "$DB" -q -v ON_ERROR_STOP=1 "$@"; }
run -f scripts/sql-tests/supabase-stubs.sql
run -f supabase/migrations/036_focus_programmes.sql
run -At -f scripts/sql-tests/036_focus_programmes.test.sql | grep -E 'PASS|FAIL'
