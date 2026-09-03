import { NextRequest } from "next/server";
import { z } from "zod";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import {
  categoryRoutes,
  customers,
  emailConfigs,
  emailTemplates,
  inboundEmails,
  notificationLogs,
  ticketTypes,
  ticketTypeRoutes,
  notificationRequirements,
  notificationRules,
  outboundEmails,
  productDocuments,
  productIdentityConfigs,
  productKeys,
  productKnowledge,
  products,
  productTeams,
  teams,
  templates,
  tickets,
  ticketTemplates,
  ticketTemplateVersions,
  userProducts,
} from "@/drizzle/schema";
import { badRequest, conflict, ok, notFound, forbidden } from "@/lib/api/response";
import { withAuth, parseBody, type AuthedContext } from "@/lib/api/handler";
import { assertProductAccess, assertTeamAccess } from "@/lib/api/scope";
import {
  parseSupportedLanguages,
  removeI18nRecordLanguages,
} from "@/lib/product-language";
import { removeFormSchemaLanguages } from "@/lib/form-schema";
import {
  REMOTE_IDENTITY_SECRET_PURPOSE,
  safeIdentityEndpoint,
} from "@/lib/auth/remote-identity";
import { getEnv } from "@/lib/db";
import { sealSecret } from "@/lib/secret-storage";
import { safeHttpUrl } from "@/lib/external-url";
import { hasConfiguredAITask } from "@/services/ai/config";

const slaMinutes = z.number().int().positive().nullable().optional();
const optionalHttpUrl = z
  .string()
  .url()
  .refine((value) => safeHttpUrl(value) !== null, "Only credential-free HTTP(S) URLs are allowed")
  .nullable()
  .optional();
const optionalIdentityUrl = z
  .string()
  .max(2048)
  .refine((value) => safeIdentityEndpoint(value) !== null, {
    message: "A public HTTPS URL on port 443 is required",
  })
  .nullable()
  .optional();

const updateProductSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  homepageUrl: optionalHttpUrl,
  portalReturnUrl: optionalHttpUrl,
  identityEnabled: z.boolean().optional(),
  identityEndpointUrl: optionalIdentityUrl,
  identityAuthSecret: z.string().min(16).max(2048).optional(),
  slaHighAccept: slaMinutes,
  slaHighReply: slaMinutes,
  slaMediumAccept: slaMinutes,
  slaMediumReply: slaMinutes,
  slaLowAccept: slaMinutes,
  slaLowReply: slaMinutes,
  autoCloseMinutes: z.number().int().positive().nullable().optional(),
  defaultLanguage: z.enum(["en", "zh"]).optional(),
  supportedLanguages: z.array(z.enum(["en", "zh"])).min(1).max(2).optional(),
  teamIds: z.array(z.string()).optional(),
});

async function loadAccessibleProduct(ctx: AuthedContext, id: string) {
  await assertProductAccess(ctx, id);
  const product = await ctx.db.query.products.findFirst({ where: eq(products.id, id) });
  if (!product) throw notFound("Product not found");
  return product;
}

async function isDefaultLanguageLocked(ctx: AuthedContext, productId: string) {
  const authoredType = await ctx.db.query.ticketTypes.findFirst({
    where: and(
      eq(ticketTypes.productId, productId),
      isNull(ticketTypes.systemKey)
    ),
    columns: { id: true },
  });
  return Boolean(authoredType);
}

export const GET = withAuth({ permission: "product.settings" }, async (_req: NextRequest, ctx) => {
  const product = await loadAccessibleProduct(ctx, ctx.params.id);

  const [teamRows, identity, defaultLanguageLocked] = await Promise.all([
    ctx.db
      .select({ teamId: productTeams.teamId })
      .from(productTeams)
      .where(eq(productTeams.productId, product.id)),
    ctx.db.query.productIdentityConfigs.findFirst({
      where: eq(productIdentityConfigs.productId, product.id),
    }),
    isDefaultLanguageLocked(ctx, product.id),
  ]);

  return ok({
    ...product,
    teamIds: teamRows.map((r) => r.teamId),
    identityEnabled: identity?.enabled ?? false,
    identityEndpointUrl: identity?.endpointUrl ?? null,
    identitySecretConfigured: Boolean(identity?.authSecret),
    defaultLanguageLocked,
  });
});

