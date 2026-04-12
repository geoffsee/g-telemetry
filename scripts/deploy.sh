#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

log()  { echo -e "${GREEN}[deploy]${NC} $*"; }
warn() { echo -e "${YELLOW}[deploy]${NC} $*"; }
err()  { echo -e "${RED}[deploy]${NC} $*" >&2; }

usage() {
  cat <<EOF
${BOLD}Usage:${NC} ./scripts/deploy.sh [targets...]

Targets:
  app         Deploy the telemetry-app dashboard (Cloudflare Workers via Vike)
  worker      Deploy the telemetry sink worker (Cloudflare Workers)
  js-client   Build and publish @anon-telemetry/client to npm
  rust-client Build and publish anon-telemetry crate to crates.io
  all         Deploy everything (default)

Options:
  --dry-run   Show what would happen without executing
  -h, --help  Show this help message

Examples:
  ./scripts/deploy.sh                    # deploy all
  ./scripts/deploy.sh app worker         # deploy infra only
  ./scripts/deploy.sh js-client          # publish JS client only
  ./scripts/deploy.sh all --dry-run      # preview full deploy
EOF
  exit 0
}

DRY_RUN=false
TARGETS=()

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    -h|--help) usage ;;
    *) TARGETS+=("$arg") ;;
  esac
done

# Default to all if no targets specified
if [[ ${#TARGETS[@]} -eq 0 ]] || [[ " ${TARGETS[*]} " == *" all "* ]]; then
  TARGETS=(worker app js-client rust-client)
fi

run() {
  if $DRY_RUN; then
    echo -e "  ${YELLOW}[dry-run]${NC} $*"
  else
    "$@"
  fi
}

# ---------- Worker ----------
deploy_worker() {
  log "Deploying telemetry sink worker..."
  cd "$ROOT_DIR/packages/worker"
  run "$ROOT_DIR/scripts/wrangler.ts" deploy
  log "Worker deployed."
}

# ---------- Telemetry App ----------
deploy_app() {
  log "Building and deploying telemetry-app..."
  cd "$ROOT_DIR/packages/telemetry-app"
  run bun run build
  run "$ROOT_DIR/scripts/wrangler.ts" deploy
  log "Telemetry app deployed."
}

# ---------- JS Client ----------
publish_js_client() {
  log "Publishing JS client..."
  cd "$ROOT_DIR/packages/js-client"

  # Build
  run bun run build

  # Verify dist output exists
  if ! $DRY_RUN && [[ ! -f dist/index.js ]]; then
    err "Build failed: dist/index.js not found"
    exit 1
  fi

  # Check for npm auth
  if ! $DRY_RUN && ! npm whoami &>/dev/null; then
    err "Not logged in to npm. Run 'npm login' first."
    exit 1
  fi

  run npm publish --access public

  log "JS client published."
}

# ---------- Rust Client ----------
publish_rust_client() {
  log "Publishing Rust client..."
  cd "$ROOT_DIR/packages/rust-client"

  # Verify it compiles
  run cargo build --release

  # Check for crates.io auth
  if ! $DRY_RUN && ! cargo login --help &>/dev/null; then
    err "Cargo not available."
    exit 1
  fi

  run cargo publish

  log "Rust client published."
}

# ---------- Main ----------
log "Starting deploy: ${TARGETS[*]}"
$DRY_RUN && warn "Dry run mode enabled"
echo

for target in "${TARGETS[@]}"; do
  case "$target" in
    worker)      deploy_worker ;;
    app)         deploy_app ;;
    js-client)   publish_js_client ;;
    rust-client) publish_rust_client ;;
    *)
      err "Unknown target: $target"
      usage
      ;;
  esac
  echo
done

log "Done."