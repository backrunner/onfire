import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { describe, expect, it } from "vitest";
import { tickets } from "@/drizzle/schema";
import { translationSearchCondition } from "./search";

describe("translationSearchCondition", () => {
  it("searches JSON values without matching language keys", async () => {
    const client = createClient({ url: ":memory:" });
    await client.execute(
      "CREATE TABLE tickets (id TEXT PRIMARY KEY, subject_translations TEXT)"
    );
    await client.execute({
      sql: "INSERT INTO tickets (id, subject_translations) VALUES (?, ?), (?, ?), (?, ?), (?, ?)",
      args: [
        "translated",
        JSON.stringify({ zh: "需要帮助", en: "Need help" }),
        "key-only",
        JSON.stringify({ zh: "其他内容" }),
        "invalid",
        "not-json",
        "empty",
        null,
      ],
    });
    const db = drizzle(client);
    const ids = async (query: string) =>
      (
        await db
          .select({ id: tickets.id })
          .from(tickets)
          .where(translationSearchCondition(tickets.subjectTranslations, query))
      ).map((row) => row.id);

    await expect(ids("zh")).resolves.toEqual([]);
    await expect(ids("需要")).resolves.toEqual(["translated"]);
    await expect(ids("need help")).resolves.toEqual(["translated"]);
  });

  it("searches translated content values the same way as subjects", async () => {
    const client = createClient({ url: ":memory:" });
    await client.execute(
      "CREATE TABLE tickets (id TEXT PRIMARY KEY, content_translations TEXT)"
    );
    await client.execute({
      sql: "INSERT INTO tickets (id, content_translations) VALUES (?, ?), (?, ?), (?, ?)",
      args: [
        "content-translated",
        JSON.stringify({ zh: "无法登录账户" }),
        "content-base-only",
        null,
        "content-invalid",
        "oops",
      ],
    });
    const db = drizzle(client);
    const ids = async (query: string) =>
      (
        await db
          .select({ id: tickets.id })
          .from(tickets)
          .where(translationSearchCondition(tickets.contentTranslations, query))
      ).map((row) => row.id);

    await expect(ids("登录")).resolves.toEqual(["content-translated"]);
    await expect(ids("zh")).resolves.toEqual([]);
    await expect(ids("missing")).resolves.toEqual([]);
  });
});
