#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOK_DIR="$REPO_ROOT/.git/hooks"

echo "Installing pre-commit hook..."

cat > "$HOOK_DIR/pre-commit" << 'HOOK'
#!/usr/bin/env bash
set -euo pipefail

echo "==> Running Biome check..."
if ! bun run check; then
    echo ""
    echo "Biome check failed. Run 'bun run check' to fix."
    exit 1
fi

echo "==> Running typecheck..."
for pkg in packages/js-client packages/worker packages/telemetry-app packages/examples/react-app; do
    if [ -f "$pkg/tsconfig.json" ]; then
        echo "  Checking $pkg..."
        if ! ./node_modules/.bin/tsc --noEmit -p "$pkg/tsconfig.json"; then
            echo ""
            echo "Typecheck found errors in $pkg. See logs."
            exit 1
        fi
    fi
done


echo "==> Running cargo fmt --check (all crates)..."
if ! cargo fmt --all -- --check; then
    echo ""
    echo "Formatting errors found. Run 'cargo fmt --all' to fix."
    exit 1
fi

echo "==> Running cargo clippy (all crates)..."
if ! cargo clippy --workspace --all-targets -- -D warnings; then
    echo ""
    echo "Clippy warnings found. Fix them before committing."
    exit 1
fi

echo "==> All checks passed."
HOOK

chmod +x "$HOOK_DIR/pre-commit"
echo "Pre-commit hook installed at $HOOK_DIR/pre-commit"

echo "Installing pre-push hook..."

cat > "$HOOK_DIR/pre-push" << 'HOOK'
#!/usr/bin/env bash
set -euo pipefail

echo "==> Running Rust tests (all crates)..."
if ! cargo test --workspace; then
    echo ""
    echo "Rust tests failed. Must fix before pushing."
    exit 1
fi

echo "==> Running Typescript tests (all crates)..."
if ! bun test; then
    echo ""
    echo "Typescript Tests are failing. Must fix before pushing."
    exit 1
fi

echo "==> All tests passed."
HOOK

chmod +x "$HOOK_DIR/pre-push"
echo "Pre-push hook installed at $HOOK_DIR/pre-push"