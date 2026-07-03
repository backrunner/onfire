import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { templates } from "@/drizzle/schema";
import { ok } from "@/lib/api/response";
import { withCustomerAuth } from "@/lib/api/handler";

/**
 * GET /api/toc/templates — ticket templates for the customer's product.
 * The product is taken from the verified token, never from the query, so
 * templates cannot be enumerated across products.
 */
export const GET = withCustomerAuth(async (_req: NextRequest, { db, customer }) => {
  const rows = await db
    .select()
    .from(templates)
    .where(eq(templates.productId, customer.productId));

  const parsed = rows.map((t) => ({
    id: t.id,
    productId: t.productId,
    title: t.title,
    categories: safeParse(t.categories, [] as string[]),
    formSchema: safeParse(t.formSchema, {} as Record<string, unknown>),
  }));

  return ok(parsed);
});

function safeParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
