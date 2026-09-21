import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { describe, expect, it } from "vitest";
import * as schema from "@/drizzle/schema";
import type { Database } from "@/lib/db";
import { recordAiUsage } from "@/services/ai/usage";

describe("AI usage model migration", () => {
  it("recovers retained models, preserves purged-detail totals and does not resurrect expired scope buckets", async () => {
    const client = createClient({ url: ":memory:" });
    try {
      const dir = join(__dirname, "../../drizzle/migrations");
      const apply = async (file: string) => {
        for (const statement of readFileSync(join(dir, file), "utf8").split("--> statement-breakpoint")) {
          if (statement.trim()) await client.execute(statement);
        }
      };
      for (const file of readdirSync(dir).filter((file) => file.endsWith(".sql") && file < "0031").sort()) await apply(file);
      const day = new Date().toISOString().slice(0, 10);
      const now = `${day}T12:00:00.000Z`;
      // Three old calls, only two detail events remain. No product daily bucket.
      for (const [dimension, tenantId] of [["system", null], ["tenant", "tenant"]] as const) {
        await client.execute({
          sql: "INSERT INTO ai_usage_daily (id,bucket_key,day,dimension,tenant_id,credential_id,task_type,prompt_tokens,completion_tokens,total_tokens,request_count,updated_at) VALUES (?,?,?,?,?,'key','agent',30,15,45,3,?)",
          args: [dimension, `${day}|${dimension}|${tenantId ?? ""}||key|agent`, day, dimension, tenantId, now],
        });
      }
      for (const [id, model, provider] of [["a", 'custom|"model"', "openai"], ["b", "model-b", "openrouter"]]) {
        await client.execute({
          sql: "INSERT INTO ai_usage_events (id,credential_id,task_type,tenant_id,product_id,model,provider,prompt_tokens,completion_tokens,total_tokens,created_at) VALUES (?,'key','agent','tenant','product',?,?,10,5,15,?)",
          args: [id, model, provider, now],
        });
      }
      // Complete retained history should remove its empty legacy bucket.
      await client.execute({ sql: "INSERT INTO ai_usage_daily (id,bucket_key,day,dimension,credential_id,task_type,prompt_tokens,completion_tokens,total_tokens,request_count,updated_at) VALUES ('complete',? ,?,'system','other','agent',0,0,0,1,?)", args: [`${day}|system|||other|agent`, day, now] });
      await client.execute({ sql: "INSERT INTO ai_usage_events (id,credential_id,task_type,model,provider,created_at) VALUES ('zero','other','agent','model-zero','openai',?)", args: [now] });
      await apply("0031_ai_usage_models.sql");
      const rows = (await client.execute("SELECT * FROM ai_usage_daily")).rows;
      expect(rows).toHaveLength(7);
      expect(rows.filter((row) => row.dimension === "product")).toHaveLength(0);
      for (const dimension of ["system", "tenant"]) {
        const scoped = rows.filter((row) => row.dimension === dimension && row.credential_id === "key");
        expect(scoped).toHaveLength(3);
        expect(scoped.reduce((sum, row) => sum + Number(row.total_tokens), 0)).toBe(45);
        expect(scoped.find((row) => row.model === null)).toMatchObject({ request_count: 1, prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 });
        expect(scoped.find((row) => row.model === "model-b")).toMatchObject({ provider: "openrouter", total_tokens: 15 });
      }
      expect(rows.find((row) => row.credential_id === "other")).toMatchObject({ model: "model-zero", request_count: 1, total_tokens: 0 });
      // Runtime writes must hit the migrated bucket, including escaped model IDs.
      const db = drizzle(client, { schema }) as unknown as Database;
      await recordAiUsage(db, { credentialId: "key", taskType: "agent", provider: "openai", model: 'custom|"model"', promptTokens: 2, completionTokens: 1, totalTokens: 3, success: true });
      const merged = (await client.execute("SELECT * FROM ai_usage_daily WHERE dimension = 'system' AND model LIKE 'custom%'")).rows;
      expect(merged).toHaveLength(1);
      expect(merged[0]).toMatchObject({ request_count: 2, total_tokens: 18 });
    } finally {
      client.close();
    }
  });
});
