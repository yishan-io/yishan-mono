import type { Readable, Writable } from "node:stream";

import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import { carrierKeyOf } from "@deepseek-ai/dsh-scope";
import type { Scoped } from "@deepseek-ai/dsh-scope";
import { HarnessSdkJsonRpcServer } from "@deepseek-ai/dsh-sdk-jsonrpc-server";
import { JsonRpcLineTransport } from "@deepseek-ai/dsh-sdk-protocol";
import type { SessionId } from "@deepseek-ai/dsh-session";
import type { SessionRecord } from "@deepseek-ai/dsh-session-query";
import type {
  SubagentDescendantListEntry,
  SubagentListEntry,
  SubagentRunEndInfo,
  SubagentRunInfo,
} from "@deepseek-ai/dsh-subagent";

import {
  RequestPolicyError,
  SessionNotFoundError,
  SessionWorkspaceMismatchError,
  UnsupportedMethodError,
} from "../protocol/errors";
import { YISHAN_METHODS, YISHAN_NOTIFICATIONS } from "../protocol/protocol";
import type {
  SessionDisposeRequest,
  SessionDisposeResult,
  SessionHeaderResult,
  SessionLineageEntry,
  SessionLineageRequest,
  SessionLineageResult,
  SessionListRequest,
  SessionListResult,
  SessionReadRequest,
  SessionReadResult,
  SessionResumeRequest,
  SessionResumeResult,
} from "../protocol/session";
import { listProviders } from "../provider/providers";
import {
  type SessionCancelRequest,
  type SessionFlushRequest,
  type SessionPromptRequest,
  type SessionStartRequest,
  type SessionSubscribeRequest,
  type SetModelRequest,
  parseStockSessionPromptRequest,
} from "../session/protocol";
import { SessionRuntime } from "../session/runtime";
import { requireExactRecord, requireNonEmptyString } from "../shared/validation";

const STOCK_SESSION_NEW_METHOD = "session/new";
const STOCK_SESSION_PROMPT_METHOD = "session/prompt";
const YISHAN_NAMESPACE_PREFIX = "yishan.";
const LIFECYCLE_VERSION = 1;
const STOP_REASONS = new Set(["completed", "aborted", "error", "max-tokens", "refusal"]);

type SubagentInterruptRequest = {
  cwd: string;
  parentSessionId: string;
  childSessionId: string;
};

type SubagentInterruptResult = {
  parentSessionId: string;
  childSessionId: string;
  interruptRequested: boolean;
};

type LifecycleStopReason = "completed" | "aborted" | "error" | "max-tokens" | "refusal";

class SubagentInterruptError extends Error {
  readonly code: "YISHAN_PARENT_NOT_OWNED" | "YISHAN_PARENT_WORKSPACE_MISMATCH" | "YISHAN_CHILD_LINEAGE_DENIED";

  constructor(message: string, code: SubagentInterruptError["code"]) {
    super(message);
    this.name = "SubagentInterruptError";
    this.code = code;
  }
}
const EXECUTION_METHODS = new Set<string>([
  YISHAN_METHODS.start,
  YISHAN_METHODS.setModel,
  YISHAN_METHODS.prompt,
  YISHAN_METHODS.cancel,
  YISHAN_METHODS.subscribe,
  YISHAN_METHODS.flush,
  YISHAN_METHODS.resume,
  YISHAN_METHODS.dispose,
  YISHAN_METHODS.subagentInterrupt,
]);

/** Runtime-only stream hooks used by packaged launchers and tests. */
export type RuntimeServerConfig = {
  input?: Readable;
  output?: Writable;
  exit?: (code: number) => void;
};

/** Owns the Yishan stdio transport, SDK server, and session RPC dispatch. */
export class RpcServer {
  private readonly transport: JsonRpcLineTransport;
  private readonly sdkServer: HarnessSdkJsonRpcServer;
  private readonly runtime: SessionRuntime;
  private readonly exit: (code: number) => void;
  private shutdownTask: Promise<Record<string, never>> | undefined;
  private isInitialized = false;
  private isInitializing = false;
  private readonly subagentLifecycleRevisions = new Map<string, number>();

  /** Creates a server for one fully composed Cordis runtime. */
  constructor(
    private readonly ctx: Context,
    config: RuntimeServerConfig = {},
  ) {
    this.exit = config.exit ?? ((code: number): void => process.exit(code));
    this.transport = new JsonRpcLineTransport(config.input ?? process.stdin, config.output ?? process.stdout);
    this.sdkServer = new HarnessSdkJsonRpcServer(ctx, this.transport);
    this.runtime = new SessionRuntime(ctx, this.transport);
    this.subscribeToRuntimeEvents();
    this.subscribeToSubagentLifecycleEvents();
    this.transport.onRequest(async (method, params) => await this.handleRequest(method, params));
  }

