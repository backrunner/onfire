import { NextRequest } from "next/server";
import { getAuth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

const auth = getAuth();

export const { GET, POST } = toNextJsHandler(auth.handler);
