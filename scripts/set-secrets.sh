#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SECRETS_FILE="${1:-$ROOT_DIR/.env.secrets}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

log()  { echo -e "${GREEN}[secrets]${NC} $*"; }
warn() { echo -e "${YELLOW}[secrets]${NC} $*"; }
err()  { echo -e "${RED}[secrets]${NC} $*" >&2; }

usage() {
  cat <<EOF
${BOLD}Usage:${NC} ./scripts/set-secrets.sh [path/to/.env.secrets]

Sets Cloudflare Workers secrets from a .env.secrets file using wrangler secret put.
Defaults to .env.secrets in the project root if no path is given.

The file should contain lines in KEY=value format. Each key is mapped to the
correct Worker project automatically:

  Worker (anon-telemetry-sink):
    BASIC_AUTH              Basic auth credentials (user:password)

  Dashboard (telemetry-dashboard):
    GITHUB_CLIENT_ID        GitHub OAuth app client ID
    GITHUB_CLIENT_SECRET    GitHub OAuth app client secret
    SESSION_SECRET          Random string for JWT session encryption
    ALLOWED_GITHUB_USERNAMES  Comma-separated GitHub usernames (optional)
    TELEMETRY_SINK_URL      URL of the deployed telemetry sink worker
    TELEMETRY_SINK_AUTH     Basic auth credentials matching worker's BASIC_AUTH

Blank lines and lines starting with # are ignored.

Example .env.secrets:
  BASIC_AUTH=admin:s3cret
  GITHUB_CLIENT_ID=Iv1.abc123
  GITHUB_CLIENT_SECRET=deadbeef
  SESSION_SECRET=\$(openssl rand -hex 32)
  TELEMETRY_SINK_URL=https://anon-telemetry-sink.example.workers.dev
  TELEMETRY_SINK_AUTH=admin:s3cret
EOF
  exit 0
}

[[ "${1:-}" == "-h" || "${1:-}" == "--help" ]] && usage

if [[ ! -f "$SECRETS_FILE" ]]; then
  err "Secrets file not found: $SECRETS_FILE"
  echo
  err "Create one based on the example:"
  err "  cp .env.secrets.example .env.secrets"
  err "  # then fill in your values"
  exit 1
fi

# Secrets that belong to the worker project
WORKER_SECRETS=(BASIC_AUTH)

# Secrets that belong to the dashboard project
APP_SECRETS=(
  GITHUB_CLIENT_ID
  GITHUB_CLIENT_SECRET
  SESSION_SECRET
  ALLOWED_GITHUB_USERNAMES
  TELEMETRY_SINK_URL
  TELEMETRY_SINK_AUTH
)

worker_dir="$ROOT_DIR/packages/worker"
app_dir="$ROOT_DIR/packages/telemetry-app"

is_worker_secret() {
  local key="$1"
  for s in "${WORKER_SECRETS[@]}"; do
    [[ "$s" == "$key" ]] && return 0
  done
  return 1
}

is_app_secret() {
  local key="$1"
  for s in "${APP_SECRETS[@]}"; do
    [[ "$s" == "$key" ]] && return 0
  done
  return 1
}

set_count=0
skip_count=0

while IFS= read -r line || [[ -n "$line" ]]; do
  # Skip blank lines and comments
  [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue

  # Parse KEY=value
  key="${line%%=*}"
  value="${line#*=}"

  # Trim whitespace from key
  key="$(echo "$key" | xargs)"

  if is_worker_secret "$key"; then
    log "Setting ${BOLD}$key${NC} on worker (anon-telemetry-sink)..."
    echo "$value" | bunx wrangler secret put "$key" --config "$worker_dir/wrangler.toml"
    ((set_count++))
  elif is_app_secret "$key"; then
    log "Setting ${BOLD}$key${NC} on dashboard (telemetry-dashboard)..."
    echo "$value" | bunx wrangler secret put "$key" --config "$app_dir/wrangler.toml"
    ((set_count++))
  else
    warn "Unknown key '$key' - skipping (not mapped to any project)"
    ((skip_count++))
  fi
done < "$SECRETS_FILE"

echo
log "Done. Set $set_count secret(s), skipped $skip_count."