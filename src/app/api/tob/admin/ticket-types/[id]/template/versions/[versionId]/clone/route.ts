import { NextRequest } from "next/server";
import { z } from "zod";
import { parseBody, withAuth } from "@/lib/api/handler";
import { badRequest, conflict, ok } from "@/lib/api/response";
import { loadAccessibleTicketType } from "@/app/api/tob/admin/ticket-types/shared";
import { cloneTemplateVersion } from "@/services/ticket-templates";

const schema = z.object({ changeNote: z.string().trim().max(500).nullable().optional() });

export const POST = withAuth({ permission: "ticket_template.write" }, async (req: NextRequest, ctx) => {
  const type = await loadAccessibleTicketType(ctx, ctx.params.id);
  if (type.archivedAt) throw badRequest("Archived ticket types cannot receive a template version");
  const body = await parseBody(req, schema);
  try {
    return ok(
      await cloneTemplateVersion(ctx.db, ctx.params.versionId, {
        ticketTypeId: type.id,
        changeNote: body.changeNote || `Restored from ${ctx.params.versionId}`,
        actorId: ctx.user.id,
      }),
      201
    );
  } catch (error) {
    if (String(error).toLowerCase().includes("unique")) {
      throw conflict("Another template version was saved concurrently; reload and try again");
    }
    if (
      error instanceof Error &&
      (error.message.includes("archived") || error.message.includes("Invalidated"))
    ) {
      throw badRequest(error.message);
    }
    throw error;
  }
});
