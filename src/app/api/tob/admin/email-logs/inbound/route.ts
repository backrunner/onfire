import { NextRequest } from "next/server";
import { z } from "zod";
import { eq, desc, count } from "drizzle-orm";
import { inboundEmails } from "@/drizzle/schema";
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

  const where = eq(inboundEmails.productId, query.productId);

  const [{ total }] = await ctx.db
    .select({ total: count() })
    .from(inboundEmails)
    .where(where);

  const rows = await ctx.db
    .select({
      id: inboundEmails.id,
      messageId: inboundEmails.messageId,
      provider: inboundEmails.provider,
      fromEmail: inboundEmails.fromEmail,
      fromName: inboundEmails.fromName,
      toEmail: inboundEmails.toEmail,
      subject: inboundEmails.subject,
      processingStatus: inboundEmails.processingStatus,
      filterResult: inboundEmails.filterResult,
      filterStage: inboundEmails.filterStage,
      filterProvider: inboundEmails.filterProvider,
      filterVerdict: inboundEmails.filterVerdict,
      filterScore: inboundEmails.filterScore,
      filterReason: inboundEmails.filterReason,
      candidateTicketId: inboundEmails.candidateTicketId,
      ticketId: inboundEmails.ticketId,
      replyId: inboundEmails.replyId,
      errorMessage: inboundEmails.errorMessage,
      spfResult: inboundEmails.spfResult,
      dkimResult: inboundEmails.dkimResult,
      isSpam: inboundEmails.isSpam,
      createdAt: inboundEmails.createdAt,
      processedAt: inboundEmails.processedAt,
      releasedAt: inboundEmails.releasedAt,
      releasedBy: inboundEmails.releasedBy,
      releaseReason: inboundEmails.releaseReason,
      releaseTicketTypeId: inboundEmails.releaseTicketTypeId,
    })
    .from(inboundEmails)
    .where(where)
    .orderBy(desc(inboundEmails.createdAt))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);

  return ok({ items: rows, total, page: query.page, pageSize: query.pageSize });
});
