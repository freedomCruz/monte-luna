#!/usr/bin/env bash
# ==============================================================================
# deploy/deploy.sh
# Production deployment runner for Monteluna eCommerce.
# Spec: odd/tasks/deploy-v1.md T4, S1, S3.
#
# Canonical deployment flow:
#   1. Preflight: clean git tree, existing tag, HEAD == tag, local CI gates.
#   2. Build: build container images locally for linux/amd64 (API & Caddy).
#   3. Transfer: save images, scp images & compose.yaml to remote staging path.
#   4. Remote session (single ssh -t sudo bash session):
#      - Load images
#      - Pre-deploy pg_dump -Fc backup (if running release exists)
#      - Database migrations (/app/migrate via docker compose run --rm)
#      - Start release containers (docker compose up -d)
#      - Health check: GET https://$SITE_ADDRESS/api/v1/health (60s bound)
#      - On failure: automatic rollback of both images to previous release
#      - On success: record release in current and releases.log
#      - Image retention: keep current & previous, prune older monteluna-* images
#
# Usage:
#   deploy/deploy.sh <ssh-alias> <vX.Y.Z>
# ==============================================================================

set -euo pipefail

# ==============================================================================
# Validation & Helper Functions
# ==============================================================================

validate_deploy_args() {
  if [ "$#" -ne 2 ]; then
    echo "Usage: $0 <ssh-alias> <vX.Y.Z>" >&2
    return 1
  fi

  local ssh_alias="$1"
  local tag="$2"

  local alias_regex='^[a-zA-Z0-9][a-zA-Z0-9_.-]*$'
  if [[ ! "$ssh_alias" =~ $alias_regex ]]; then
    echo "Error: Invalid SSH alias '${ssh_alias}'. Must start with an alphanumeric character and contain only [a-zA-Z0-9_.-]." >&2
    return 1
  fi

  local tag_regex='^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$'
  if [[ ! "$tag" =~ $tag_regex ]]; then
    echo "Error: Invalid SemVer tag '${tag}'. Must follow format 'vX.Y.Z' (e.g. v1.0.0 or v1.0.0-rc.1)." >&2
    return 1
  fi

  return 0
}

compute_release_id() {
  local tag="$1"
  local sha="$2"
  local sha7="${sha:0:7}"
  printf "%s-%s" "$tag" "$sha7"
}

validate_git_preflight() {
  local repo_dir="${1:-.}"
  local tag="${2:-}"

  # 1. Clean working tree check
  local status_output
  # Fail closed: a repository git cannot read must never count as clean.
  if ! status_output="$(git -C "$repo_dir" status --porcelain 2>/dev/null)"; then
    echo "Error: Cannot read git status in '${repo_dir}'. Run the deploy from the repository." >&2
    return 1
  fi
  if [ -n "$status_output" ]; then
    echo "Error: Working tree is dirty. Commit, stash, or clean changes before deploying." >&2
    return 1
  fi

  # 2. Tag exists check
  local tag_commit
  tag_commit="$(git -C "$repo_dir" rev-parse -q --verify "refs/tags/${tag}^{commit}" 2>/dev/null || true)"
  if [ -z "$tag_commit" ]; then
    echo "Error: Tag '${tag}' does not exist in the repository." >&2
    return 1
  fi

  # 3. HEAD equals tag commit check
  local head_commit
  head_commit="$(git -C "$repo_dir" rev-parse -q --verify HEAD 2>/dev/null || true)"
  if [ "$head_commit" != "$tag_commit" ]; then
    echo "Error: HEAD (${head_commit:0:7}) does not point to tag '${tag}' (${tag_commit:0:7}). Checkout the tag before deploying." >&2
    return 1
  fi

  return 0
}

run_local_ci_gates() {
  local repo_dir="$1"

  if [ "${SKIP_LOCAL_CI:-0}" = "1" ]; then
    echo "Warning: SKIP_LOCAL_CI=1 set. Skipping local verification gates."
    return 0
  fi

  echo "==> Running local verification gates..."
  if command -v task >/dev/null 2>&1 && [ -f "${repo_dir}/Taskfile.yml" ]; then
    (cd "$repo_dir" && task verify)
  else
    echo "Running backend verification..."
    (cd "${repo_dir}/backend" && go mod verify && go build -mod=readonly ./... && go vet ./... && go test -mod=readonly ./... && go tool govulncheck ./...)
    echo "Running frontend verification..."
    (cd "${repo_dir}/frontend" && npm run build && npm run test)
  fi
  echo "Local verification gates passed."
}

