import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi, afterEach } from "vitest";
import type { MeResponse } from "@/lib/api/types";
import { Role, rolePermissions } from "@/lib/types";
import { operationAllowed, operationInput, webMcpOperations } from "./catalog";
import { buildOperationRequest, getWebMcpContext, sessionRequest, WebMcpRegistry, type WebMcpTool, type WebMcpContext } from "./runtime";

function identity(role = Role.SuperAdmin): MeResponse {
  return { user: { id: "user-1", email: "admin@example.test", displayName: "Admin", tenantId: "tenant-1" }, role, permissions: [...rolePermissions[role]], tenantIds: ["tenant-1"], productIds: ["product-1"], teamIds: ["team-1"] };
}
function harness(me = identity(), modern = false) {
  const tools = new Map<string, WebMcpTool>();
  const context: WebMcpContext = {
    registerTool: vi.fn(async (tool, options) => {
      if (tools.has(tool.name)) throw new Error("Duplicate tool");
      tools.set(tool.name, tool);
      if (modern) options?.signal.addEventListener("abort", () => tools.delete(tool.name), { once: true });
    }),
    ...(modern ? {} : { unregisterTool: vi.fn((name: string) => { tools.delete(name); }) }),
  };
  const request = vi.fn(async (path: string, _init?: RequestInit): Promise<unknown> => path === "/api/tob/me" ? me : { saved: true });
  const onMutation = vi.fn(async () => {});
  const onIdentity = vi.fn();
  const onRegistrationError = vi.fn();
  const registry = new WebMcpRegistry(context, { request, onMutation, onIdentity, onRegistrationError });
  return { tools, context, registry, request, onMutation, onIdentity, onRegistrationError };
}
function operation(name: string) { return webMcpOperations.find((op) => op.name === `onfire_${name}`)!; }
function payload(result: Awaited<ReturnType<WebMcpTool["execute"]>>) { return JSON.parse(result.content[0].text); }
afterEach(() => vi.unstubAllGlobals());

describe("WebMCP catalogue and browser compatibility", () => {
  it("registers JSON schemas for every operation with both browser APIs", async () => {
    expect(new Set(webMcpOperations.map((op) => op.name)).size).toBe(webMcpOperations.length);
    for (const modern of [false, true]) {
      const h = harness(identity(), modern);
      expect(getWebMcpContext(modern ? { modelContext: h.context } : {}, modern ? {} : { modelContext: h.context })).toBe(h.context);
      await h.registry.setIdentity(identity());
      expect(h.onRegistrationError).not.toHaveBeenCalled();
      expect(h.tools.size).toBe(webMcpOperations.length);
      for (const tool of h.tools.values()) {
        expect(tool.inputSchema.type).toBe("object");
        expect(tool.inputSchema.additionalProperties).toBe(false);
        expect(tool.annotations.readOnlyHint).toBe(operation(tool.name.slice(7)).method === "GET");
      }
      const schema = h.tools.get("onfire_get_context")!.inputSchema;
      await h.registry.setIdentity(identity(Role.Agent));
      expect(h.tools.get("onfire_get_context")!.inputSchema).toBe(schema);
      await h.registry.dispose();
      expect(h.tools.size).toBe(0);
    }
    expect(getWebMcpContext({}, {})).toBeUndefined();
  });

  it("maps every operation to an existing authenticated route and its permission gate", () => {
    for (const op of webMcpOperations) {
      const route = resolve("src/app", op.path.slice(1).replace(/:([A-Za-z]+)/g, "[$1]"), "route.ts");
      const source = readFileSync(route, "utf8");
      const gate = source.match(new RegExp(`export const ${op.method} = withAuth\\(\\s*\\{([^}]*)\\}`));
      expect(gate, op.name).not.toBeNull();
      const permission = gate?.[1].match(/permission:\s*"([^"]+)"/)?.[1];
      if (permission) expect(op.permission, op.name).toBe(permission);
      expect([...op.path.matchAll(/:([A-Za-z]+)/g)].map((match) => match[1]).sort()).toEqual(Object.keys(op.params.shape).sort());
    }
  });

  it("shows each role only its features and strips all preview mutations", () => {
    for (const role of Object.values(Role)) {
      const me = identity(role);
      const visible = webMcpOperations.filter((op) => operationAllowed(op, me));
      expect(visible.some((op) => op.name === "onfire_get_ticket")).toBe(true);
      expect(visible.some((op) => op.name === "onfire_create_product")).toBe([Role.SuperAdmin, Role.TenantAdmin].includes(role));
      expect(visible.some((op) => op.name === "onfire_save_template_version")).toBe([Role.SuperAdmin, Role.TenantAdmin, Role.ProductAdmin].includes(role));
      expect(visible.some((op) => op.name === "onfire_list_ai_credentials")).toBe([Role.SuperAdmin, Role.TenantAdmin, Role.ProductAdmin].includes(role));
      me.preview = { actor: { ...me.user, role: Role.SuperAdmin }, target: { ...me.user, role } };
      expect(webMcpOperations.filter((op) => operationAllowed(op, me)).every((op) => op.method === "GET")).toBe(true);
    }
  });

  it("validates required query fields and rejects URL/path injection or unknown input", () => {
    expect(() => buildOperationRequest(operation("get_email_config"), {})).toThrow();
    expect(() => buildOperationRequest(operation("get_email_config"), { query: {} })).toThrow();
    expect(() => buildOperationRequest(operation("get_ticket"), { id: "../auth/sign-out" })).toThrow();
    expect(() => buildOperationRequest(operation("get_ticket"), { id: "%2e%2e" })).toThrow();
    expect(() => buildOperationRequest(operation("get_ticket"), { id: "ticket-1", url: "https://external.test" })).toThrow();
    expect(() => buildOperationRequest(operation("update_product"), { id: "product-1", body: { tenantId: "foreign" } })).toThrow();
    expect(buildOperationRequest(operation("list_tickets"), {}).path).toBe("/api/tob/tickets");
    expect(buildOperationRequest(operation("list_tickets"), { query: { q: "a&productId=foreign", overdue: false, pageSize: 10 } }).path).toContain("q=a%26productId%3Dforeign");
  });

  it("exposes a complete form schema and preserves translated fields in version saves", () => {
    const formSchema = { version: "1.0", fields: [{ id: "field-1", key: "environment", label: "Environment", labelI18n: { zh: "环境" }, type: "select", options: [{ value: "prod", label: "Production", labelI18n: { zh: "生产" } }] }] };
    const request = buildOperationRequest(operation("save_template_version"), { id: "type-1", body: { formSchema, changeNote: "Add environment" } });
    expect(request.path).toBe("/api/tob/admin/ticket-types/type-1/template/versions");
    expect(JSON.parse(request.init.body!)).toEqual({ formSchema, changeNote: "Add environment" });
    expect(() => buildOperationRequest(operation("save_template_version"), { id: "type-1", body: { formSchema: { version: "1.0", fields: [{ type: "unknown" }] } } })).toThrow();
    expect(operationInput(operation("invalidate_template_version")).safeParse({ id: "type-1", versionId: "v-1", body: {} }).success).toBe(false);
  });
});

