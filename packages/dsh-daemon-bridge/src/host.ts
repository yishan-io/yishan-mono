import type { Readable, Writable } from "node:stream";

import { type Context, Service } from "@deepseek-ai/cordis";
import { HarnessSdkJsonRpcServer } from "@deepseek-ai/dsh-sdk-jsonrpc-server";
import { JsonRpcLineTransport } from "@deepseek-ai/dsh-sdk-protocol";

import type { CapabilityRequest } from "./capabilityClient";
import { type YISHAN_NOTIFICATIONS, YISHAN_REVERSE_METHODS } from "./protocol/protocol";
import {
  type WorkspaceBinding,
  type WorkspaceBindingRequest,
  type WorkspaceBindingResolver,
  workspaceBindingSchema,
} from "./workspaceBinding";

/** Cordis plugin name for the private daemon bridge. */
export const name = "dsh-daemon-bridge";

/** Stream and test-seam configuration owned by the daemon bridge. */
export type BridgeHostConfig = {
  input?: Readable;
  output?: Writable;
  exit?: (code: number) => void;
  workspaceBindingResolver?: WorkspaceBindingResolver;
};

/** One inbound bridge request handler owned by a first-party plugin. */
export type BridgeRequestHandler = (params: Record<string, unknown>) => Promise<unknown>;

/** Initialize hook run after the stock SDK initialize request succeeds. */
export type BridgeInitializeHook = (params: Record<string, unknown>, sdkResult: unknown) => Promise<void>;

/** Shutdown hook run before the Cordis runtime is disposed. */
export type BridgeShutdownHook = () => Promise<void>;

/** Narrow notification sink consumed by session event publishers. */
export type BridgeNotificationSink = Pick<BridgeHost, "notify">;

type BridgeNotificationMethod = (typeof YISHAN_NOTIFICATIONS)[keyof typeof YISHAN_NOTIFICATIONS];

declare module "@deepseek-ai/cordis" {
  interface Context {
    daemonBridge: BridgeHost;
  }
}

/** Owns stdio JSON-RPC, route registration, lifecycle hooks, and the base daemon capability transport. */
export class BridgeHost extends Service implements WorkspaceBindingResolver {
  private readonly transport: JsonRpcLineTransport;
  private readonly sdkServer: HarnessSdkJsonRpcServer;
  private readonly handlers = new Map<string, { owner: string; handler: BridgeRequestHandler }>();
  private readonly initializeHooks = new Map<string, BridgeInitializeHook>();
  private readonly shutdownHooks = new Map<string, BridgeShutdownHook>();
  private readonly exit: (code: number) => void;
  private readonly workspaceBindingResolver: WorkspaceBindingResolver | undefined;
  private closeTask: Promise<void> | undefined;
  private shutdownTask: Promise<Record<string, never>> | undefined;
  private isStarted = false;
  private isInitialized = false;
  private isInitializing = false;

  /** Creates one dormant bridge service for the composed DSH runtime. */
  constructor(
    private readonly runtimeContext: Context,
    config: BridgeHostConfig = {},
  ) {
    super(runtimeContext, "daemonBridge");
    this.transport = new JsonRpcLineTransport(config.input ?? process.stdin, config.output ?? process.stdout);
    this.sdkServer = new HarnessSdkJsonRpcServer(runtimeContext, this.transport);
    this.exit = config.exit ?? ((code: number): void => process.exit(code));
    this.workspaceBindingResolver = config.workspaceBindingResolver;
    this.transport.onRequest(async (method, params) => await this.dispatchRequest(method, params));
  }

  /** Registers exact method ownership before the bridge starts. */
  registerHandlers(owner: string, handlers: Readonly<Record<string, BridgeRequestHandler>>): () => void {
    this.requireMutableRoutes();
    if (owner.length === 0) throw new TypeError("bridge route owner is required");
    for (const method of Object.keys(handlers)) {
      if (method.length === 0) throw new TypeError("bridge method is required");
      const existing = this.handlers.get(method);
      if (existing !== undefined) {
        throw new Error(`bridge method ${method} is already owned by ${existing.owner}`);
      }
    }
    for (const [method, handler] of Object.entries(handlers)) this.handlers.set(method, { owner, handler });
    return () => {
      for (const method of Object.keys(handlers)) {
        if (this.handlers.get(method)?.owner === owner) this.handlers.delete(method);
      }
    };
  }

