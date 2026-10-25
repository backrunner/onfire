import { z } from "zod";
import { parseQuery, withAuth } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { listFilteredInputs } from "@/services/filtered-inputs";

const schema = z.object({ tenantId: z.string().min(1).optional(), state: z.enum(["pending", "released"]).optional(), page: z.coerce.number().int().min(1).max(10000).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(20) });
export const GET = withAuth({ permission: "spam.config" }, async (req, ctx) => ok(await listFilteredInputs(ctx, parseQuery(req, schema))));
