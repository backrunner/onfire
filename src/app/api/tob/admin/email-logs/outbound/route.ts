import { NextRequest } from "next/server";
import { z } from "zod";
import { eq, desc, count } from "drizzle-orm";
import { outboundEmails } from "@/drizzle/schema";
import { ok } from "@/lib/api/response";
import { withAuth, parseQuery } from "@/lib/api/handler";
import { assertProductAccess } from "@/lib/api/scope";

const querySchema = z.object({
  productId: z.string().min(1),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const GET = withAuth({ permission: "email.config" }, async (req: NextRequest, ctx) => {
  const query = parseQuery(req, querySchema);
  await assertProductAccess(ctx, query.productId);

  const where = eq(outboundEmails.productId, query.productId);

  const [{ total }] = await ctx.db
    .select({ total: count() })
    .from(outboundEmails)
    .where(where);

  const rows = await ctx.db
    .select({
      id: outboundEmails.id,
      ticketId: outboundEmails.ticketId,
      replyId: outboundEmails.replyId,
      toEmail: outboundEmails.toEmail,
      fromEmail: outboundEmails.fromEmail,
      subject: outboundEmails.subject,
      provider: outboundEmails.provider,
      providerMessageId: outboundEmails.providerMessageId,
      status: outboundEmails.status,
      errorMessage: outboundEmails.errorMessage,
      createdAt: outboundEmails.createdAt,
      sentAt: outboundEmails.sentAt,
    })
    .from(outboundEmails)
    .where(where)
    .orderBy(desc(outboundEmails.createdAt))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);

  return ok({ items: rows, total, page: query.page, pageSize: query.pageSize });
});
