import { NextRequest, NextResponse } from "next/server";
import { getDb, getEnv } from "@/lib/db";
import { productKeys, customers } from "@/drizzle/schema";
import { eq, and } from "drizzle-orm";

// POST /api/toc/tokens - Issue JWT token
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      apiKey?: string;
      email?: string;
      externalId?: string;
      level?: number;
    };
    const { apiKey, email, externalId, level } = body;

    if (!apiKey || !email) {
      return NextResponse.json(
        { ok: false, error: "apiKey and email are required" },
        { status: 400 }
      );
    }

    // Parse API key (format: keyId.secret)
    const [keyId, secret] = apiKey.split(".");
    if (!keyId || !secret) {
      return NextResponse.json(
        { ok: false, error: "Invalid API key format" },
        { status: 400 }
      );
    }

    const db = getDb();
    const env = getEnv();

    // Verify API key
    const key = await db.query.productKeys.findFirst({
      where: and(eq(productKeys.id, keyId), eq(productKeys.secret, secret)),
    });

    if (!key || key.revoked) {
      return NextResponse.json(
        { ok: false, error: "Invalid or revoked API key" },
        { status: 401 }
      );
    }

    // Update last used timestamp
    await db
      .update(productKeys)
      .set({ lastUsedAt: new Date().toISOString() })
      .where(eq(productKeys.id, keyId));

    // Create or update customer
    const existingCustomer = await db.query.customers.findFirst({
      where: and(
        eq(customers.productId, key.productId),
        eq(customers.email, email)
      ),
    });

    let customerId: string;
    const now = new Date().toISOString();

    if (existingCustomer) {
      customerId = existingCustomer.id;
      await db
        .update(customers)
        .set({
          externalId: externalId ?? existingCustomer.externalId,
          level: level ?? existingCustomer.level,
          updatedAt: now,
        })
        .where(eq(customers.id, customerId));
    } else {
      customerId = crypto.randomUUID();
      // Get tenant ID from product
      const product = await db.query.products.findFirst({
        where: eq(products.id, key.productId),
      });

      if (!product) {
        return NextResponse.json(
          { ok: false, error: "Product not found" },
          { status: 404 }
        );
      }

      await db.insert(customers).values({
        id: customerId,
        tenantId: product.tenantId,
        productId: key.productId,
        email,
        externalId,
        level,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Generate JWT token
    const payload = {
      sub: customerId,
      email,
      productId: key.productId,
      externalId,
      level,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24 hours
      iss: env.JWT_ISSUER || "onfire",
      aud: env.JWT_AUDIENCE || "onfire",
    };

    // Simple JWT encoding (in production, use proper JWT library)
    const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payloadStr = btoa(JSON.stringify(payload));
    const signature = btoa(
      await crypto.subtle
        .digest(
          "SHA-256",
          new TextEncoder().encode(
            `${header}.${payloadStr}.${env.AUTH_SECRET || "secret"}`
          )
        )
        .then((buf) =>
          Array.from(new Uint8Array(buf))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("")
        )
    );

    const token = `${header}.${payloadStr}.${signature}`;

    return NextResponse.json({
      ok: true,
      data: {
        token,
        customerId,
        productId: key.productId,
        expiresIn: 24 * 60 * 60,
      },
    });
  } catch (error) {
    console.error("Error in POST /api/toc/tokens:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Import products for tenant lookup
import { products } from "@/drizzle/schema";
