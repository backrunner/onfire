import { NextRequest } from "next/server";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { templates, products, type TemplateRow } from "@/drizzle/schema";
import { ok } from "@/lib/api/response";
import { withAuth, parseQuery } from "@/lib/api/handler";
import { assertProductAccess, productScopeCondition } from "@/lib/api/scope";

const listQuerySchema = z.object({
  productId: z.string().optional(),
});

const parseJson = (val: string | null | undefined): unknown => {
  if (val === null || val === undefined) return undefined;
  try {
    return JSON.parse(val);
  } catch {
    return val;
  }
};

// categories / formSchema are stored as JSON strings; expand them for clients.
function serializeTemplate(row: TemplateRow) {
  return {
    ...row,
    categories: parseJson(row.categories),
    formSchema: parseJson(row.formSchema),
  };
}

export const GET = withAuth({ permission: "ticket_template.read" }, async (req: NextRequest, ctx) => {
  const { productId } = parseQuery(req, listQuerySchema);

  if (productId) {
    await assertProductAccess(ctx, productId);
    const templateList = await ctx.db
      .select()
      .from(templates)
      .where(eq(templates.productId, productId));
    return ok(templateList.map(serializeTemplate));
  }

  const accessible = await ctx.db
    .select({ id: products.id })
    .from(products)
    .where(productScopeCondition(ctx));
  const productIds = accessible.map((p) => p.id);
  if (productIds.length === 0) return ok([]);

  const templateList = await ctx.db
    .select()
    .from(templates)
    .where(inArray(templates.productId, productIds));
  return ok(templateList.map(serializeTemplate));
});
