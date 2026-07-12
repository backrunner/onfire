import { NextRequest } from "next/server";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { templates, products, type TemplateRow } from "@/drizzle/schema";
import { badRequest, ok } from "@/lib/api/response";
import { withAuth, parseBody, parseQuery } from "@/lib/api/handler";
import { assertProductAccess, productScopeCondition } from "@/lib/api/scope";
import {
  createEmptyFormSchema,
  parseFormSchemaValue,
  validateFormSchema,
} from "@/lib/form-schema";

const listQuerySchema = z.object({
  productId: z.string().optional(),
});

const createTemplateSchema = z.object({
  productId: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  categories: z.array(z.string().trim().min(1).max(200)).max(100).default([]),
  formSchema: z.unknown().default(createEmptyFormSchema()),
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

export const GET = withAuth({ permission: "template.read" }, async (req: NextRequest, ctx) => {
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

export const POST = withAuth({ permission: "template.write" }, async (req: NextRequest, ctx) => {
  const body = await parseBody(req, createTemplateSchema);
  await assertProductAccess(ctx, body.productId);
  const formSchema = parseFormSchemaValue(body.formSchema);
  const schemaErrors = formSchema ? validateFormSchema(formSchema) : [];
  if (!formSchema || schemaErrors.length > 0) {
    throw badRequest("Invalid form schema", schemaErrors);
  }
  const categories = [...new Set(body.categories.map((value) => value.trim()))];

  const id = crypto.randomUUID();

  await ctx.db.insert(templates).values({
    id,
    productId: body.productId,
    title: body.title,
    categories: JSON.stringify(categories),
    formSchema: JSON.stringify(formSchema),
  });

  const created = await ctx.db.query.templates.findFirst({ where: eq(templates.id, id) });
  return ok(created ? serializeTemplate(created) : null, 201);
});
