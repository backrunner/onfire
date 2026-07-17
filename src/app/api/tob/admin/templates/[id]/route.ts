import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { templates, type TemplateRow } from "@/drizzle/schema";
import { ok, notFound } from "@/lib/api/response";
import { withAuth, type AuthedContext } from "@/lib/api/handler";
import { assertProductAccess } from "@/lib/api/scope";

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

async function loadAccessibleTemplate(ctx: AuthedContext, id: string) {
  const template = await ctx.db.query.templates.findFirst({
    where: eq(templates.id, id),
  });
  if (!template) throw notFound("Template not found");
  await assertProductAccess(ctx, template.productId);
  return template;
}

export const GET = withAuth({ permission: "ticket_template.read" }, async (_req: NextRequest, ctx) => {
  const template = await loadAccessibleTemplate(ctx, ctx.params.id);
  return ok(serializeTemplate(template));
});