describe("WebMCP execution lifecycle", () => {
  it("rechecks the live session, uses the normal API and refreshes the Dashboard after writes", async () => {
    const h = harness();
    await h.registry.setIdentity(identity());
    const result = await h.tools.get("onfire_reply_ticket")!.execute({ id: "ticket-1", body: { content: "Hello", internal: true } });
    expect(payload(result).ok).toBe(true);
    expect(h.request.mock.calls.map(([path]) => path)).toEqual(["/api/tob/me", "/api/tob/tickets/ticket-1"]);
    expect(h.request.mock.calls[1][1]).toMatchObject({ method: "POST", body: JSON.stringify({ content: "Hello", internal: true }) });
    expect(h.onMutation).toHaveBeenCalledOnce();
    expect(h.onMutation).toHaveBeenCalledWith(operation("reply_ticket"));
    await h.registry.dispose();
  });

  it("coalesces concurrent live identity checks before executing tools", async () => {
    const h = harness();
    await h.registry.setIdentity(identity());
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    h.request.mockImplementation(async (path: string) => {
      if (path === "/api/tob/me") { await gate; return identity(); }
      return { saved: true };
    });
    const first = h.tools.get("onfire_get_ticket")!.execute({ id: "ticket-1" });
    const second = h.tools.get("onfire_get_dashboard")!.execute({});
    await Promise.resolve();
    expect(h.request.mock.calls.filter(([path]) => path === "/api/tob/me")).toHaveLength(1);
    release();
    await Promise.all([first, second]);
    await h.registry.dispose();
  });

  it("returns server scope errors without claiming a mutation succeeded", async () => {
    const me = identity(Role.ProductAdmin);
    const h = harness(me);
    h.request.mockImplementation(sessionRequest);
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ ok: true, data: me })).mockResolvedValueOnce(Response.json({ ok: false, error: "Product not found" }, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    await h.registry.setIdentity(me);
    const result = await h.tools.get("onfire_update_product")!.execute({ id: "foreign-product", body: { name: "Changed" } });
    expect(result.isError).toBe(true);
    expect(payload(result)).toMatchObject({ status: 404, error: "Product not found" });
    expect(h.onMutation).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ credentials: "same-origin", mode: "same-origin", cache: "no-store", redirect: "error" });
    await h.registry.dispose();
  });

  it("fails validation before fetching and does not echo submitted secrets", async () => {
    const h = harness();
    await h.registry.setIdentity(identity());
    const result = await h.tools.get("onfire_create_ai_credential")!.execute({ query: { scope: "system" }, body: { name: "test", provider: "unknown-secret-value", apiKey: "secret" } });
    expect(payload(result).status).toBe(400);
    expect(result.content[0].text).not.toContain("unknown-secret-value");
    expect(h.request).not.toHaveBeenCalled();
    await h.registry.dispose();
  });

  it.each(["role", "scope", "user", "preview"])("invalidates stale callbacks after a live %s change", async (change) => {
    const h = harness();
    await h.registry.setIdentity(identity());
    const stale = h.tools.get("onfire_update_product")!;
    const live = identity();
    if (change === "role") Object.assign(live, identity(Role.Agent));
    if (change === "scope") live.productIds = ["product-2"];
    if (change === "user") live.user.id = "user-2";
    if (change === "preview") live.preview = { actor: { ...live.user, role: Role.SuperAdmin }, target: { ...live.user, role: Role.Agent } };
    h.request.mockResolvedValue(live);
    const result = await stale.execute({ id: "product-1", body: { name: "Changed" } });
    expect(payload(result).status).toBe(403);
    expect(h.request).toHaveBeenCalledOnce();
    expect(h.onIdentity).toHaveBeenCalledWith(live);
    expect(h.onMutation).not.toHaveBeenCalled();
    await h.registry.setIdentity(live);
    h.request.mockClear();
    await stale.execute({ id: "product-1", body: { name: "Changed" } });
    expect(h.request).not.toHaveBeenCalled();
    await h.registry.dispose();
  });

  it("unregisters tools after session expiry and never starts the target operation", async () => {
    const h = harness();
    h.request.mockImplementation(sessionRequest);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: false, error: "Unauthorized" }, { status: 401 })));
    await h.registry.setIdentity(identity());
    const result = await h.tools.get("onfire_get_ticket")!.execute({ id: "ticket-1" });
    expect(payload(result).status).toBe(401);
    await h.registry.dispose();
    expect(h.tools.size).toBe(0);
    expect(h.request).toHaveBeenCalledOnce();
    expect(h.onIdentity).toHaveBeenCalledWith(null);
  });

  it("keeps a committed mutation successful when UI refresh fails", async () => {
    const h = harness();
    h.onMutation.mockRejectedValue(new Error("SWR refresh failed"));
    await h.registry.setIdentity(identity());
    const result = await h.tools.get("onfire_close_ticket")!.execute({ id: "ticket-1", body: {} });
    expect(result.isError).toBeUndefined();
    expect(payload(result)).toMatchObject({ ok: true, warning: expect.stringContaining("Do not repeat") });
    await h.registry.dispose();
  });

  it("reports an unknown mutation outcome after network loss without retrying", async () => {
    const h = harness();
    h.request.mockResolvedValueOnce(identity()).mockRejectedValueOnce(new TypeError("Network failure"));
    await h.registry.setIdentity(identity());
    const result = await h.tools.get("onfire_reply_ticket")!.execute({ id: "ticket-1", body: { content: "Hi" } });
    expect(payload(result).error).toContain("outcome is unknown");
    expect(h.request).toHaveBeenCalledTimes(2);
    await h.registry.dispose();
  });

  it("serializes delayed registration, cleanup and React remount without duplicate tools", async () => {
    const h = harness();
    const registered = h.context.registerTool;
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    h.context.registerTool = vi.fn(async (tool, options) => { await blocked; await registered(tool, options); });
    const first = h.registry.setIdentity(identity());
    await Promise.resolve();
    const cleanup = h.registry.dispose();
    const second = new WebMcpRegistry(h.context, { onIdentity: h.onIdentity, onMutation: h.onMutation, onRegistrationError: h.onRegistrationError });
    const remount = second.setIdentity(identity(Role.Agent));
    release();
    await Promise.all([first, cleanup, remount]);
    expect(h.onRegistrationError).not.toHaveBeenCalled();
    expect([...h.tools.keys()]).toEqual(webMcpOperations.filter((op) => operationAllowed(op, identity(Role.Agent))).map((op) => op.name));
    await second.dispose();
    expect(h.tools.size).toBe(0);
  });
});
