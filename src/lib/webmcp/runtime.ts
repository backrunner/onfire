import { z } from "zod";
import type { MeResponse } from "@/lib/api/types";
import type { WebMcpOperation } from "./catalog";

export interface WebMcpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint: boolean };
  execute: (input: unknown) => Promise<{ content: { type: "text"; text: string }[]; isError?: boolean }>;
}

/** Current W3C draft plus the older Chromium navigator implementation. */
export interface WebMcpContext {
  registerTool(tool: WebMcpTool, options?: { signal: AbortSignal }): void | Promise<void>;
  unregisterTool?(name: string): void | Promise<void>;
}

export function getWebMcpContext(document: object, navigator: object): WebMcpContext | undefined {
  for (const owner of [document, navigator]) {
    const context = (owner as { modelContext?: WebMcpContext }).modelContext;
    if (typeof context?.registerTool === "function") return context;
  }
}

export function identityKey(me: MeResponse | null | undefined): string {
  return me ? JSON.stringify([me.user.id, me.role, [...me.permissions].sort(), [...me.tenantIds].sort(), [...me.productIds].sort(), [...me.teamIds].sort(), me.preview?.actor.id ?? null, me.preview?.target.id ?? null]) : "";
}

class ToolError extends Error {
  constructor(public status: number, message: string, public details?: unknown) { super(message); }
}

export async function sessionRequest(path: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(path, {
    ...init, credentials: "same-origin", mode: "same-origin", cache: "no-store", redirect: "error",
    signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000),
    headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) },
  });
  let envelope: { ok?: boolean; data?: unknown; error?: string; details?: unknown };
  try { envelope = await response.json(); }
  catch { throw new ToolError(response.status, "The server did not return an OnFire JSON response."); }
  if (!response.ok || envelope.ok !== true) throw new ToolError(response.status, envelope.error ?? "OnFire request failed.", envelope.details);
  return envelope.data;
}

export function buildOperationRequest(operation: WebMcpOperation, input: unknown) {
  const parsed = operationInput(operation).parse(input) as Record<string, unknown>;
  const path = operation.path.replace(/:([A-Za-z]+)/g, (_, key: string) => encodeURIComponent(String(parsed[key])));
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries((parsed.query ?? {}) as Record<string, unknown>)) {
    if (value !== undefined) query.set(key, String(value));
  }
  return {
    path: path + (query.size ? `?${query}` : ""),
    init: { method: operation.method, ...(operation.method !== "GET" && operation.method !== "DELETE" ? { body: JSON.stringify(parsed.body ?? {}) } : {}) },
  };
}

interface RegistryOptions {
  request?: typeof sessionRequest;
  onIdentity: (me: MeResponse | null) => void;
  onMutation: (operation: WebMcpOperation) => Promise<unknown>;
  onRegistrationError?: () => void;
  /** Optional preloaded operation set; otherwise the catalogue is code-split and loaded on first identity. */
  operations?: WebMcpOperation[];
}

/** Serializes async registration/cleanup across identity changes and React remounts. */
const contextQueues = new WeakMap<WebMcpContext, Promise<void>>();
const inputSchemas = new WeakMap<WebMcpOperation, Record<string, unknown>>();

function schemaFor(operation: WebMcpOperation): Record<string, unknown> {
  const cached = inputSchemas.get(operation);
  if (cached) return cached;
  const schema = z.toJSONSchema(operationInput(operation), { io: "input" });
  inputSchemas.set(operation, schema);
  return schema;
}

function operationInput(operation: WebMcpOperation) {
  return z.strictObject({
    ...operation.params.shape,
    ...(operation.query ? { query: operation.query.safeParse({}).success ? operation.query.optional() : operation.query } : {}),
    ...(operation.body ? { body: operation.body } : {}),
  });
}

function operationAllowed(operation: WebMcpOperation, me: MeResponse): boolean {
  return (!me.preview || operation.method === "GET") &&
    (!operation.permission || me.permissions.includes(operation.permission)) &&
    (!operation.roles || operation.roles.includes(me.role));
}

export class WebMcpRegistry {
  private generation = 0;
  private key = "";
  private controller = new AbortController();
  private registered: string[] = [];
  private request: typeof sessionRequest;
  private pending: Promise<void> = Promise.resolve();
  private liveIdentityFlight: Promise<MeResponse> | null = null;
  private operations: WebMcpOperation[] | undefined;
  private operationsFlight: Promise<WebMcpOperation[]> | undefined;

  constructor(private context: WebMcpContext, private options: RegistryOptions) {
    this.request = options.request ?? sessionRequest;
    this.operations = options.operations;
  }

