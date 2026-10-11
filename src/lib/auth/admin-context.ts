import "server-only";

import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "./server";
import { getDb } from "@/lib/db";
import { resolveAuthedContext, resolvePreviewContext } from "@/lib/api/handler";
import { PREVIEW_COOKIE_NAME } from "@/lib/preview-identity";

/** Request-scoped only: SSR and APIs use the same live RBAC/preview resolver. */
export const getAdminContext = cache(async () => {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/admin/login");
  const actor = await resolveAuthedContext(getDb(), session.user.id, {});
  if (!actor) redirect("/admin/login");
  const raw = (await cookies()).get(PREVIEW_COOKIE_NAME)?.value;
  const { ctx } = await resolvePreviewContext(actor, raw);
  // Server Components cannot delete cookies. The next API request clears an
  // invalid preview cookie; until then both surfaces safely use the actor.
  return ctx;
});