  /** Registers one owner-scoped initialize hook before the bridge starts. */
  registerInitializeHook(owner: string, hook: BridgeInitializeHook): () => void {
    return this.registerHook(this.initializeHooks, owner, hook, "initialize");
  }

  /** Registers one owner-scoped shutdown hook before the bridge starts. */
  registerShutdownHook(owner: string, hook: BridgeShutdownHook): () => void {
    return this.registerHook(this.shutdownHooks, owner, hook, "shutdown");
  }

  /** Starts accepting daemon requests after every plugin has registered its routes. */
  start(): void {
    if (this.isStarted) throw new Error("daemon bridge is already started");
    this.isStarted = true;
    this.transport.start();
  }

  /** Shuts down the SDK server and closes the host-owned transport. */
  async close(): Promise<void> {
    this.closeTask ??= this.closeTransport();
    await this.closeTask;
  }

  /** Flushes pending bridge frames. */
  async flush(): Promise<void> {
    await this.transport.flush();
  }

  /** Sends one domain-owned operation through the authorized daemon capability channel. */
  async requestCapability<TOperation extends string, TInput>(
    request: CapabilityRequest<TOperation, TInput>,
  ): Promise<unknown> {
    return await this.transport.request(YISHAN_REVERSE_METHODS.capabilityRequest, {
      id: request.id,
      cancellationId: request.cancellationId,
      sessionId: request.sessionId,
      workspaceId: request.workspaceId,
      generation: request.generation,
      deadlineAtMs: request.deadlineAtMs,
      operation: request.operation,
      input: request.input,
    });
  }

  /** Resolves the daemon-authoritative binding for one session workspace. */
  async resolveWorkspaceBinding(request: WorkspaceBindingRequest): Promise<WorkspaceBinding> {
    const payload =
      this.workspaceBindingResolver !== undefined
        ? await this.workspaceBindingResolver.resolveWorkspaceBinding(request)
        : await this.transport.request(YISHAN_REVERSE_METHODS.workspaceBindingResolve, request);
    return workspaceBindingSchema.parse(payload);
  }

  /** Publishes a private daemon notification emitted by a domain plugin. */
  notify(method: BridgeNotificationMethod, params: unknown): void {
    this.transport.notify(method as never, params as never);
  }

  private async dispatchRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
    if (method === "initialize") return await this.initialize(params);
    if (method === "shutdown") return await this.shutdown();
    const registered = this.handlers.get(method);
    if (registered !== undefined) return await registered.handler(params);
    if (method.startsWith("yishan.")) throw new Error(`unsupported Yishan protocol method: ${method}`);
    return await this.sdkServer.handleRequest(method, params);
  }

  private async initialize(params: Record<string, unknown>): Promise<unknown> {
    if (this.isInitialized || this.isInitializing) throw new Error("runtime is already initialized");
    this.isInitializing = true;
    try {
      const result = await this.sdkServer.handleRequest("initialize", params);
      for (const hook of this.initializeHooks.values()) await hook(params, result);
      this.isInitialized = true;
      return result;
    } finally {
      this.isInitializing = false;
    }
  }

  private async shutdown(): Promise<Record<string, never>> {
    this.shutdownTask ??= this.runShutdown();
    return await this.shutdownTask;
  }

  private async runShutdown(): Promise<Record<string, never>> {
    for (const hook of this.shutdownHooks.values()) await hook();
    setImmediate(() => void this.disposeAndExit());
    return {};
  }

  private async disposeAndExit(): Promise<void> {
    await this.flush();
    await this.runtimeContext.root.fiber.dispose();
    this.exit(0);
  }

  private async closeTransport(): Promise<void> {
    await this.sdkServer.shutdown();
    this.transport.close();
  }

  private registerHook<THook>(hooks: Map<string, THook>, owner: string, hook: THook, kind: string): () => void {
    this.requireMutableRoutes();
    if (owner.length === 0) throw new TypeError(`bridge ${kind} hook owner is required`);
    if (hooks.has(owner)) throw new Error(`bridge ${kind} hook is already registered by ${owner}`);
    hooks.set(owner, hook);
    return () => {
      if (hooks.get(owner) === hook) hooks.delete(owner);
    };
  }

  private requireMutableRoutes(): void {
    if (this.isStarted) throw new Error("daemon bridge routes are frozen after start");
  }
}

/** Installs the dormant daemon bridge service and its transport cleanup. */
export function apply(context: Context, config: BridgeHostConfig = {}): void {
  const host = new BridgeHost(context, config);
  context.effect(() => async () => await host.close(), "daemon-bridge.transport");
}