build_and_package_images() {
  local repo_root="$1"
  local release_id="$2"
  local output_tar_gz="$3"

  local catalog_api_url="${CATALOG_API_URL:-}"

  echo "==> Building monteluna-api:${release_id}..."
  docker build --platform linux/amd64 \
    -t "monteluna-api:${release_id}" \
    "${repo_root}/backend"

  echo "==> Building monteluna-caddy:${release_id}..."
  docker build --platform linux/amd64 \
    -f "${repo_root}/deploy/caddy/Dockerfile" \
    --build-arg CATALOG_API_URL="${catalog_api_url}" \
    -t "monteluna-caddy:${release_id}" \
    "${repo_root}"

  echo "==> Packaging images into ${output_tar_gz}..."
  docker save "monteluna-api:${release_id}" "monteluna-caddy:${release_id}" | gzip > "$output_tar_gz"
  echo "Images packaged successfully."
}

generate_remote_script() {
  local release_id="$1"
  local commit_sha="$2"
  local staging_dir="$3"

  cat <<EOF
#!/usr/bin/env bash
# Remote deployment execution script for release: ${release_id}
set -euo pipefail

MONTELUNA_RELEASE="${release_id}"
COMMIT_SHA="${commit_sha}"
STAGING_DIR="${staging_dir}"
ENV_FILE="/srv/monteluna/.env"
RELEASES_DIR="/srv/monteluna/releases"
CURRENT_FILE="/srv/monteluna/current"
PREVIOUS_FILE="/srv/monteluna/previous"
RELEASES_LOG="/srv/monteluna/releases.log"
BACKUPS_PREDEPLOY_DIR="/srv/monteluna/backups/predeploy"
BACKUPS_DAILY_DIR="/srv/monteluna/backups/daily"

echo "================================================================================"
echo " Starting remote deployment: \${MONTELUNA_RELEASE}"
echo " Timestamp: \$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "================================================================================"

# Clean up staging directory on exit
cleanup() {
  rm -rf "\${STAGING_DIR}"
}
trap cleanup EXIT

# ------------------------------------------------------------------------------
# 0. Load container images and setup directories
# ------------------------------------------------------------------------------
echo "==> Step 0: Loading container images from staging..."
if [ ! -f "\${STAGING_DIR}/images.tar.gz" ]; then
  echo "Error: Staged image archive '\${STAGING_DIR}/images.tar.gz' not found." >&2
  exit 1
fi
if [ ! -f "\${STAGING_DIR}/compose.yaml" ]; then
  echo "Error: Staged compose file '\${STAGING_DIR}/compose.yaml' not found." >&2
  exit 1
fi

docker load < "\${STAGING_DIR}/images.tar.gz"
rm -f "\${STAGING_DIR}/images.tar.gz"

mkdir -p "\${RELEASES_DIR}/\${MONTELUNA_RELEASE}"
mkdir -p "\${BACKUPS_PREDEPLOY_DIR}"
mkdir -p "\${BACKUPS_DAILY_DIR}"
cp "\${STAGING_DIR}/compose.yaml" "\${RELEASES_DIR}/\${MONTELUNA_RELEASE}/compose.yaml"

# ------------------------------------------------------------------------------
# Read environment credentials safely (without printing)
# ------------------------------------------------------------------------------
if [ ! -f "\${ENV_FILE}" ]; then
  echo "Error: Environment file \${ENV_FILE} not found." >&2
  exit 1
fi

# shellcheck disable=SC1090
set +x
set -a
. "\${ENV_FILE}"
set +a

if [ -z "\${SITE_ADDRESS:-}" ]; then
  echo "Error: SITE_ADDRESS is missing in \${ENV_FILE}." >&2
  exit 1
fi
if [ -z "\${POSTGRES_USER:-}" ] || [ -z "\${POSTGRES_DB:-}" ]; then
  echo "Error: POSTGRES_USER or POSTGRES_DB is missing in \${ENV_FILE}." >&2
  exit 1
fi

COMPOSE_FILE="\${RELEASES_DIR}/\${MONTELUNA_RELEASE}/compose.yaml"
export MONTELUNA_RELEASE

# Manage previous release tracking before replacing active container
if [ -f "\${CURRENT_FILE}" ] && [ -s "\${CURRENT_FILE}" ]; then
  CURRENT_ACTIVE="\$(cat "\${CURRENT_FILE}")"
  if [ "\${CURRENT_ACTIVE}" != "\${MONTELUNA_RELEASE}" ]; then
    echo "\${CURRENT_ACTIVE}" > "\${PREVIOUS_FILE}"
  fi
fi

# ------------------------------------------------------------------------------
# 1. Pre-deploy database dump
# ------------------------------------------------------------------------------
echo "==> Step 1: Pre-deploy database dump..."
if [ -f "\${CURRENT_FILE}" ] && [ -s "\${CURRENT_FILE}" ]; then
  CURRENT_RUNNING="\$(cat "\${CURRENT_FILE}")"
  echo "Active release '\${CURRENT_RUNNING}' found. Creating pre-deploy database dump..."
  docker compose -p monteluna exec -T postgres pg_dump -U "\${POSTGRES_USER}" -Fc "\${POSTGRES_DB}" > "\${BACKUPS_PREDEPLOY_DIR}/\${MONTELUNA_RELEASE}.dump"
  echo "Pre-deploy dump saved to \${BACKUPS_PREDEPLOY_DIR}/\${MONTELUNA_RELEASE}.dump"
else
  echo "No active release recorded in \${CURRENT_FILE}. Skipping pre-deploy dump (first deploy)."
fi

# ------------------------------------------------------------------------------
# 2. Database migrations (expand -> migrate -> contract)
# ------------------------------------------------------------------------------
echo "==> Step 2: Running database migrations (/app/migrate)..."
docker compose -p monteluna -f "\${COMPOSE_FILE}" run --rm --entrypoint /app/migrate api

# ------------------------------------------------------------------------------
# 3. Start release containers
# ------------------------------------------------------------------------------
echo "==> Step 3: Starting release containers (docker compose up -d)..."
docker compose -p monteluna -f "\${COMPOSE_FILE}" up -d

# ------------------------------------------------------------------------------
# 4. Health check with bounded 60-second retry and automatic rollback on failure
# ------------------------------------------------------------------------------
echo "==> Step 4: Health check on https://\${SITE_ADDRESS}/api/v1/health (up to 60s)..."
HEALTH_URL="https://\${SITE_ADDRESS}/api/v1/health"
HEALTH_RESOLVE="\${SITE_ADDRESS}:443:127.0.0.1"
HEALTH_TIMEOUT=60
HEALTH_INTERVAL=2
HEALTH_ELAPSED=0
HEALTH_OK=0

while [ "\$HEALTH_ELAPSED" -lt "\$HEALTH_TIMEOUT" ]; do
  if curl -fsSL --resolve "\${HEALTH_RESOLVE}" "\${HEALTH_URL}" >/dev/null 2>&1; then
    HEALTH_OK=1
    break
  fi
  sleep "\$HEALTH_INTERVAL"
  HEALTH_ELAPSED=\$((HEALTH_ELAPSED + HEALTH_INTERVAL))
done

if [ "\$HEALTH_OK" -ne 1 ]; then
  echo "ERROR: Health check failed after \${HEALTH_TIMEOUT}s on \${HEALTH_URL}" >&2

  # Check if previous release is available for rollback
  if [ ! -f "\${PREVIOUS_FILE}" ] || [ -z "\$(cat "\${PREVIOUS_FILE}" 2>/dev/null)" ]; then
    echo "ERROR: First deploy failed health check; no previous release to roll back to." >&2
    printf "%s %s %s FAILED_NO_PREVIOUS\n" "\${MONTELUNA_RELEASE}" "\${COMMIT_SHA}" "\$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "\${RELEASES_LOG}"
    exit 1
  fi

  PREV_RELEASE="\$(cat "\${PREVIOUS_FILE}")"
  echo "==> Rollback: Restarting previous release \${PREV_RELEASE} for both images..." >&2
  export MONTELUNA_RELEASE="\${PREV_RELEASE}"
  docker compose -p monteluna -f "\${RELEASES_DIR}/\${PREV_RELEASE}/compose.yaml" up -d
  printf "%s %s %s FAILED_ROLLED_BACK_TO_%s\n" "\${MONTELUNA_RELEASE}" "\${COMMIT_SHA}" "\$(date -u +%Y-%m-%dT%H:%M:%SZ)" "\${PREV_RELEASE}" >> "\${RELEASES_LOG}"
  echo "Rollback to \${PREV_RELEASE} completed." >&2
  exit 1
fi

echo "Health check passed successfully!"

# ------------------------------------------------------------------------------
# 5. Record active release
# ------------------------------------------------------------------------------
echo "==> Step 5: Recording active release..."
echo "\${MONTELUNA_RELEASE}" > "\${CURRENT_FILE}"
printf "%s %s %s SUCCESS\n" "\${MONTELUNA_RELEASE}" "\${COMMIT_SHA}" "\$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "\${RELEASES_LOG}"
echo "Release \${MONTELUNA_RELEASE} successfully recorded in \${CURRENT_FILE} and \${RELEASES_LOG}"

# ------------------------------------------------------------------------------
# 6. Image retention: keep current and previous, prune older monteluna-* images
# ------------------------------------------------------------------------------
echo "==> Step 6: Pruning older images..."
KEEP_CUR="\${MONTELUNA_RELEASE}"
KEEP_PRV=""
if [ -f "\${PREVIOUS_FILE}" ] && [ -s "\${PREVIOUS_FILE}" ]; then
  KEEP_PRV="\$(cat "\${PREVIOUS_FILE}")"
fi

docker images --format '{{.Repository}}:{{.Tag}}' | grep -E '^monteluna-(api|caddy):' | while read -r img; do
  img_tag="\${img#*:}"
  if [ "\$img_tag" != "\$KEEP_CUR" ] && [ -n "\$KEEP_PRV" ] && [ "\$img_tag" != "\$KEEP_PRV" ]; then
    echo "Pruning older image: \$img"
    docker rmi "\$img" 2>/dev/null || true
  elif [ "\$img_tag" != "\$KEEP_CUR" ] && [ -z "\$KEEP_PRV" ]; then
    echo "Pruning older image: \$img"
    docker rmi "\$img" 2>/dev/null || true
  fi
done

echo "================================================================================"
echo " Deployment \${MONTELUNA_RELEASE} complete!"
echo "================================================================================"
EOF
}