export const PATCH = withAuth({ permission: "product.settings" }, async (req: NextRequest, ctx) => {
  const product = await loadAccessibleProduct(ctx, ctx.params.id);
  const body = await parseBody(req, updateProductSchema);
  const defaultLanguageLocked = await isDefaultLanguageLocked(ctx, product.id);
  const teamIds = body.teamIds
    ? [...new Set(body.teamIds)]
    : undefined;
  const defaultLanguage = body.defaultLanguage ?? product.defaultLanguage;
  const supportedLanguages = body.supportedLanguages
    ? [...new Set(body.supportedLanguages)]
    : undefined;
  const previousSupported = parseSupportedLanguages(product.supportedLanguages);
  const effectiveSupported = supportedLanguages ?? previousSupported;
  if (
    effectiveSupported.length > 0 &&
    !effectiveSupported.includes(defaultLanguage)
  ) {
    throw badRequest("Supported languages must include the default language");
  }
  if (body.defaultLanguage && body.defaultLanguage !== product.defaultLanguage) {
    if (defaultLanguageLocked) {
      throw conflict(
        "Default language cannot be changed after ticket types have been created"
      );
    }
  }
  // Only expanding the language set from single- to multi-language requires a
  // translation AI route; unrelated edits on an already multi-language
  // product must not be blocked by a later credential removal.
  if (
    supportedLanguages !== undefined &&
    supportedLanguages.length > 1 &&
    previousSupported.length <= 1 &&
    !(await hasConfiguredAITask(ctx.db, "translation", {
      tenantId: product.tenantId,
      productId: product.id,
    }))
  ) {
    throw badRequest(
      "Translation AI must be configured before enabling multiple languages"
    );
  }
  // Languages dropped by this request become orphaned i18n companions on
  // existing types and template versions; clean them up below.
  const removedLanguages = supportedLanguages
    ? previousSupported.filter(
        (lang) => !(supportedLanguages as string[]).includes(lang)
      )
    : [];
  const existingIdentity =
    await ctx.db.query.productIdentityConfigs.findFirst({
      where: eq(productIdentityConfigs.productId, product.id),
    });

  if (teamIds && teamIds.length > 0) {
    const accessibleTeams = await Promise.all(
      teamIds.map((teamId) => assertTeamAccess(ctx, teamId))
    );
    if (accessibleTeams.some((team) => team.tenantId !== product.tenantId)) {
      throw forbidden("Cannot associate teams outside your tenant");
    }
  }

  if (teamIds !== undefined) {
    const [productTypeIds, ruleTargets, requirementTargets] = await Promise.all([
      ctx.db
        .select({ id: ticketTypes.id })
        .from(ticketTypes)
        .where(eq(ticketTypes.productId, product.id)),
      ctx.db
        .select({ teamId: notificationRules.recipientTeamId })
        .from(notificationRules)
        .where(eq(notificationRules.productId, product.id)),
      ctx.db
        .select({ teamId: notificationRequirements.scopeTeamId })
        .from(notificationRequirements)
        .where(eq(notificationRequirements.productId, product.id)),
    ]);
    const routes = productTypeIds.length
      ? await ctx.db
          .select({ teamId: ticketTypeRoutes.teamId })
          .from(ticketTypeRoutes)
          .where(
            inArray(
              ticketTypeRoutes.ticketTypeId,
              productTypeIds.map((type) => type.id)
            )
          )
      : [];
    if (routes.some((route) => !teamIds.includes(route.teamId))) {
      throw conflict("Remove or reassign ticket type routes before detaching their teams");
    }
    const notificationTeamIds = [...ruleTargets, ...requirementTargets]
      .map((target) => target.teamId)
      .filter((teamId): teamId is string => Boolean(teamId));
    if (notificationTeamIds.some((teamId) => !teamIds.includes(teamId))) {
      throw conflict(
        "Remove or reassign notification policies before detaching their teams"
      );
    }
  }

  const productFields = {
    ...(body.name !== undefined && { name: body.name }),
    ...(body.homepageUrl !== undefined && { homepageUrl: body.homepageUrl }),
    ...(body.portalReturnUrl !== undefined && {
      portalReturnUrl: body.portalReturnUrl,
    }),
    ...(body.slaHighAccept !== undefined && { slaHighAccept: body.slaHighAccept }),
    ...(body.slaHighReply !== undefined && { slaHighReply: body.slaHighReply }),
    ...(body.slaMediumAccept !== undefined && { slaMediumAccept: body.slaMediumAccept }),
    ...(body.slaMediumReply !== undefined && { slaMediumReply: body.slaMediumReply }),
    ...(body.slaLowAccept !== undefined && { slaLowAccept: body.slaLowAccept }),
    ...(body.slaLowReply !== undefined && { slaLowReply: body.slaLowReply }),
    ...(body.autoCloseMinutes !== undefined && { autoCloseMinutes: body.autoCloseMinutes }),
    ...(body.defaultLanguage !== undefined && { defaultLanguage: body.defaultLanguage }),
    ...(supportedLanguages !== undefined && {
      supportedLanguages: JSON.stringify(supportedLanguages),
    }),
  };

  const statements: BatchItem<"sqlite">[] = [];
  if (Object.keys(productFields).length > 0) {
    statements.push(
      ctx.db.update(products).set(productFields).where(eq(products.id, product.id))
    );
  }
  if (teamIds !== undefined) {
    statements.push(
      ctx.db.delete(productTeams).where(eq(productTeams.productId, product.id))
    );
    if (teamIds.length > 0) {
      statements.push(
        ctx.db
          .insert(productTeams)
          .values(teamIds.map((teamId) => ({ productId: product.id, teamId })))
      );
    }
  }
  if (
    body.identityEnabled !== undefined ||
    body.identityEndpointUrl !== undefined ||
    body.identityAuthSecret !== undefined
  ) {
    const enabled = body.identityEnabled ?? existingIdentity?.enabled ?? false;
    const endpointUrl =
      body.identityEndpointUrl !== undefined
        ? body.identityEndpointUrl
        : existingIdentity?.endpointUrl ?? null;
    const authSecret = body.identityAuthSecret
      ? await sealSecret(
          body.identityAuthSecret,
          getEnv().AUTH_SECRET,
          REMOTE_IDENTITY_SECRET_PURPOSE
        )
      : existingIdentity?.authSecret ?? null;
    if (enabled && (!endpointUrl || !authSecret)) {
      throw badRequest("Enabled remote identity requires an endpoint and secret");
    }
    const now = new Date().toISOString();
    statements.push(
      ctx.db
        .insert(productIdentityConfigs)
        .values({
          productId: product.id,
          enabled,
          endpointUrl,
          authSecret,
          createdAt: existingIdentity?.createdAt ?? now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: productIdentityConfigs.productId,
          set: { enabled, endpointUrl, authSecret, updatedAt: now },
        })
    );
  }
  if (removedLanguages.length > 0) {
    const typeRows = await ctx.db
      .select({
        id: ticketTypes.id,
        nameI18n: ticketTypes.nameI18n,
        descriptionI18n: ticketTypes.descriptionI18n,
      })
      .from(ticketTypes)
      .where(eq(ticketTypes.productId, product.id));
    for (const row of typeRows) {
      const nameI18n = removeI18nRecordLanguages(row.nameI18n, removedLanguages);
      const descriptionI18n = removeI18nRecordLanguages(
        row.descriptionI18n,
        removedLanguages
      );
      if (nameI18n !== row.nameI18n || descriptionI18n !== row.descriptionI18n) {
        statements.push(
          ctx.db
            .update(ticketTypes)
            .set({ nameI18n, descriptionI18n })
            .where(eq(ticketTypes.id, row.id))
        );
      }
    }
    const versionRows = await ctx.db
      .select({
        id: ticketTemplateVersions.id,
        formSchema: ticketTemplateVersions.formSchema,
      })
      .from(ticketTemplateVersions)
      .innerJoin(
        ticketTemplates,
        eq(ticketTemplates.id, ticketTemplateVersions.templateId)
      )
      .innerJoin(ticketTypes, eq(ticketTypes.id, ticketTemplates.ticketTypeId))
      .where(eq(ticketTypes.productId, product.id));
    for (const row of versionRows) {
      try {
        const parsed: unknown = JSON.parse(row.formSchema);
        const cleaned = removeFormSchemaLanguages(parsed, removedLanguages);
        if (JSON.stringify(cleaned) !== JSON.stringify(parsed)) {
          statements.push(
            ctx.db
              .update(ticketTemplateVersions)
              .set({ formSchema: JSON.stringify(cleaned) })
              .where(eq(ticketTemplateVersions.id, row.id))
          );
        }
      } catch {
        // Leave unparseable legacy schemas untouched.
      }
    }
  }
  if (statements.length > 0) {
    await ctx.db.batch(statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
  }

  const updated = await ctx.db.query.products.findFirst({
    where: eq(products.id, product.id),
  });
  const updatedIdentity =
    await ctx.db.query.productIdentityConfigs.findFirst({
      where: eq(productIdentityConfigs.productId, product.id),
    });
  return ok({
    ...updated,
    identityEnabled: updatedIdentity?.enabled ?? false,
    identityEndpointUrl: updatedIdentity?.endpointUrl ?? null,
    identitySecretConfigured: Boolean(updatedIdentity?.authSecret),
    defaultLanguageLocked,
  });
});

export const DELETE = withAuth({ permission: "product.manage" }, async (_req: NextRequest, ctx) => {
  const product = await loadAccessibleProduct(ctx, ctx.params.id);

  const dependencies = await Promise.all([
    ctx.db.query.tickets.findFirst({ where: eq(tickets.productId, product.id) }),
    ctx.db.query.customers.findFirst({ where: eq(customers.productId, product.id) }),
    ctx.db.query.templates.findFirst({ where: eq(templates.productId, product.id) }),
    ctx.db.query.ticketTypes.findFirst({
      where: and(eq(ticketTypes.productId, product.id), isNull(ticketTypes.systemKey)),
    }),
    ctx.db.query.productKeys.findFirst({ where: eq(productKeys.productId, product.id) }),
    ctx.db.query.categoryRoutes.findFirst({ where: eq(categoryRoutes.productId, product.id) }),
    ctx.db.query.emailConfigs.findFirst({ where: eq(emailConfigs.productId, product.id) }),
    ctx.db.query.emailTemplates.findFirst({ where: eq(emailTemplates.productId, product.id) }),
    ctx.db.query.inboundEmails.findFirst({ where: eq(inboundEmails.productId, product.id) }),
    ctx.db.query.outboundEmails.findFirst({ where: eq(outboundEmails.productId, product.id) }),
    ctx.db.query.notificationRules.findFirst({
      where: eq(notificationRules.productId, product.id),
    }),
    ctx.db.query.notificationRequirements.findFirst({
      where: eq(notificationRequirements.productId, product.id),
    }),
    ctx.db.query.notificationLogs.findFirst({
      where: eq(notificationLogs.productId, product.id),
    }),
    ctx.db.query.productKnowledge.findFirst({
      where: eq(productKnowledge.productId, product.id),
    }),
    ctx.db.query.productDocuments.findFirst({
      where: eq(productDocuments.productId, product.id),
    }),
  ]);
  if (dependencies.some(Boolean)) {
    throw conflict("Product still has tickets, customers, configuration, or history records");
  }

  const systemTypes = await ctx.db
    .select({ id: ticketTypes.id })
    .from(ticketTypes)
    .where(eq(ticketTypes.productId, product.id));
  const systemTypeIds = systemTypes.map((type) => type.id);
  await ctx.db.batch([
    ctx.db
      .delete(productIdentityConfigs)
      .where(eq(productIdentityConfigs.productId, product.id)),
    ctx.db.delete(productTeams).where(eq(productTeams.productId, product.id)),
    ctx.db.delete(userProducts).where(eq(userProducts.productId, product.id)),
    ctx.db
      .delete(ticketTypeRoutes)
      .where(inArray(ticketTypeRoutes.ticketTypeId, systemTypeIds.length ? systemTypeIds : ["__none__"])),
    ctx.db.delete(ticketTypes).where(eq(ticketTypes.productId, product.id)),
    ctx.db.delete(products).where(eq(products.id, product.id)),
  ]);

  return ok({ deleted: true });
});
