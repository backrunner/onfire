#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "🔧 Installing dependencies with bun..."
bun install

copy_cfg() {
  local dir="$1"
  if [ -f "$dir/wrangler.toml.example" ]; then
    cp "$dir/wrangler.toml.example" "$dir/wrangler.toml"
    echo "📄 Copied $dir/wrangler.toml.example -> $dir/wrangler.toml (please fill database_id, secrets)."
  fi
}

copy_cfg "workers/toc-worker"
copy_cfg "workers/tob-worker"

cat <<'INFO'
⚡ Init done.
- Update wrangler.toml with real D1 database_id and env vars (AUTH_SECRET, JWT_PUBLIC_KEY/AUDIENCE/ISSUER, TURNSTILE_SECRET).
- Run `bunx wrangler dev` inside each worker to auto-create tables/seed via runtime prepare.
- For production, configure Cloudflare D1 binding name "DB" matching wrangler.toml.
INFO