execute_remote_deploy() {
  local ssh_alias="$1"
  local remote_script="$2"
  local b64_payload
  b64_payload="$(printf '%s' "$remote_script" | base64 | tr -d '\r\n')"

  # Execute over ssh -t in foreground directly into sudo bash (single sudo password prompt)
  ssh -t "${ssh_alias}" \
    "TMP_SCRIPT=\$(mktemp /tmp/deploy-XXXXXX.sh) && printf '%s' '$b64_payload' | base64 -d > \"\$TMP_SCRIPT\" && chmod 700 \"\$TMP_SCRIPT\" && { sudo bash \"\$TMP_SCRIPT\"; RC=\$?; rm -f \"\$TMP_SCRIPT\"; exit \$RC; }"
}

# ==============================================================================
# Main Orchestration
# ==============================================================================

main() {
  validate_deploy_args "$@"
  local ssh_alias="$1"
  local tag="$2"

  local repo_root
  repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

  echo "==> Starting deployment preflight for ${tag} on ${ssh_alias}..."
  validate_git_preflight "$repo_root" "$tag"

  local commit_sha
  commit_sha="$(git -C "$repo_root" rev-parse HEAD)"
  local release_id
  release_id="$(compute_release_id "$tag" "$commit_sha")"

  echo "Target release: ${release_id} (commit ${commit_sha})"

  run_local_ci_gates "$repo_root"

  local local_images_tar
  local_images_tar="$(mktemp /tmp/monteluna-images-XXXXXX.tar.gz)"
  trap 'rm -f "${local_images_tar}"' EXIT INT TERM HUP

  build_and_package_images "$repo_root" "$release_id" "$local_images_tar"

  echo "==> Uploading artifacts to ${ssh_alias}..."
  local remote_staging_dir="/tmp/monteluna-staging-${release_id}"
  ssh "${ssh_alias}" "rm -rf '${remote_staging_dir}' && mkdir -p '${remote_staging_dir}' && chmod 700 '${remote_staging_dir}'"
  scp "$local_images_tar" "${ssh_alias}:${remote_staging_dir}/images.tar.gz"
  scp "${repo_root}/deploy/compose.yaml" "${ssh_alias}:${remote_staging_dir}/compose.yaml"

  echo "==> Generating remote deployment script..."
  local remote_script
  remote_script="$(generate_remote_script "$release_id" "$commit_sha" "$remote_staging_dir")"

  echo "==> Connecting to ${ssh_alias} to execute release..."
  execute_remote_deploy "$ssh_alias" "$remote_script"

  echo "==> Release ${release_id} deployed and verified successfully!"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
