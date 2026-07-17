import { NextRequest } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { ticketTypes } from "@/drizzle/schema";
import { withCustomerAuth } from "@/lib/api/handler";
import { notFound, ok } from "@/lib/api/response";
import { loadCurrentTemplateVersion } from "@/services/ticket-types";

export const GET = withCustomerAuth(async (_req: NextRequest, { db, customer, params }) => {
  const type = await db.query.ticketTypes.findFirst({
    where: and(
      eq(ticketTypes.id, params.id),
      eq(ticketTypes.productId, customer.productId),
      isNull(ticketTypes.archivedAt),
      isNull(ticketTypes.systemKey)
    ),
  });
  if (!type) throw notFound("Ticket type not found");
  const current = await loadCurrentTemplateVersion(db, type.id);
  if (!current) throw notFound("No active form is configured for this ticket type");
  return ok({
    ticketTypeId: type.id,
    templateVersionId: current.version.id,
    version: current.version.version,
    formSchema: JSON.parse(current.version.formSchema) as unknown,
  });
});

