#!/usr/bin/env bash
set -euo pipefail

# Configuration and defaults
BACKUP_DIR="${BACKUP_DIR:-/srv/monteluna/backups/daily}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-monteluna}"
POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
DRILL_DB="${DRILL_DB:-restore_drill}"

# Read postgres user from /srv/monteluna/.env if available and not set
if [[ -f "/srv/monteluna/.env" && "$POSTGRES_USER" == "postgres" ]]; then
  val="$(grep -E '^POSTGRES_USER=' /srv/monteluna/.env 2>/dev/null | cut -d= -f2- || true)"
  [[ -n "$val" ]] && POSTGRES_USER="$val"
fi

# Locate the newest dump file
NEWEST_DUMP="$(find "$BACKUP_DIR" -maxdepth 1 -name "*.dump" -type f 2>/dev/null | sort | tail -n 1 || true)"
if [[ -z "$NEWEST_DUMP" || ! -f "$NEWEST_DUMP" ]]; then
  echo "ERROR: No dump file found in ${BACKUP_DIR}" >&2
  exit 1
fi

echo "Selected newest dump: ${NEWEST_DUMP}"

# Cleanup trap to always drop the temporary drill database
cleanup() {
  local exit_code=$?
  echo "Cleaning up temporary drill database: ${DRILL_DB}..."
  docker compose -p "$COMPOSE_PROJECT" exec -T "$POSTGRES_SERVICE" \
    psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS ${DRILL_DB};" >/dev/null 2>&1 || true
  exit "$exit_code"
}
trap cleanup EXIT INT TERM

# Ensure database does not exist from an interrupted previous run
docker compose -p "$COMPOSE_PROJECT" exec -T "$POSTGRES_SERVICE" \
  psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS ${DRILL_DB};"

# Create temporary drill database
echo "Creating temporary drill database: ${DRILL_DB}..."
docker compose -p "$COMPOSE_PROJECT" exec -T "$POSTGRES_SERVICE" \
  psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE ${DRILL_DB};"

# Restore newest dump with pg_restore --no-owner
echo "Restoring ${NEWEST_DUMP} into ${DRILL_DB}..."
docker compose -p "$COMPOSE_PROJECT" exec -T "$POSTGRES_SERVICE" \
  pg_restore -U "$POSTGRES_USER" -d "$DRILL_DB" --no-owner < "$NEWEST_DUMP"

# Run sanity query on each module's goose_db_version table
MODULES=("catalog" "shipping" "orders" "payments")
for mod in "${MODULES[@]}"; do
  echo "Verifying migration history for module: ${mod}..."
  count="$(docker compose -p "$COMPOSE_PROJECT" exec -T "$POSTGRES_SERVICE" \
    psql -U "$POSTGRES_USER" -d "$DRILL_DB" -t -A -c \
    "SELECT count(*) FROM ${mod}.goose_db_version;")"

  count="$(echo "$count" | tr -d '[:space:]')"

  if [[ -z "$count" || ! "$count" =~ ^[0-9]+$ || "$count" -le 0 ]]; then
    echo "ERROR: Sanity check failed for ${mod}.goose_db_version: unexpected count '${count}'" >&2
    exit 1
  fi
  echo "Module ${mod} has ${count} recorded migrations."
done

echo "Restore drill completed successfully! All module migrations verified."
