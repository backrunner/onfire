import { NextRequest } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { products, ticketTypes } from "@/drizzle/schema";
import { withCustomerAuth } from "@/lib/api/handler";
import { notFound, ok } from "@/lib/api/response";
import { localizeFormSchema, parseFormSchema } from "@/lib/form-schema";
import {
  requestedTocLanguage,
  resolveProductLanguage,
} from "@/lib/product-language";
import { loadCurrentTemplateVersion } from "@/services/ticket-types";

export const GET = withCustomerAuth(async (req: NextRequest, { db, customer, params }) => {
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
  const product = await db.query.products.findFirst({
    where: eq(products.id, customer.productId),
  });
  const lang = resolveProductLanguage(
    product ?? { defaultLanguage: "en", supportedLanguages: null },
    requestedTocLanguage(req),
    req.headers.get("accept-language")
  );
  const formSchema = parseFormSchema(current.version.formSchema);
  return ok({
    ticketTypeId: type.id,
    templateVersionId: current.version.id,
    version: current.version.version,
    formSchema: formSchema
      ? localizeFormSchema(formSchema, lang)
      : (JSON.parse(current.version.formSchema) as unknown),
  });
});

