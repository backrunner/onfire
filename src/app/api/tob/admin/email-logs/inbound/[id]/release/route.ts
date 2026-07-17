import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { inboundEmails } from "@/drizzle/schema";
import { parseBody, withAuth } from "@/lib/api/handler";
import { badRequest, notFound, ok } from "@/lib/api/response";
import { assertProductAccess } from "@/lib/api/scope";
import { releaseQuarantinedEmail } from "@/services/email/inbound";

const schema = z.object({
  ticketTypeId: z.string().optional(),
  reason: z.string().trim().min(1).max(1000),
});

export const POST = withAuth({ permission: "email.config" }, async (req: NextRequest, ctx) => {
  const row = await ctx.db.query.inboundEmails.findFirst({
    where: eq(inboundEmails.id, ctx.params.id),
  });
  if (!row) throw notFound("Inbound email not found");
  await assertProductAccess(ctx, row.productId);
  const body = await parseBody(req, schema);
  try {
    return ok(
      await releaseQuarantinedEmail(ctx.db, {
        emailId: row.id,
        ticketTypeId: body.ticketTypeId,
        actorId: ctx.user.id,
        reason: body.reason,
      })
    );
  } catch (error) {
    throw badRequest(error instanceof Error ? error.message : "Release failed");
  }
});

