import { eq } from "drizzle-orm";
import { ticketTemplates } from "@/drizzle/schema";
import { withAuth } from "@/lib/api/handler";
import { notFound, ok } from "@/lib/api/response";
import { loadAccessibleTicketType } from "@/app/api/tob/admin/ticket-types/shared";
import { listTemplateVersions } from "@/services/ticket-templates";
import { parseFormSchema } from "@/lib/form-schema";

export const GET = withAuth({ permission: "ticket_template.read" }, async (_req, ctx) => {
  const type = await loadAccessibleTicketType(ctx, ctx.params.id);
  const template = await ctx.db.query.ticketTemplates.findFirst({
    where: eq(ticketTemplates.ticketTypeId, type.id),
  });
  if (!template) return ok(null);
  const versions = (await listTemplateVersions(ctx.db, template.id)).map((version) => ({
    ...version,
    formSchema: parseFormSchema(version.formSchema),
  }));
  return ok({ template, versions });
});

export const DELETE = withAuth({ permission: "ticket_template.write" }, async (_req, ctx) => {
  const type = await loadAccessibleTicketType(ctx, ctx.params.id);
  const template = await ctx.db.query.ticketTemplates.findFirst({
    where: eq(ticketTemplates.ticketTypeId, type.id),
  });
  if (!template) throw notFound("Ticket template not found");
  if (template.archivedAt) return ok({ archived: true });
  const now = new Date().toISOString();
  await ctx.db
    .update(ticketTemplates)
    .set({ archivedAt: now, archivedBy: ctx.user.id, updatedAt: now })
    .where(eq(ticketTemplates.id, template.id));
  return ok({ archived: true });
});
