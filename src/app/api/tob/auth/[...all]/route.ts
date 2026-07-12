import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export async function GET(request: NextRequest) {
  const auth = getAuth();
  const handler = toNextJsHandler(auth.handler);
  return handler.GET(request);
}

export async function POST(request: NextRequest) {
  // OnFire is invite-only. Installation and authorized user management call
  // Better Auth server-side; exposing this endpoint would create auth users
  // without an application profile or RBAC scope.
  if (new URL(request.url).pathname.replace(/\/+$/, "").endsWith("/sign-up/email")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const auth = getAuth();
  const handler = toNextJsHandler(auth.handler);
  return handler.POST(request);
}
