#!/usr/bin/env bash
set -euo pipefail

# Configuration and defaults
RESTIC_ENV_FILE="${RESTIC_ENV_FILE:-/srv/monteluna/restic.env}"
BACKUP_DIR="${BACKUP_DIR:-/srv/monteluna/backups/daily}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-monteluna}"
POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-monteluna}"
CADDY_VOLUME="${CADDY_VOLUME:-${COMPOSE_PROJECT}_caddy_data}"

check_mode_0600() {
  local target="$1"
  local desc="$2"

  if [[ ! -f "$target" ]]; then
    echo "ERROR: ${desc} does not exist: ${target}" >&2
    exit 1
  fi

  local mode
  mode="$(stat -c '%a' "$target" 2>/dev/null || stat -f '%Lp' "$target" 2>/dev/null)"
  if [[ "$mode" != "600" && "$mode" != "0600" ]]; then
    echo "ERROR: ${desc} ${target} must have mode 0600 (got ${mode})" >&2
    exit 1
  fi
}

# 1. Validate restic.env exists and has mode 0600
check_mode_0600 "$RESTIC_ENV_FILE" "Configuration file"

# Load restic.env safely without tracing or echoing secrets
set +x
set -a
# shellcheck source=/dev/null
. "$RESTIC_ENV_FILE"
set +a

# 2. Validate required restic variables are set
for var in RESTIC_REPOSITORY AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY RESTIC_PASSWORD_FILE; do
  if [[ -z "${!var:-}" ]]; then
    echo "ERROR: Required environment variable ${var} is not set in ${RESTIC_ENV_FILE}" >&2
    exit 1
  fi
done

# 3. Validate password file exists and has mode 0600
check_mode_0600 "$RESTIC_PASSWORD_FILE" "Password file"

# Export variables for restic
export RESTIC_REPOSITORY AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY RESTIC_PASSWORD_FILE

# Read postgres credentials from /srv/monteluna/.env if available and not explicitly overridden
if [[ -f "/srv/monteluna/.env" ]]; then
  if [[ -z "${POSTGRES_USER:-}" || "$POSTGRES_USER" == "postgres" ]]; then
    val="$(grep -E '^POSTGRES_USER=' /srv/monteluna/.env 2>/dev/null | cut -d= -f2- || true)"
    [[ -n "$val" ]] && POSTGRES_USER="$val"
  fi
  if [[ -z "${POSTGRES_DB:-}" || "$POSTGRES_DB" == "monteluna" ]]; then
    val="$(grep -E '^POSTGRES_DB=' /srv/monteluna/.env 2>/dev/null | cut -d= -f2- || true)"
    [[ -n "$val" ]] && POSTGRES_DB="$val"
  fi
fi

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

# 4. Create database dump using pg_dump -Fc through docker compose
TIMESTAMP="$(date -u +%Y%m%d_%H%M%SZ)"
DUMP_FILE="${BACKUP_DIR}/monteluna_${TIMESTAMP}.dump"
echo "Creating PostgreSQL dump: ${DUMP_FILE}..."

docker compose -p "$COMPOSE_PROJECT" exec -T "$POSTGRES_SERVICE" \
  pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB" > "$DUMP_FILE"

if [[ ! -s "$DUMP_FILE" ]]; then
  echo "ERROR: Dump file ${DUMP_FILE} is empty or was not created." >&2
  exit 1
fi
echo "PostgreSQL dump completed successfully."

# 5. Resolve caddy_data volume mountpoint
if [[ -z "${CADDY_DATA_DIR:-}" ]]; then
  CADDY_DATA_DIR="$(docker volume inspect --format '{{ .Mountpoint }}' "$CADDY_VOLUME")"
fi

if [[ -z "$CADDY_DATA_DIR" ]]; then
  echo "ERROR: Unable to resolve caddy_data volume mountpoint for volume ${CADDY_VOLUME}" >&2
  exit 1
fi

# 6. Execute restic backup for both dump directory and caddy_data mountpoint
echo "Starting restic backup for ${BACKUP_DIR} and ${CADDY_DATA_DIR}..."
restic backup "$BACKUP_DIR" "$CADDY_DATA_DIR"

# 7. Run restic forget and prune (7 daily, 4 weekly, 6 monthly)
echo "Applying retention policy with restic forget and prune..."
restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune

# 8. Run restic check
echo "Running restic repository integrity check..."
restic check

# 9. Retain only the last 7 local daily dumps
echo "Pruning local daily dumps in ${BACKUP_DIR} (keeping last 7)..."
mapfile -t dumps < <(find "$BACKUP_DIR" -maxdepth 1 -name "*.dump" -type f | sort)
total="${#dumps[@]}"
if (( total > 7 )); then
  to_remove=$(( total - 7 ))
  for (( i=0; i < to_remove; i++ )); do
    echo "Removing old local dump: ${dumps[i]}"
    rm -f "${dumps[i]}"
  done
fi

echo "Backup and maintenance completed successfully."
