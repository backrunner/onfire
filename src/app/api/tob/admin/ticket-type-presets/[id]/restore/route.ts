import { eq } from "drizzle-orm";
import { ticketTypePresets } from "@/drizzle/schema";
import { withAuth } from "@/lib/api/handler";
import { badRequest, ok } from "@/lib/api/response";
import { loadAccessiblePreset } from "../../shared";

export const POST = withAuth({ permission: "ticket_type.preset.write" }, async (_req, ctx) => {
  const preset = await loadAccessiblePreset(ctx, ctx.params.id);
  if (preset.parentId) {
    const parent = await loadAccessiblePreset(ctx, preset.parentId);
    if (parent.archivedAt) throw badRequest("Restore the parent preset first");
  }
  await ctx.db.update(ticketTypePresets).set({ archivedAt: null, archivedBy: null, updatedAt: new Date().toISOString() }).where(eq(ticketTypePresets.id, preset.id));
  return ok({ restored: true });
});
