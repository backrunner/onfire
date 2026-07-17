import { NextRequest } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { ticketTemplates, ticketTemplateVersions } from "@/drizzle/schema";
import { parseBody, withAuth } from "@/lib/api/handler";
import { badRequest, notFound, ok } from "@/lib/api/response";
import { loadAccessibleTicketType } from "@/app/api/tob/admin/ticket-types/shared";

const schema = z.object({ reason: z.string().trim().min(1).max(1000) });

export const POST = withAuth({ permission: "ticket_template.write" }, async (req: NextRequest, ctx) => {
  const type = await loadAccessibleTicketType(ctx, ctx.params.id);
  const body = await parseBody(req, schema);
  const template = await ctx.db.query.ticketTemplates.findFirst({
    where: eq(ticketTemplates.ticketTypeId, type.id),
  });
  if (!template) throw notFound("Ticket template not found");
  const version = await ctx.db.query.ticketTemplateVersions.findFirst({
    where: and(
      eq(ticketTemplateVersions.id, ctx.params.versionId),
      eq(ticketTemplateVersions.templateId, template.id)
    ),
  });
  if (!version) throw notFound("Template version not found");
  if (version.invalidatedAt) return ok({ invalidated: true });
  if (template.currentVersionId === version.id && !template.archivedAt) {
    throw badRequest("Create another current version or archive the template first");
  }
  const now = new Date().toISOString();
  await ctx.db
    .update(ticketTemplateVersions)
    .set({
      invalidatedAt: now,
      invalidatedBy: ctx.user.id,
      invalidationReason: body.reason,
    })
    .where(eq(ticketTemplateVersions.id, version.id));
  return ok({ invalidated: true });
});

