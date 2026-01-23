import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    data: { ok: true, scope: "tob", ts: Date.now() },
  });
}
