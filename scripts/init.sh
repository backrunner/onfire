#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "🔧 Installing dependencies with bun..."
bun install

# Generate a random secret for AUTH_SECRET
generate_secret() {
  openssl rand -base64 32 2>/dev/null || head -c 32 /dev/urandom | base64
}

# Setup .dev.vars at workspace root
setup_dev_vars() {
  local dev_vars="$ROOT_DIR/.dev.vars"

  if [ ! -f "$dev_vars" ]; then
    local secret
    secret=$(generate_secret)
    cat > "$dev_vars" << EOF
# Local development secrets
# Used by wrangler dev for both ToB and ToC workers

# ToB Worker - Better Auth secret
AUTH_SECRET=$secret

# ToC Worker - Turnstile test secret (always passes)
TURNSTILE_SECRET=1x0000000000000000000000000000000AA
EOF
    echo "🔑 Created .dev.vars with auto-generated AUTH_SECRET"
  else
    echo "⏭️  .dev.vars already exists, skipping"
  fi
}

# Create local D1 database directory for drizzle-kit
setup_local_db() {
  local db_dir="$ROOT_DIR/.wrangler/state/v3/d1/miniflare-D1DatabaseObject"

  if [ ! -d "$db_dir" ]; then
    mkdir -p "$db_dir"
    echo "📁 Created local D1 database directory"
  fi
}

setup_dev_vars
setup_local_db

echo "🗄️  Running database migrations..."
bun run db:migrate || echo "⚠️  db:migrate skipped (run 'bun run dev' first to create database, then 'bun run db:migrate')"

cat <<'INFO'
⚡ Init done.
- .dev.vars has been created with development secrets.
- Run `bun run dev` to start the development server.
- Workers: http://localhost:8787/api/tob and http://localhost:8787/api/toc
- For production, configure secrets via `wrangler secret put AUTH_SECRET` etc.
INFO