  /** Starts accepting JSON-RPC requests on stdio. */
  start(): void {
    this.transport.start();
  }

  /** Shuts down session services and closes the stdio transport. */
  async close(): Promise<void> {
    await this.shutdown();
    this.transport.close();
  }

  private subscribeToRuntimeEvents(): void {
    this.ctx.on("session/event", (session, event) => this.runtime.handleSessionEvent(session, event));
  }

  private async handleRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
    if (method === "initialize") return await this.initialize(params);
    if (method === YISHAN_METHODS.providersList) return await listProviders(this.ctx.llm);
    if (method === "shutdown") return await this.handleShutdown();
    if (!this.isInitialized && EXECUTION_METHODS.has(method)) {
      throw new Error("initialize must succeed before session execution");
    }
    if (method === YISHAN_METHODS.subagentInterrupt) {
      return await this.interruptSubagent(params);
    }
    if (Object.values(YISHAN_METHODS).includes(method as (typeof YISHAN_METHODS)[keyof typeof YISHAN_METHODS])) {
      return await this.handleYishanRequest(method, params);
    }
    return await this.handleSdkRequest(method, params);
  }

  private async initialize(params: Record<string, unknown>): Promise<unknown> {
    if (this.isInitialized || this.isInitializing) throw new Error("runtime is already initialized");
    this.isInitializing = true;
    try {
      await this.ctx.get("loader")?.await();
      const result = await this.sdkServer.handleRequest("initialize", params);
      this.runtime.init(getInitializeOptions(params));
      this.isInitialized = true;
      return result;
    } finally {
      this.isInitializing = false;
    }
  }

  private async handleShutdown(): Promise<Record<string, never>> {
    const result = await this.shutdown();
    setImmediate(() => void this.disposeAndExit());
    return result;
  }

  private async handleSdkRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
    if (method.startsWith(YISHAN_NAMESPACE_PREFIX)) throw new UnsupportedMethodError(method);
    if (method === STOCK_SESSION_NEW_METHOD) throw new RequestPolicyError(method);
    if (method === STOCK_SESSION_PROMPT_METHOD) {
      if (typeof params.sessionId !== "string" || !this.runtime.owns(params.sessionId)) {
        throw new RequestPolicyError(method);
      }
      const prompt = parseStockSessionPromptRequest(params);
      return await this.runtime.stockPrompt(prompt.sessionId, prompt.contentBlocks);
    }
    return await this.sdkServer.handleRequest(method, params);
  }

  private async handleYishanRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
    switch (method) {
      case YISHAN_METHODS.start:
        return await this.runtime.start(params as SessionStartRequest);
      case YISHAN_METHODS.prompt:
        return await this.runtime.prompt(params as SessionPromptRequest);
      case YISHAN_METHODS.setModel:
        await this.runtime.setModel(params as SetModelRequest);
        return { ok: true };
      case YISHAN_METHODS.cancel:
        return await this.runtime.cancel(params as SessionCancelRequest);
      case YISHAN_METHODS.flush:
        return await this.runtime.flushSession(params as SessionFlushRequest);
      case YISHAN_METHODS.subscribe:
        return await this.runtime.subscribe(params as SessionSubscribeRequest);
      case YISHAN_METHODS.resume:
        return await this.resumeSession(params as SessionResumeRequest);
      case YISHAN_METHODS.dispose:
        return await this.disposeSession(params as SessionDisposeRequest);
      case YISHAN_METHODS.list:
        return await this.listSessions(params as SessionListRequest);
      case YISHAN_METHODS.read:
        return await this.readSession(params as SessionReadRequest);
      case YISHAN_METHODS.lineage:
        return await this.getSessionLineage(params as SessionLineageRequest);
      default:
        throw new UnsupportedMethodError(method);
    }
  }

  private async resumeSession(request: SessionResumeRequest): Promise<SessionResumeResult> {
    await this.runtime.resume(request);
    return { sessionId: request.sessionId };
  }

  private async disposeSession(request: SessionDisposeRequest): Promise<SessionDisposeResult> {
    return { sessionId: request.sessionId, disposed: await this.runtime.disposeSession(request) };
  }

  private async listSessions(request: SessionListRequest): Promise<SessionListResult> {
    const sessions = await this.ctx.sessionQuery.listSessions();
    return {
      sessions: sessions
        .filter(({ header }) => header.cwd === request.cwd && (header.delegationDepth ?? 0) === 0)
        .map(({ header, live, persisted }) => ({ ...this.createSessionHeaderResult(header), live, persisted })),
    };
  }

  private async readSession(request: SessionReadRequest): Promise<SessionReadResult> {
    const snapshot = await this.runtime.readDurableSession(request);
    return {
      session: this.createSessionHeaderResult(snapshot.session),
      events: snapshot.events,
      instanceId: snapshot.instanceId,
      asOfSeq: snapshot.asOfSeq,
      durableThroughSeq: snapshot.durableThroughSeq,
    };
  }

  private async getSessionLineage(request: SessionLineageRequest): Promise<SessionLineageResult> {
    const records = await this.ctx.sessionQuery.listSessions();
    const root = records.find(({ header }) => header.id === request.rootSessionId);
    if (root === undefined) throw new SessionNotFoundError(request.rootSessionId);
    if (root.header.cwd !== request.cwd) throw new SessionWorkspaceMismatchError(request.rootSessionId);
    const lineage =
      request.mode === "children"
        ? await this.ctx.subagents.listChildren(request.rootSessionId as SessionId)
        : await this.ctx.subagents.listDescendants(request.rootSessionId as SessionId);
    const recordsByID = new Map(records.map((record) => [record.header.id, record]));
    return {
      rootSessionId: request.rootSessionId,
      mode: request.mode,
      children: lineage.flatMap((entry) => this.createLineageEntry(entry, recordsByID, request)),
    };
  }

  private createLineageEntry(
    entry: SubagentListEntry | SubagentDescendantListEntry,
    recordsByID: Map<string, SessionRecord>,
    request: SessionLineageRequest,
  ): SessionLineageEntry[] {
    if (entry.kind !== "child") return [];
    const record = recordsByID.get(entry.id);
    const parentSessionId = "parentId" in entry ? entry.parentId : request.rootSessionId;
    if (
      record === undefined ||
      record.header.cwd !== request.cwd ||
      record.header.origin !== "subagent" ||
      record.header.parentSession !== parentSessionId ||
      record.header.delegationDepth === undefined ||
      !this.hasValidParentLineage(parentSessionId, recordsByID, request)
    )
      return [];
    return [
      {
        sessionId: entry.id,
        parentSessionId,
        origin: "subagent",
        delegationDepth: record.header.delegationDepth,
        relativeDepth: "depth" in entry ? entry.depth : 1,
        live: record.live,
        persisted: record.persisted,
        activity: entry.activity,
        mode: entry.mode,
        ...(entry.label === undefined ? {} : { label: entry.label }),
      },
    ];
  }

  private hasValidParentLineage(
    sessionId: string,
    recordsByID: Map<string, SessionRecord>,
    request: SessionLineageRequest,
  ): boolean {
    const visitedSessionIds = new Set<string>();
    let currentSessionId = sessionId;
    while (true) {
      if (visitedSessionIds.has(currentSessionId)) return false;
      visitedSessionIds.add(currentSessionId);
      const currentRecord = recordsByID.get(currentSessionId);
      if (currentRecord === undefined || currentRecord.header.cwd !== request.cwd) return false;
      if (currentSessionId === request.rootSessionId) return true;
      if (currentRecord.header.origin !== "subagent" || currentRecord.header.parentSession === undefined) return false;
      currentSessionId = currentRecord.header.parentSession;
    }
  }

  private createSessionHeaderResult(header: {
    id: string;
    createdAt: number;
    parentSession?: string;
    agentPreset?: string;
  }): SessionHeaderResult {
    return {
      sessionId: header.id,
      createdAt: header.createdAt,
      ...(header.parentSession === undefined ? {} : { parentSession: header.parentSession }),
      ...(header.agentPreset === undefined ? {} : { agentPreset: header.agentPreset }),
    };
  }

  private subscribeToSubagentLifecycleEvents(): void {
    const server = this;
    this.ctx.on("subagent/start", function (info) {
      server.publishSubagentLifecycle(this, info, "started");
    });
    this.ctx.on("subagent/end", function (info) {
      server.publishSubagentLifecycle(this, info, "finished", server.normalizeStopReason(info.stopReason));
    });
  }

  private publishSubagentLifecycle(
    carrier: Scoped<object>,
    info: SubagentRunInfo | SubagentRunEndInfo,
    event: "started" | "finished",
    stopReason?: LifecycleStopReason,
  ): void {
    const parentSessionId = this.getParentSessionId(carrier);
    const childSessionId = this.getNonEmptyString(info.id);
    const runId = this.getNonEmptyString(info.runId);
    const provider = this.getNonEmptyString(info.provider);
    if (!parentSessionId || !childSessionId || !runId || !provider) return;
    const revision = this.subagentLifecycleRevisions.get(parentSessionId) ?? 0;
    this.subagentLifecycleRevisions.set(parentSessionId, revision + 1);
    this.transport.notify(
      YISHAN_NOTIFICATIONS.subagentLifecycle as never,
      {
        version: LIFECYCLE_VERSION,
        parentSessionId,
        instanceId: this.runtime.getInstanceId(),
        revision,
        event,
        runId,
        childSessionId,
        provider,
        local: info.local,
        ...(stopReason === undefined ? {} : { stopReason }),
      } as never,
    );
  }

  private async interruptSubagent(params: unknown): Promise<SubagentInterruptResult> {
    const requestRecord = requireExactRecord(params, "subagent interrupt request", [
      "cwd",
      "parentSessionId",
      "childSessionId",
    ]);
    const request: SubagentInterruptRequest = {
      cwd: requireNonEmptyString(requestRecord, "cwd"),
      parentSessionId: requireNonEmptyString(requestRecord, "parentSessionId"),
      childSessionId: requireNonEmptyString(requestRecord, "childSessionId"),
    };
    this.authorizeInterruptParent(request);
    const [children, sessionRecords] = await Promise.all([
      this.ctx.subagents.listChildren(request.parentSessionId as SessionId),
      this.ctx.sessionQuery.listSessions(),
    ]);
    this.authorizeInterruptChild(request, children, sessionRecords);
    this.ctx.subagents.interrupt(request.childSessionId as SessionId, {
      kind: "user",
      parentSessionId: request.parentSessionId as SessionId,
    });
    return {
      parentSessionId: request.parentSessionId,
      childSessionId: request.childSessionId,
      interruptRequested: true,
    };
  }

  private authorizeInterruptParent(request: SubagentInterruptRequest): void {
    const parent = this.runtime.getOwnedLiveSession(request.parentSessionId);
    if (parent === undefined) {
      throw new SubagentInterruptError("parent session is not Yishan-owned and live", "YISHAN_PARENT_NOT_OWNED");
    }
    if (parent.header.cwd !== request.cwd) {
      throw new SubagentInterruptError(
        "parent session does not belong to the current workspace",
        "YISHAN_PARENT_WORKSPACE_MISMATCH",
      );
    }
  }

  private authorizeInterruptChild(
    request: SubagentInterruptRequest,
    children: SubagentListEntry[],
    sessionRecords: SessionRecord[],
  ): void {
    const isDirectChild = children.some((entry) => entry.kind === "child" && entry.id === request.childSessionId);
    const childRecord = sessionRecords.find(({ header }) => header.id === request.childSessionId);
    if (
      !isDirectChild ||
      childRecord === undefined ||
      childRecord.header.cwd !== request.cwd ||
      childRecord.header.origin !== "subagent" ||
      childRecord.header.parentSession !== request.parentSessionId
    ) {
      throw new SubagentInterruptError(
        "child session is not a direct subagent in the current workspace",
        "YISHAN_CHILD_LINEAGE_DENIED",
      );
    }
  }

  private normalizeStopReason(stopReason: string): LifecycleStopReason {
    return STOP_REASONS.has(stopReason) ? (stopReason as LifecycleStopReason) : "error";
  }

  private getParentSessionId(carrier: Scoped<object>): string | undefined {
    const parent = carrierKeyOf(carrier);
    if (!this.isAgent(parent) || parent.id !== parent.session.id) return undefined;
    return this.getNonEmptyString(parent.session.id);
  }

  private isAgent(value: unknown): value is Agent {
    return value !== null && typeof value === "object" && "id" in value && "session" in value;
  }

  private getNonEmptyString(value: unknown): string | undefined {
    return typeof value === "string" && value.length > 0 ? value : undefined;
  }

  private async shutdown(): Promise<Record<string, never>> {
    this.shutdownTask ??= this.shutdownServices();
    return await this.shutdownTask;
  }

  private async shutdownServices(): Promise<Record<string, never>> {
    const results = await Promise.allSettled([this.runtime.dispose(), this.sdkServer.shutdown()]);
    const failures = results
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => result.reason as unknown);
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) throw new AggregateError(failures, "failed to shut down DSH runtime");
    return {};
  }

  private async disposeAndExit(): Promise<void> {
    await Promise.allSettled([this.transport.flush()]);
    await Promise.allSettled([this.ctx.root.fiber.dispose()]);
    this.exit(0);
  }
}

function getInitializeOptions(params: Record<string, unknown>): {
  provider?: string;
  model?: string;
  maxTokens?: number;
} {
  return {
    ...(typeof params.provider === "string" ? { provider: params.provider } : {}),
    ...(typeof params.model === "string" ? { model: params.model } : {}),
    ...(typeof params.maxTokens === "number" ? { maxTokens: params.maxTokens } : {}),
  };
}
