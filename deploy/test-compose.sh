#!/usr/bin/env bash
set -euo pipefail

# Test suite for deploy/compose.yaml and deploy/env.example
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/deploy/compose.yaml"
ENV_EXAMPLE="$REPO_ROOT/deploy/env.example"

echo "=== Running deploy/test-compose.sh ==="

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "FAIL: $COMPOSE_FILE does not exist" >&2
  exit 1
fi

if [[ ! -f "$ENV_EXAMPLE" ]]; then
  echo "FAIL: $ENV_EXAMPLE does not exist" >&2
  exit 1
fi

# Create a temporary throwaway env file with safe placeholder values
TMP_ENV=$(mktemp)
cleanup() {
  node -e "try { require('fs').unlinkSync(process.argv[1]); } catch {}" "$TMP_ENV"
}
trap cleanup EXIT

cat <<'EOF' > "$TMP_ENV"
MONTELUNA_RELEASE=v0.0.0-test
POSTGRES_USER=monteluna_test
POSTGRES_PASSWORD=monteluna_test_pw
POSTGRES_DB=monteluna_test
SITE_ADDRESS=localhost
ACME_EMAIL=test@example.com
API_ADDR=:8080
DATABASE_URL=postgres://monteluna_test:monteluna_test_pw@postgres:5432/monteluna_test?sslmode=disable
MEDIA_BASE_URL=https://example.com/media
TRACKING_TOKEN_SECRET=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
ORDER_MAINTENANCE_INTERVAL=1m
WOMPI_PUBLIC_KEY=pub_test_placeholder
WOMPI_PRIVATE_KEY=prv_test_placeholder
WOMPI_INTEGRITY_SECRET=test_integrity_placeholder
WOMPI_EVENTS_SECRET=test_events_placeholder
WOMPI_ENVIRONMENT=sandbox
STOREFRONT_BASE_URL=https://localhost
PAYMENT_WEBHOOK_RETENTION=720h
OUTBOX_POLL_INTERVAL=500ms
OUTBOX_CLEANUP_INTERVAL=1h
OUTBOX_RETENTION=168h
OUTBOX_INITIAL_BACKOFF=1s
OUTBOX_MAX_BACKOFF=1m
OUTBOX_BATCH_SIZE=50
OUTBOX_MAX_ATTEMPTS=5
EOF

# Parse compose file using docker compose config with the throwaway env
CONFIG_JSON=$(docker compose --env-file "$TMP_ENV" -f "$COMPOSE_FILE" config --format json --no-path-resolution --no-env-resolution)

# Run validations with Node.js
node -e '
const fs = require("fs");
const rawJson = process.argv[1];
const composePath = process.argv[2];
const envExamplePath = process.argv[3];

const config = JSON.parse(rawJson);
const rawCompose = fs.readFileSync(composePath, "utf8");
const rawEnvExample = fs.readFileSync(envExamplePath, "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error("ASSERTION FAILED: " + message);
    process.exit(1);
  }
}

// 1. Verify services exist
const services = config.services || {};
assert(services.caddy, "service caddy is missing");
assert(services.api, "service api is missing");
assert(services.postgres, "service postgres is missing");

// 2. Only caddy publishes ports (80, 443, 443/udp); api and postgres publish none
const caddyPorts = services.caddy.ports || [];
const apiPorts = services.api.ports || [];
const postgresPorts = services.postgres.ports || [];

assert(apiPorts.length === 0, "api must not publish ports; found: " + JSON.stringify(apiPorts));
assert(postgresPorts.length === 0, "postgres must not publish ports; found: " + JSON.stringify(postgresPorts));

assert(caddyPorts.length === 3, "caddy must publish exactly 3 port specs; found " + caddyPorts.length);
const portSpecs = caddyPorts.map(p => `${p.published}:${p.target}/${p.protocol || "tcp"}`);
assert(portSpecs.includes("80:80/tcp"), "caddy missing published port 80:80/tcp");
assert(portSpecs.includes("443:443/tcp"), "caddy missing published port 443:443/tcp");
assert(portSpecs.includes("443:443/udp"), "caddy missing published port 443:443/udp");

// 3. db network is internal
const networks = config.networks || {};
assert(networks.db, "network db is missing");
assert(networks.db.internal === true, "network db must have internal: true");

// 4. Memory limits and memswap_limit equal to memory limit
// postgres: 2g = 2147483648 bytes
// api: 512m = 536870912 bytes
// caddy: 256m = 268435456 bytes
const expectedLimits = {
  postgres: "2147483648",
  api: "536870912",
  caddy: "268435456"
};