  private async getOperations(): Promise<WebMcpOperation[]> {
    if (this.operations) return this.operations;
    this.operationsFlight ??= import("./catalog").then(({ webMcpOperations }) => {
      this.operations = webMcpOperations;
      return webMcpOperations;
    });
    return this.operationsFlight;
  }

  /** Coalesce simultaneous live identity checks from multiple tool calls. */
  private getLiveIdentity(): Promise<MeResponse> {
    if (!this.liveIdentityFlight) {
      this.liveIdentityFlight = this.request("/api/tob/me") as Promise<MeResponse>;
      void this.liveIdentityFlight.then(() => { this.liveIdentityFlight = null; }, () => { this.liveIdentityFlight = null; });
    }
    return this.liveIdentityFlight;
  }

  setIdentity(me: MeResponse | null): Promise<void> {
    const key = identityKey(me);
    if (key === this.key) return this.pending;
    this.key = key;
    const generation = ++this.generation;
    this.controller.abort();
    const controller = this.controller = new AbortController();
    const prior = contextQueues.get(this.context) ?? Promise.resolve();
    this.pending = prior.then(async () => {
      for (const name of this.registered.splice(0)) {
        try { await this.context.unregisterTool?.(name); } catch { /* Already removed by its signal. */ }
      }
      if (!me || generation !== this.generation) return;
      const operations = await this.getOperations();
      for (const operation of operations.filter((item) => operationAllowed(item, me))) {
        if (controller.signal.aborted) break;
        try {
          await this.context.registerTool({
            name: operation.name,
            description: operation.description,
            inputSchema: schemaFor(operation),
            annotations: { readOnlyHint: operation.method === "GET" },
            execute: (input) => this.execute(operation, input, me, generation, controller.signal),
          }, { signal: controller.signal });
          this.registered.push(operation.name);
        } catch {
          if (!controller.signal.aborted) this.options.onRegistrationError?.();
        }
      }
    });
    contextQueues.set(this.context, this.pending);
    return this.pending;
  }

  dispose(): Promise<void> {
    return this.setIdentity(null);
  }

  private async execute(operation: WebMcpOperation, input: unknown, registeredMe: MeResponse, generation: number, signal: AbortSignal) {
    let mutationStarted = false;
    try {
      if (generation !== this.generation || signal.aborted) throw new ToolError(401, "This tool's Dashboard session is no longer active. Rediscover tools.");
      const request = buildOperationRequest(operation, input);
      // Never trust SWR's cached identity for execution. Each target API also rechecks live scope.
      const live = await this.getLiveIdentity();
      if (identityKey(live) !== identityKey(registeredMe)) {
        this.options.onIdentity(live);
        void this.setIdentity(live);
        throw new ToolError(403, "The Dashboard identity or permissions changed. Rediscover tools before retrying.");
      }
      if (generation !== this.generation || signal.aborted || !operationAllowed(operation, live)) throw new ToolError(403, "This operation is no longer available.");
      mutationStarted = operation.method !== "GET";
      const data = operation.path === "/api/tob/me" ? live : await this.request(request.path, { ...request.init, signal });
      let uiRefreshFailed = false;
      if (mutationStarted) {
        // A refresh failure must not misreport a committed mutation as failed and cause duplicate replies/versions.
        try { await this.options.onMutation(operation); } catch { uiRefreshFailed = true; }
      }
      return { content: [{ type: "text" as const, text: JSON.stringify({ ok: true, data, ...(uiRefreshFailed ? { warning: "Saved successfully; reload the Dashboard to refresh its display. Do not repeat the mutation." } : {}) }) }] };
    } catch (error) {
      if (generation === this.generation && error instanceof ToolError && error.status === 401) {
        this.options.onIdentity(null);
        void this.setIdentity(null);
      }
      const details = error instanceof z.ZodError ? { issues: error.issues.map(({ path, message }) => ({ path, message })) } : error instanceof ToolError ? error.details : undefined;
      return { isError: true, content: [{ type: "text" as const, text: JSON.stringify({
        ok: false, status: error instanceof ToolError ? error.status : error instanceof z.ZodError ? 400 : 0,
        error: error instanceof ToolError ? error.message : error instanceof z.ZodError ? "Invalid tool arguments." : mutationStarted ? "The request was interrupted; its outcome is unknown. Read the resource before retrying a mutation." : "The Dashboard session could not be verified. Reload or sign in again.",
        ...(details ? { details } : {}),
      }) }] };
    }
  }
}
