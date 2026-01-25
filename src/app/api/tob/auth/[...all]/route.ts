import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export async function GET(request: NextRequest) {
  const auth = getAuth();
  const handler = toNextJsHandler(auth.handler);
  return handler.GET(request);
}

export async function POST(request: NextRequest) {
  const auth = getAuth();
  const handler = toNextJsHandler(auth.handler);
  return handler.POST(request);
}
