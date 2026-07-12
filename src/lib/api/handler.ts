import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { getDb, type Database } from "@/lib/db";
import { getAuth } from "@/lib/auth";
import {
  agentTeams,
  customers,
  productTeams,
  products,
  userProducts,
  users,
} from "@/drizzle/schema";
import { hasPermission, Role, type Permission } from "@/lib/types";
import { ApiError, err } from "./response";
import { readBodyBytes } from "@/lib/request-body";
import {
  authenticateCustomer,
  type CustomerTokenPayload,
} from "@/lib/auth/customer";

type RouteParams = Record<string, string>;

interface NextRouteContext {
  params: Promise<RouteParams>;
}

export interface AuthedContext {
  db: Database;
  user: typeof users.$inferSelect;
  role: Role;
  isSuperAdmin: boolean;
  /** Tenants visible to the user. Empty for SuperAdmin = unrestricted. */
  tenantIds: string[];
  teamIds: string[];
  productIds: string[];
  params: RouteParams;
}

export interface CustomerContext {
  db: Database;
  customer: CustomerTokenPayload & {
    email?: string;
    externalId?: string;
    level?: number;
  };
  params: RouteParams;
}

async function resolveAuthedContext(
  db: Database,
  userId: string,
  params: RouteParams
): Promise<AuthedContext | null> {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) return null;

  const role = user.role as Role;
  const isSuper = role === Role.SuperAdmin;

  const teamRows = await db
    .select({ teamId: agentTeams.teamId })
    .from(agentTeams)
    .where(eq(agentTeams.userId, userId));
  const teamIds = teamRows.map((r) => r.teamId);

  let productIds: string[] = [];
  if (role === Role.ProductAdmin) {
    const productRows = await db
      .select({ productId: userProducts.productId })
      .from(userProducts)
      .where(eq(userProducts.userId, userId));
    productIds = productRows.map((row) => row.productId);
  } else if (teamIds.length > 0) {
    const productRows = await db
      .select({ productId: productTeams.productId })
      .from(productTeams)
      .where(inArray(productTeams.teamId, teamIds));
    productIds = [...new Set(productRows.map((r) => r.productId))];
  }

  return {
    db,
    user,
    role,
    isSuperAdmin: isSuper,
    tenantIds: isSuper ? [] : [user.tenantId],
    teamIds,
    productIds,
    params,
  };
}

function toResponse(error: unknown, route: string): NextResponse {
  if (error instanceof ApiError) {
    return err(error.message, error.status, error.details);
  }
  console.error(`API error in ${route}:`, error);
  return err("Internal server error", 500);
}

/**
 * Wrap a ToB route handler with session authentication, role permission
 * check, user context resolution, and uniform error handling.
 *
 * Usage:
 *   export const GET = withAuth({ permission: "ticket.read" }, async (req, ctx) => ok(...));
 */
export function withAuth(
  options: { permission?: Permission },
  handler: (req: NextRequest, ctx: AuthedContext) => Promise<NextResponse>
) {
  return async (
    req: NextRequest,
    route?: NextRouteContext
  ): Promise<NextResponse> => {
    try {
      const auth = getAuth();
      const session = await auth.api.getSession({ headers: req.headers });
      if (!session?.user) return err("Unauthorized", 401);

      const db = getDb();
      const params = route?.params ? await route.params : {};
      const ctx = await resolveAuthedContext(db, session.user.id, params);
      if (!ctx) return err("User profile not found", 404);

      if (options.permission && !hasPermission(ctx.role, options.permission)) {
        return err("Forbidden", 403);
      }

      return await handler(req, ctx);
    } catch (error) {
      return toResponse(error, new URL(req.url).pathname);
    }
  };
}

/**
 * Wrap a ToC route handler with customer JWT authentication.
 */
export function withCustomerAuth(
  handler: (req: NextRequest, ctx: CustomerContext) => Promise<NextResponse>
) {
  return async (
    req: NextRequest,
    route?: NextRouteContext
  ): Promise<NextResponse> => {
    try {
      const token = await authenticateCustomer(req);
      if (!token) return err("Unauthorized", 401);
      const db = getDb();
      const [record, product] = await Promise.all([
        db.query.customers.findFirst({
          where: eq(customers.id, token.sub),
        }),
        db.query.products.findFirst({
          where: eq(products.id, token.productId),
        }),
      ]);
      if (
        !record ||
        !product ||
        record.productId !== token.productId ||
        record.tenantId !== token.tenantId ||
        product.tenantId !== token.tenantId
      ) {
        return err("Unauthorized", 401);
      }
      const customer = {
        ...token,
        email: record.email ?? undefined,
        externalId: record.externalId ?? undefined,
        level: record.level ?? undefined,
      };
      const params = route?.params ? await route.params : {};
      return await handler(req, { db, customer, params });
    } catch (error) {
      return toResponse(error, new URL(req.url).pathname);
    }
  };
}

/**
 * Wrap a public route handler with uniform error handling only.
 */
export function withPublic(
  handler: (
    req: NextRequest,
    ctx: { db: Database; params: RouteParams }
  ) => Promise<NextResponse>
) {
  return async (
    req: NextRequest,
    route?: NextRouteContext
  ): Promise<NextResponse> => {
    try {
      const params = route?.params ? await route.params : {};
      return await handler(req, { db: getDb(), params });
    } catch (error) {
      return toResponse(error, new URL(req.url).pathname);
    }
  };
}

/**
 * Parse and validate a JSON request body against a zod schema.
 * Throws ApiError(400) with flattened issues on failure.
 */
export async function parseBody<T extends z.ZodTypeAny>(
  req: NextRequest,
  schema: T,
  maxBytes = 2 * 1024 * 1024
): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    const bytes = await readBodyBytes(req, maxBytes);
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "Invalid JSON body");
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ApiError(400, "Validation failed", z.flattenError(result.error));
  }
  return result.data;
}

/**
 * Parse and validate URL search params against a zod schema.
 */
export function parseQuery<T extends z.ZodTypeAny>(
  req: NextRequest,
  schema: T
): z.infer<T> {
  const raw = Object.fromEntries(new URL(req.url).searchParams.entries());
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ApiError(400, "Invalid query parameters", z.flattenError(result.error));
  }
  return result.data;
}