for (const [svcName, expectedBytes] of Object.entries(expectedLimits)) {
  const svc = services[svcName];
  assert(svc, `service ${svcName} is missing`);
  assert(String(svc.mem_limit) === expectedBytes, `${svcName} mem_limit expected ${expectedBytes}, got ${svc.mem_limit}`);
  assert(String(svc.memswap_limit) === expectedBytes, `${svcName} memswap_limit expected ${expectedBytes}, got ${svc.memswap_limit}`);
}

// 5. Image pinning: every image reference is pinned @sha256: or is monteluna-*:${MONTELUNA_RELEASE}
// Check in the raw compose file
for (const svcName of ["postgres", "api", "caddy"]) {
  const svc = services[svcName];
  if (svcName === "postgres") {
    assert(svc.image.includes("@sha256:"), `postgres image must be pinned by @sha256: digest, got ${svc.image}`);
  } else if (svcName === "api") {
    assert(rawCompose.includes("monteluna-api:${MONTELUNA_RELEASE}") || rawCompose.includes("monteluna-api:$MONTELUNA_RELEASE"), "raw compose must reference monteluna-api:${MONTELUNA_RELEASE}");
  } else if (svcName === "caddy") {
    assert(rawCompose.includes("monteluna-caddy:${MONTELUNA_RELEASE}") || rawCompose.includes("monteluna-caddy:$MONTELUNA_RELEASE"), "raw compose must reference monteluna-caddy:${MONTELUNA_RELEASE}");
  }
}

// 6. env_file is /srv/monteluna/.env for all services
for (const svcName of ["postgres", "api", "caddy"]) {
  const svc = services[svcName];
  assert(Array.isArray(svc.env_file) && svc.env_file.length > 0, `${svcName} must have env_file configured`);
  const hasEnv = svc.env_file.some(e => e.path === "/srv/monteluna/.env");
  assert(hasEnv, `${svcName} env_file must be /srv/monteluna/.env, got: ${JSON.stringify(svc.env_file)}`);
}

// 7. deploy/env.example checks:
// Must contain every variable required by L3 plus contract additions with no non-placeholder values
const requiredVars = [
  "POSTGRES_USER",
  "POSTGRES_PASSWORD",
  "POSTGRES_DB",
  "SITE_ADDRESS",
  "ACME_EMAIL",
  "MONTELUNA_RELEASE",
  "API_ADDR",
  "DATABASE_URL",
  "MEDIA_BASE_URL",
  "TRACKING_TOKEN_SECRET",
  "ORDER_MAINTENANCE_INTERVAL",
  "WOMPI_PUBLIC_KEY",
  "WOMPI_PRIVATE_KEY",
  "WOMPI_INTEGRITY_SECRET",
  "WOMPI_EVENTS_SECRET",
  "WOMPI_ENVIRONMENT",
  "STOREFRONT_BASE_URL",
  "PAYMENT_WEBHOOK_RETENTION",
  "OUTBOX_POLL_INTERVAL",
  "OUTBOX_CLEANUP_INTERVAL",
  "OUTBOX_RETENTION",
  "OUTBOX_INITIAL_BACKOFF",
  "OUTBOX_MAX_BACKOFF",
  "OUTBOX_BATCH_SIZE",
  "OUTBOX_MAX_ATTEMPTS"
];

const envLines = rawEnvExample.split("\n");
const envVars = new Map();
for (const line of envLines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx !== -1) {
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    envVars.set(key, val);
  }
}

for (const req of requiredVars) {
  assert(envVars.has(req), `deploy/env.example is missing required variable: ${req}`);
  const val = envVars.get(req);
  // Ensure no real production secret or live values
  assert(!val.includes("prod_"), `deploy/env.example variable ${req} contains a production-looking secret: ${val}`);
  assert(!val.includes("ghp_"), `deploy/env.example variable ${req} contains a token: ${val}`);
}

console.log("ALL COMPOSE AND ENV ASSERTIONS PASSED");
' "$CONFIG_JSON" "$COMPOSE_FILE" "$ENV_EXAMPLE"

CADDYFILE="$(dirname "$0")/caddy/Caddyfile"
if ! grep -q $'^\troot \* /srv$' "$CADDYFILE"; then
  echo "FAIL: Caddyfile must set 'root * /srv' at site scope so handle_errors finds /404.html" >&2; exit 1
fi
if grep -q 'preload' "$CADDYFILE"; then
  echo "FAIL: HSTS must not commit the domain to the preload list" >&2; exit 1
fi
echo "PASS: deploy/test-compose.sh succeeded"
