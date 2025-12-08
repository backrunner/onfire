import { defineConfig } from 'drizzle-kit';

// 默认指向 ToC worker 的 wrangler 配置，可通过环境变量覆盖：
// DRIZZLE_WRANGLER_CONFIG=workers/tob-worker/wrangler.toml
const wranglerConfigPath = process.env.DRIZZLE_WRANGLER_CONFIG ?? 'workers/toc-worker/wrangler.toml';

export default defineConfig({
  schema: './packages/shared/src/drizzle/schema.ts',
  out: './drizzle/migrations',
  driver: 'd1',
  dbCredentials: {
    wranglerConfigPath,
    // 和 wrangler.toml 中的 database_name 对齐
    databaseName: 'onfire-d1'
  },
  strict: true,
  verbose: true
});

