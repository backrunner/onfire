import { eq } from "drizzle-orm";
import { ticketTemplates } from "@/drizzle/schema";
import { withAuth } from "@/lib/api/handler";
import { badRequest, notFound, ok } from "@/lib/api/response";
import { loadAccessibleTicketType } from "@/app/api/tob/admin/ticket-types/shared";
import { restoreArchivedTemplate } from "@/services/ticket-templates";

export const POST = withAuth({ permission: "ticket_template.write" }, async (_req, ctx) => {
  const type = await loadAccessibleTicketType(ctx, ctx.params.id);
  const template = await ctx.db.query.ticketTemplates.findFirst({
    where: eq(ticketTemplates.ticketTypeId, type.id),
  });
  if (!template) throw notFound("Ticket template not found");
  try {
    const restored = await restoreArchivedTemplate(ctx.db, template, ctx.user.id);
    return ok({ restored: true, ...restored });
  } catch (error) {
    throw badRequest(error instanceof Error ? error.message : "Template restore failed");
  }
});
