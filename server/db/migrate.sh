#!/bin/sh
set -eu
export LC_ALL=C
# Uses the standard libpq PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD variables.
# Run with the database migration administrator, never a web request.
dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
script=$(mktemp)
trap 'rm -f "$script"' EXIT HUP INT TERM
{
  cat <<'SQL'
BEGIN;
SELECT pg_advisory_xact_lock(810031, 1);
CREATE SCHEMA IF NOT EXISTS bricklab;
REVOKE ALL ON SCHEMA bricklab FROM PUBLIC;
CREATE TABLE IF NOT EXISTS bricklab.schema_migrations (
  version text PRIMARY KEY,
  checksum text NOT NULL CHECK (length(checksum) = 64),
  applied_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON bricklab.schema_migrations FROM PUBLIC;
SQL
  found=0
  for migration in "$dir"/migrations/*.sql; do
    [ -f "$migration" ] || continue
    found=1
    version=$(basename "$migration" .sql)
    # Restrict filename to safe, deterministic identifiers.
    case "$version" in
      [0-9][0-9][0-9]_*) ;;
      *) echo "Invalid migration filename: $version" >&2; exit 1 ;;
    esac
    case "$version" in *[!a-z0-9_]*) echo "Invalid migration filename: $version" >&2; exit 1 ;; esac
    checksum=$(sha256sum "$migration" | cut -d ' ' -f 1)
    printf "SELECT EXISTS (SELECT 1 FROM bricklab.schema_migrations WHERE version = '%s') AS applied, NOT EXISTS (SELECT 1 FROM bricklab.schema_migrations WHERE version = '%s' AND checksum <> '%s') AS matches \\gset\n" "$version" "$version" "$checksum"
    printf '\\if :applied\n\\if :matches\n\\echo Already applied: %s\n\\else\n\\echo Migration checksum mismatch: %s\nSELECT 1 / 0;\n\\endif\n\\else\n\\echo Applying: %s\n' "$version" "$version" "$version"
    cat "$migration"
    printf "\nINSERT INTO bricklab.schema_migrations (version, checksum) VALUES ('%s', '%s');\n" "$version" "$checksum"
    printf '%s\n' '\endif'
  done
  [ "$found" -eq 1 ] || { echo 'No migrations found' >&2; exit 1; }
  printf 'COMMIT;\n'
} > "$script"
# One session, one transaction, and a transaction-level lock serialize all migrations.
psql -X -v ON_ERROR_STOP=1 -f "$script"
