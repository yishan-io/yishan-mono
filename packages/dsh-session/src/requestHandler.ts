import type { Context } from "@deepseek-ai/cordis";
import type { SessionId } from "@deepseek-ai/dsh-session";
import type { SessionRecord } from "@deepseek-ai/dsh-session-query";
import type { SubagentDescendantListEntry, SubagentListEntry } from "@deepseek-ai/dsh-subagent";
import { type BridgeNotificationSink, YISHAN_METHODS } from "@yishan-io/dsh-daemon-bridge";
import type { ProviderCatalogService } from "@yishan-io/dsh-provider";
import { parseStockSessionPromptRequest } from "./session/protocol";
import type {
  SessionDisposeRequest,
  SessionDisposeResult,
  SessionFilePathRequest,
  SessionFilePathResult,
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
  SessionTitleSummaryRequest,
  SessionTitleSummaryResult,
} from "./session/query";
import {
  RequestPolicyError,
  SessionError,
  SessionNotFoundError,
  SessionWorkspaceMismatchError,
  UnsupportedMethodError,
} from "./session/queryErrors";
import {
  parseSessionCancelRequest,
  parseSessionDisposeRequest,
  parseSessionFilePathRequest,
  parseSessionFlushRequest,
  parseSessionLineageRequest,
  parseSessionListRequest,
  parseSessionPromptRequest,
  parseSessionReadRequest,
  parseSessionResumeRequest,
  parseSessionStartRequest,
  parseSessionSubscribeRequest,
  parseSessionTitleSummaryRequest,
  parseSetModelRequest,
} from "./session/requestValidation";
import { SessionRuntime } from "./session/runtime";
import { requireExactRecord, requireNonEmptyString } from "./shared/validation";
import { SubagentLifecycleNotifier } from "./subagentNotifications";

const STOCK_SESSION_NEW_METHOD = "session/new";
const STOCK_SESSION_PROMPT_METHOD = "session/prompt";

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

/** Owns Yishan session request policy, validation, execution, and bridge forwarding. */
export class SessionRequestHandler {
  private readonly runtime: SessionRuntime;
  private closeTask: Promise<void> | undefined;
  private isInitialized = false;
  private isInitializing = false;

  /** Creates request policy for one fully composed Cordis runtime. */
  constructor(
    private readonly ctx: Context,
    notifications: BridgeNotificationSink,
    providerCatalog: Pick<ProviderCatalogService, "validateSelection">,
  ) {
    this.runtime = new SessionRuntime(ctx, notifications, providerCatalog);
    this.subscribeToRuntimeEvents();
    new SubagentLifecycleNotifier(this.ctx, this.runtime, notifications).subscribe();
  }

  /** Disposes runtime-owned session services before bridge transport shutdown. */
  async close(): Promise<void> {
    this.closeTask ??= this.runtime.dispose();
    await this.closeTask;
  }

  private subscribeToRuntimeEvents(): void {
    this.ctx.on("session/event", (session, event) => this.runtime.handleSessionEvent(session, event));
  }

  async handle(method: string, params: Record<string, unknown>): Promise<unknown> {
    if (!this.isInitialized && EXECUTION_METHODS.has(method)) {
      throw new Error("initialize must succeed before session execution");
    }
    if (method === STOCK_SESSION_NEW_METHOD) throw new RequestPolicyError(method);
    if (method === STOCK_SESSION_PROMPT_METHOD) {
      if (typeof params.sessionId !== "string" || !this.runtime.owns(params.sessionId)) {
        throw new RequestPolicyError(method);
      }
      const prompt = parseStockSessionPromptRequest(params);
      return await this.runtime.stockPrompt(prompt.sessionId, prompt.contentBlocks);
    }
    if (method === YISHAN_METHODS.subagentInterrupt) return await this.interruptSubagent(params);
    if (Object.values(YISHAN_METHODS).includes(method as (typeof YISHAN_METHODS)[keyof typeof YISHAN_METHODS])) {
      return await this.handleYishanRequest(method, params);
    }
    throw new UnsupportedMethodError(method);
  }

  /** Initializes session execution after the bridge SDK handshake succeeds. */
  async initialize(params: Record<string, unknown>): Promise<void> {
    if (this.isInitialized || this.isInitializing) throw new Error("runtime is already initialized");
    this.isInitializing = true;
    try {
      await this.ctx.get("loader")?.await();
      this.runtime.init(getInitializeOptions(params));
      this.isInitialized = true;
    } finally {
      this.isInitializing = false;
    }
  }

