import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/drizzle/schema.ts',
  out: './drizzle/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    // Local wrangler D1 database - created by wrangler dev --persist-to
    url: '.wrangler/state/v3/d1/miniflare-D1DatabaseObject/local.sqlite'
  },
  strict: true,
  verbose: true
});
