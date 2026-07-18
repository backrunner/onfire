import { eq } from "drizzle-orm";
import { ticketTypePresets } from "@/drizzle/schema";
import type { AuthedContext } from "@/lib/api/handler";
import { assertTenantAccess } from "@/lib/api/scope";
import { notFound } from "@/lib/api/response";

export async function loadAccessiblePreset(ctx: AuthedContext, id: string) {
  const preset = await ctx.db.query.ticketTypePresets.findFirst({
    where: eq(ticketTypePresets.id, id),
  });
  if (!preset) throw notFound("Ticket type preset not found");
  await assertTenantAccess(ctx, preset.tenantId);
  return preset;
}