  private async handleYishanRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
    switch (method) {
      case YISHAN_METHODS.start:
        return await this.runtime.start(parseSessionStartRequest(params));
      case YISHAN_METHODS.prompt:
        return await this.runtime.prompt(parseSessionPromptRequest(params));
      case YISHAN_METHODS.setModel:
        await this.runtime.setModel(parseSetModelRequest(params));
        return { ok: true };
      case YISHAN_METHODS.cancel:
        return await this.runtime.cancel(parseSessionCancelRequest(params));
      case YISHAN_METHODS.flush:
        return await this.runtime.flushSession(parseSessionFlushRequest(params));
      case YISHAN_METHODS.subscribe:
        return await this.runtime.subscribe(parseSessionSubscribeRequest(params));
      case YISHAN_METHODS.resume:
        return await this.resumeSession(parseSessionResumeRequest(params));
      case YISHAN_METHODS.dispose:
        return await this.disposeSession(parseSessionDisposeRequest(params));
      case YISHAN_METHODS.filePath:
        return await this.getSessionFilePath(parseSessionFilePathRequest(params));
      case YISHAN_METHODS.list:
        return await this.listSessions(parseSessionListRequest(params));
      case YISHAN_METHODS.titleSummary:
        return await this.getSessionTitleSummaries(parseSessionTitleSummaryRequest(params));
      case YISHAN_METHODS.read:
        return await this.readSession(parseSessionReadRequest(params));
      case YISHAN_METHODS.lineage:
        return await this.getSessionLineage(parseSessionLineageRequest(params));
      default:
        throw new UnsupportedMethodError(method);
    }
  }

  private async resumeSession(request: SessionResumeRequest): Promise<SessionResumeResult> {
    await this.runtime.resume(request);
    return { sessionId: request.sessionId };
  }

  private async disposeSession(request: SessionDisposeRequest): Promise<SessionDisposeResult> {
    return {
      sessionId: request.sessionId,
      disposed: await this.runtime.disposeSession(request),
    };
  }

  private async getSessionFilePath(request: SessionFilePathRequest): Promise<SessionFilePathResult> {
    try {
      const record = (await this.ctx.sessionQuery.listSessions()).find(({ header }) => header.id === request.sessionId);
      if (record === undefined) throw new SessionNotFoundError(request.sessionId);
      if (record.header.cwd !== request.cwd) throw new SessionWorkspaceMismatchError(request.sessionId);
      if (!record.persisted || !this.ctx.sessionPersistence.supportsRawArtifacts) return { filePath: "" };
      const artifact = await this.ctx.sessionPersistence.readRaw(request.sessionId as SessionId);
      if (artifact === undefined || artifact.meta.id !== request.sessionId || artifact.meta.cwd !== request.cwd)
        return { filePath: "" };
      return { filePath: this.ctx.sessionPersistence.locate(record.header)?.path ?? "" };
    } catch (error) {
      if (error instanceof SessionError) throw new Error(`${error.code}: ${error.message}`);
      throw error;
    }
  }

  private async listSessions(request: SessionListRequest): Promise<SessionListResult> {
    const sessionRecords = (await this.ctx.sessionQuery.listSessions()).filter(
      ({ header }) => header.cwd === request.cwd && (header.delegationDepth ?? 0) === 0,
    );
    return {
      sessions: sessionRecords.map(({ header, live, persisted }) => ({
        ...this.createSessionHeaderResult(header),
        live,
        persisted,
      })),
    };
  }

  private async getSessionTitleSummaries(request: SessionTitleSummaryRequest): Promise<SessionTitleSummaryResult> {
    const sessionIds = [...new Set(request.sessionIds)].map((sessionId) => sessionId as SessionId);
    if (sessionIds.length !== request.sessionIds.length) throw new Error("sessionIds must be unique");
    if (sessionIds.length === 0) return { titles: [] };

    const sessionRecords = await this.ctx.sessionQuery.listSessions();
    const recordsBySessionId = new Map(sessionRecords.map((record) => [record.header.id, record]));
    for (const sessionId of sessionIds) {
      const record = recordsBySessionId.get(sessionId);
      if (record === undefined) throw new SessionNotFoundError(sessionId);
      if (record.header.cwd !== request.cwd) throw new SessionWorkspaceMismatchError(sessionId);
    }

    // One batch observation returns each requested session's latest log-backed title, if one is available.
    const titleResults = await this.ctx.sessionQuery.readTitleSnapshots(sessionIds);
    const previewsBySessionId = new Map(
      titleResults.flatMap((result) =>
        result.status === "fulfilled" && result.value.session.cwd === request.cwd && result.value.title !== undefined
          ? [[result.sessionId, result.value.title.title] as const]
          : [],
      ),
    );
    return {
      titles: sessionIds.map((sessionId) => ({ sessionId, previewText: previewsBySessionId.get(sessionId) ?? "" })),
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
    origin?: "subagent";
    agentPreset?: string;
  }): SessionHeaderResult {
    return {
      sessionId: header.id,
      createdAt: header.createdAt,
      ...(header.parentSession === undefined ? {} : { parentSession: header.parentSession }),
      ...(header.origin === undefined ? {} : { origin: header.origin }),
      ...(header.agentPreset === undefined ? {} : { agentPreset: header.agentPreset }),
    };
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
