import { randomBytes } from "node:crypto";
import type { Context } from "@deepseek-ai/cordis";
import { type ModelSelectionRef, installModelSelection } from "@deepseek-ai/dsh-agent";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { type SessionId, foldRequestHeader } from "@deepseek-ai/dsh-session";
import type {} from "@deepseek-ai/dsh-session-persistence";

import { type BridgeNotificationSink, YISHAN_NOTIFICATIONS } from "@yishan-io/dsh-daemon-bridge";
import type {} from "@yishan-io/dsh-workspace";
import type { DurableCursor } from "../shared/cursor";

import { type SessionBoundData, registerSessionEventTypes } from "./binding";
import { SessionExecutionError } from "./errors";
import type {
  SequencedSessionEvent,
  SessionCancelRequest,
  SessionCancelResult,
  SessionExecutionRequest,
  SessionFlushRequest,
  SessionPromptRequest,
  SessionPromptResult,
  SessionRuntimeResumeRequest,
  SessionStartRequest,
  SessionStartResult,
  SessionSubscribeRequest,
  SessionSubscribeResult,
  SetModelRequest,
  TextPromptContentBlock,
} from "./protocol";
import {
  getWorkspaceBinding,
  persistSessionMetadata,
  requireMatchingBinding,
  requireMatchingBindingData,
} from "./runtimeBinding";
import {
  requireAuthoritativeCwd,
  requireContiguousPersistedEvents,
  requireCwd,
  requirePluginWorkspaceId,
  requireTaskCwd,
} from "./runtimeValidation";
import type { AgentHandle, CwdTask, DurableSessionSnapshot, InitializeOptions, LiveSession } from "./types";
export type { DurableSessionSnapshot } from "./types";

/** Validates one exact provider and model before session execution. */
export type ValidateModelSelection = (selection: { provider: string; model: string }) => Promise<void>;

/** Owns all Yishan-created or resumed DSH agent handles for one runtime instance ID. */
export class SessionRuntime {
  private readonly handles = new Map<string, AgentHandle>();
  private readonly creations = new Map<string, CwdTask<AgentHandle>>();
  private readonly disposals = new Map<string, CwdTask<boolean>>();
  private readonly flushes = new Map<string, CwdTask<DurableCursor>>();
  private readonly modelSelections = new Map<string, ModelSelectionRef>();
  private readonly instanceId: string;
  private initializeOptions: InitializeOptions = {};
  private hasInitialized = false;
  private isShuttingDown = false;

  /** Creates the runtime and mints its opaque process-local instance ID. */
  constructor(
    private readonly ctx: Context,
    private readonly transport: BridgeNotificationSink,
    private readonly validateModelSelection: ValidateModelSelection,
    instanceId?: string,
  ) {
    registerSessionEventTypes();
    this.instanceId = instanceId ?? `yishan-${randomBytes(24).toString("hex")}`;
  }

  getInstanceId(): string {
    return this.instanceId;
  }

  /** Reads one physical durable snapshot without flushing or consulting live events. */
  async readDurableSession(request: SessionExecutionRequest): Promise<DurableSessionSnapshot> {
    const live = this.ctx.sessions.get(request.sessionId as SessionId);
    if (live !== undefined && this.owns(request.sessionId) && live.seq === 0) {
      requireCwd(live.header.cwd, request);
      return {
        session: live.header,
        events: [],
        instanceId: this.instanceId,
        asOfSeq: -1,
        durableThroughSeq: -1,
        filePath: "",
      };
    }
    const persisted = await this.readValidatedDurableSession(request);
    const durableThroughSeq = persisted.events.length - 1;
    return {
      session: persisted.meta,
      events: persisted.events,
      instanceId: this.instanceId,
      asOfSeq: durableThroughSeq,
      durableThroughSeq,
      filePath: this.ctx.sessionPersistence.locate(persisted.meta)?.path ?? "",
    };
  }

  init(options: InitializeOptions): void {
    if (this.hasInitialized) throw new Error("runtime is already initialized");
    this.initializeOptions = { ...options };
    this.hasInitialized = true;
  }

  /** Creates one Yishan-owned session with the caller's exact workspace cwd. */
  async start(request: SessionStartRequest): Promise<SessionStartResult> {
    this.requireAdmitted();
    await this.getOrCreate(request.sessionId, request.cwd, "start", request.binding, request.agentOptions);
    return { sessionId: request.sessionId, instanceId: this.instanceId };
  }

  /** Resumes one persisted session into Yishan ownership after checking its durable workspace. */
  async resume(request: SessionRuntimeResumeRequest): Promise<void> {
    this.requireAdmitted();
    const existing = this.handles.get(request.sessionId);
    if (existing !== undefined) {
      requireCwd(existing.agent.session.header.cwd, request);
      return requirePluginWorkspaceId(this.ctx, request.sessionId, request.workspaceId);
    }
    await this.getOrCreate(request.sessionId, request.cwd, "resume", undefined, undefined, request.workspaceId);
  }

  /** Adds text-only prompt blocks as one semantic user message to an owned session. */
  async prompt(request: SessionPromptRequest): Promise<SessionPromptResult> {
    this.requireAdmitted();
    const handle = await this.requireOwnedHandle(request.sessionId);
    requireCwd(handle.agent.session.header.cwd, request);
    return this.followup(handle, request.contentBlocks);
  }

  /** Adds a stock prompt to an owned session using only its authoritative handle cwd. */
  async stockPrompt(sessionId: string, contentBlocks: TextPromptContentBlock[]): Promise<SessionPromptResult> {
    this.requireAdmitted();
    const handle = await this.requireOwnedHandle(sessionId);
    requireAuthoritativeCwd(handle.agent.session);
    return this.followup(handle, contentBlocks);
  }

  /** Updates the model for the next turn of a live session without restarting it. */
  async setModel(request: SetModelRequest): Promise<void> {
    this.requireAdmitted();
    const handle = await this.requireOwnedHandle(request.sessionId);
    requireCwd(handle.agent.session.header.cwd, request);
    const selectionRef = this.modelSelections.get(request.sessionId);
    const provider = request.provider ?? selectionRef?.current?.provider;
    if (provider === undefined)
      throw new SessionExecutionError(
        "provider and model must identify an active runtime route",
        "YISHAN_PROVIDER_SELECTION_INVALID",
      );
    const selection = { provider, model: request.model };
    await this.validateModelSelection(selection);
    if (selectionRef === undefined)
      throw new SessionExecutionError("session is owned by stock DSH", "YISHAN_SESSION_COLLISION");
    selectionRef.current = selection;
  }

  /** Cancels an owned session while retaining its handle and queued inbox. */
  async cancel(request: SessionCancelRequest): Promise<SessionCancelResult> {
    this.requireAdmitted();
    const handle = await this.requireOwnedHandle(request.sessionId);
    requireCwd(handle.agent.session.header.cwd, request);
    handle.agent.cancel({ kind: "user" }, { keepInbox: true });
    return { sessionId: request.sessionId, cancelled: true };
  }

  /** Disposes one owned handle, retaining ownership until the handle disposal settles. */
  async disposeSession(request: SessionExecutionRequest): Promise<boolean> {
    this.requireAdmitted();
    await this.creations.get(request.sessionId)?.task;
    const handle = this.handles.get(request.sessionId);
    if (handle === undefined) return false;
    requireCwd(handle.agent.session.header.cwd, request);
    const active = this.disposals.get(request.sessionId);
    if (active !== undefined) {
      requireTaskCwd(active, request.cwd);
      return await active.task;
    }
    return await this.disposeOwned(request.sessionId, request.cwd);
  }

  async flushSession(request: SessionFlushRequest): Promise<DurableCursor> {
    this.requireAdmitted();
    return await this.getOrStartFlush(request);
  }

  /** Reads the durable tail after a cursor and reports its physical durable head. */
  async subscribe(request: SessionSubscribeRequest): Promise<SessionSubscribeResult> {
    const live = this.ctx.sessions.get(request.sessionId as SessionId);
    if (live !== undefined) requireCwd(live.header.cwd, request);
    const owned = this.handles.get(request.sessionId);
    const durabilityTarget = owned === undefined || live === undefined ? undefined : live.seq - 1;
    if (owned !== undefined) await this.flushSession({ cwd: request.cwd, sessionId: request.sessionId });
    if (owned !== undefined && live?.seq === 0 && request.afterSeq === -1) {
      return {
        sessionId: request.sessionId,
        instanceId: this.instanceId,
        events: [],
        asOfSeq: -1,
        durableThroughSeq: -1,
        headSeq: -1,
      };
    }
    const persisted = await this.ctx.sessionPersistence.readFrom(request.sessionId as SessionId, 0);
    requireCwd(persisted.meta.cwd, request);
    requireContiguousPersistedEvents(persisted.events);
    const durableThroughSeq = persisted.events.length - 1;
    if (request.afterSeq > durableThroughSeq)
      throw new SessionExecutionError(
        "session replay cursor is no longer available; reset the transcript",
        "YISHAN_SESSION_REPLAY_RESET_REQUIRED",
      );
    if (durabilityTarget !== undefined && durableThroughSeq < durabilityTarget) {
      throw new SessionExecutionError(
        "session persistence did not reach the live durability target",
        "YISHAN_DURABILITY_UNAVAILABLE",
      );
    }
    return {
      sessionId: request.sessionId,
      instanceId: this.instanceId,
      events: persisted.events.filter((event) => event.seq > request.afterSeq),
      asOfSeq: durableThroughSeq,
      durableThroughSeq,
      headSeq: durableThroughSeq,
    };
  }

  /** Starts a coalesced durability checkpoint when an owned turn ends. */
  handleSessionEvent(session: LiveSession, event: SequencedSessionEvent): void {
    if (this.isShuttingDown || !this.handles.has(session.id)) return;
    if (event.type !== "turn/end") return;
    const cwd = session.header.cwd;
    if (cwd === undefined) return;
    // fire-and-forget: turn-end durability must not block DSH event publication.
    void this.getOrStartFlush({ cwd, sessionId: session.id }).catch((error: unknown) => {
      console.error("failed to auto-flush Yishan session", error);
    });
  }

  /** Closes admission, flushes every owned session, and then disposes all owned handles. */
  async dispose(): Promise<void> {
    this.isShuttingDown = true;
    const activeDisposalResults = await Promise.allSettled([...this.disposals.values()].map(({ task }) => task));
    const creationResults = await Promise.allSettled([...this.creations.values()].map(({ task }) => task));
    const disposalResults = await Promise.allSettled(
      [...this.handles.keys()].map(async (sessionId) => await this.disposeForShutdown(sessionId)),
    );
    const failures = [...activeDisposalResults, ...creationResults, ...disposalResults]
      .filter(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected" &&
          !(result.reason instanceof SessionExecutionError && result.reason.code === "YISHAN_SESSION_DISPOSING"),
      )
      .map((result) => result.reason);
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) throw new AggregateError(failures, "failed to shut down Yishan sessions");
  }

  getOwnedLiveSession(sessionId: string): LiveSession | undefined {
    return this.handles.get(sessionId)?.agent.session;
  }

  owns(sessionId: string): boolean {
    return this.handles.has(sessionId) || this.creations.has(sessionId) || this.disposals.has(sessionId);
  }

  private async getOrCreate(
    sessionId: string,
    cwd: string,
    operation: "start" | "resume",
    binding?: SessionBoundData,
    agentOptions?: { model?: string; provider?: string },
    workspaceId?: string,
  ): Promise<AgentHandle> {
    const owned = this.handles.get(sessionId);
    if (owned !== undefined) {
      requireCwd(owned.agent.session.header.cwd, { sessionId, cwd });
      if (operation === "start") requireMatchingBinding(owned.agent.session, binding);
      if (operation === "resume") requirePluginWorkspaceId(this.ctx, sessionId, workspaceId);
      return owned;
    }
    const creating = this.creations.get(sessionId);
    if (creating !== undefined) {
      requireTaskCwd(creating, cwd);
      if (operation === "start") requireMatchingBindingData(creating.binding, binding);
      if (operation === "resume" && creating.workspaceId !== workspaceId)
        throw new SessionExecutionError(
          "session does not belong to the current workspace",
          "YISHAN_SESSION_WORKSPACE_MISMATCH",
        );
      return await creating.task;
    }
    if (this.disposals.has(sessionId))
      throw new SessionExecutionError("session execution is disposing", "YISHAN_SESSION_DISPOSING");
    if (
      this.ctx.agents.get(sessionId as SessionId) !== undefined ||
      this.ctx.sessions.get(sessionId as SessionId) !== undefined
    ) {
      throw new SessionExecutionError("session is owned by stock DSH", "YISHAN_SESSION_COLLISION");
    }
    const task = this.createAndRetain(sessionId, cwd, operation, binding, agentOptions, workspaceId);
    this.creations.set(sessionId, { cwd, binding, workspaceId, task });
    try {
      return await task;
    } finally {
      this.creations.delete(sessionId);
    }
  }

  private async createAndRetain(
    sessionId: string,
    cwd: string,
    operation: "start" | "resume",
    binding?: SessionBoundData,
    agentOptions?: { model?: string; provider?: string },
    workspaceId?: string,
  ): Promise<AgentHandle> {
    const mergedOptions = agentOptions ? { ...this.initializeOptions, ...agentOptions } : this.initializeOptions;
    const persisted = operation === "resume" ? await this.readValidatedDurableSession({ sessionId, cwd }) : undefined;
    const options =
      persisted === undefined ? mergedOptions : (foldRequestHeader(persisted.events)?.config ?? mergedOptions);
    const workspaceBinding = getWorkspaceBinding(operation, binding, persisted?.events);
    const workspaceAdmission = await this.resolveWorkspaceBinding(
      sessionId,
      workspaceBinding.workspaceId,
      cwd,
      workspaceId,
    );
    try {
      const workspaceSetup = workspaceAdmission.setup;
      const selection: ModelSelectionRef = {
        current:
          options.provider === undefined || options.model === undefined
            ? undefined
            : { provider: options.provider, model: options.model },
        assembled: undefined,
      };
      if (selection.current !== undefined) await this.validateModelSelection(selection.current);
      const handle = await (operation === "start"
        ? this.ctx.agents.create({
            sessionId: sessionId as SessionId,
            meta: { cwd: workspaceAdmission.cwd },
            agentOptions: mergedOptions,
            setup: (agentCtx) => {
              workspaceSetup(agentCtx);
              installModelSelection(agentCtx, selection);
            },
          })
        : this.ctx.agents.resume({
            resumeSessionId: sessionId as SessionId,
            agentOptions: this.initializeOptions,
            setup: (agentCtx) => {
              workspaceSetup(agentCtx);
              installModelSelection(agentCtx, selection);
            },
          }));
      try {
        this.requireAdmitted();
        if (handle.agent.session.id !== sessionId)
          throw new SessionExecutionError("agent returned a different session identity", "YISHAN_SESSION_COLLISION");
        requireCwd(handle.agent.session.header.cwd, { sessionId, cwd: workspaceAdmission.cwd });
        if (operation === "start") await persistSessionMetadata(this.ctx, handle.agent.session, binding);
        this.modelSelections.set(sessionId, selection);
        this.handles.set(sessionId, handle);
        return handle;
      } catch (error) {
        await handle.dispose();
        throw error;
      }
    } catch (error) {
      this.ctx.yishanWorkspaceBindingHost.releaseSession(sessionId);
      throw error;
    }
  }

  private async resolveWorkspaceBinding(
    sessionId: string,
    workspaceId: string,
    cwd: string,
    requestedWorkspaceId: string | undefined,
  ) {
    try {
      return await this.ctx.yishanWorkspaceBindingHost.resolveSessionBinding(
        { sessionId, workspaceId, cwd },
        requestedWorkspaceId,
      );
    } catch {
      throw new SessionExecutionError(
        "session does not belong to the current workspace",
        "YISHAN_SESSION_WORKSPACE_MISMATCH",
      );
    }
  }

  private async getOrStartFlush(request: SessionFlushRequest): Promise<DurableCursor> {
    if (this.disposals.has(request.sessionId))
      throw new SessionExecutionError("session execution is disposing", "YISHAN_SESSION_DISPOSING");
    const active = this.flushes.get(request.sessionId);
    if (active !== undefined) {
      requireTaskCwd(active, request.cwd);
      return await active.task;
    }
    const task = this.flushOwned(request);
    this.flushes.set(request.sessionId, { cwd: request.cwd, task });
    try {
      return await task;
    } finally {
      this.flushes.delete(request.sessionId);
    }
  }

  private async flushOwned(request: SessionFlushRequest): Promise<DurableCursor> {
    const handle = await this.requireOwnedHandle(request.sessionId);
    requireCwd(handle.agent.session.header.cwd, request);
    return await this.flushHandle(request.sessionId, handle);
  }

  private async flushHandle(sessionId: string, handle: AgentHandle): Promise<DurableCursor> {
    const durableThroughSeq = handle.agent.session.seq - 1;
    if ((await this.ctx.sessions.flush(handle.agent.session)) !== true) {
      throw new SessionExecutionError("no session durability listener is installed", "YISHAN_DURABILITY_UNAVAILABLE");
    }
    const cursor = { sessionId, durableThroughSeq, instanceId: this.instanceId };
    this.transport.notify(YISHAN_NOTIFICATIONS.durableCursor, cursor);
    return cursor;
  }

  private async disposeOwned(sessionId: string, cwd: string): Promise<boolean> {
    const handle = this.handles.get(sessionId);
    if (handle === undefined) return false;
    const activeFlush = this.flushes.get(sessionId);
    let markDisposalInstalled: () => void = () => undefined;
    const disposalInstalled = new Promise<void>((resolve) => {
      markDisposalInstalled = resolve;
    });
    const task = this.flushAndDisposeHandle(sessionId, handle, activeFlush, disposalInstalled);
    this.disposals.set(sessionId, { cwd, task });
    markDisposalInstalled();
    try {
      return await task;
    } finally {
      this.disposals.delete(sessionId);
    }
  }

  private async flushAndDisposeHandle(
    sessionId: string,
    handle: AgentHandle,
    activeFlush: CwdTask<DurableCursor> | undefined,
    disposalInstalled: Promise<void>,
  ): Promise<boolean> {
    await disposalInstalled;
    await activeFlush?.task;
    await this.flushHandle(sessionId, handle);
    await handle.dispose();
    this.modelSelections.delete(sessionId);
    this.ctx.yishanWorkspaceBindingHost.releaseSession(sessionId);
    if (this.handles.get(sessionId) === handle) this.handles.delete(sessionId);
    return true;
  }

  private async disposeForShutdown(sessionId: string): Promise<boolean> {
    const handle = this.handles.get(sessionId);
    if (handle === undefined) return false;
    const cwd = requireAuthoritativeCwd(handle.agent.session);
    const active = this.disposals.get(sessionId);
    if (active !== undefined) return await active.task;
    return await this.disposeOwned(sessionId, cwd);
  }

  private async requireOwnedHandle(sessionId: string): Promise<AgentHandle> {
    if (this.disposals.has(sessionId))
      throw new SessionExecutionError("session execution is disposing", "YISHAN_SESSION_DISPOSING");
    await this.creations.get(sessionId)?.task;
    if (this.disposals.has(sessionId))
      throw new SessionExecutionError("session execution is disposing", "YISHAN_SESSION_DISPOSING");
    const handle = this.handles.get(sessionId);
    if (handle === undefined)
      throw new SessionExecutionError("session is owned by stock DSH", "YISHAN_SESSION_COLLISION");
    return handle;
  }

  private followup(handle: AgentHandle, contentBlocks: TextPromptContentBlock[]): SessionPromptResult {
    const message = createUserMessage({ content: contentBlocks, source: { kind: "user" } });
    handle.agent.followup(message);
    return { messageId: message.id };
  }

  private requireAdmitted(): void {
    if (this.isShuttingDown)
      throw new SessionExecutionError("session execution is disposing", "YISHAN_SESSION_DISPOSING");
  }

  private async readValidatedDurableSession(request: SessionExecutionRequest) {
    const persisted = await this.ctx.sessionPersistence.readFrom(request.sessionId as SessionId, 0);
    if (persisted.meta.id !== request.sessionId) {
      throw new SessionExecutionError("persisted session identity does not match", "YISHAN_SESSION_COLLISION");
    }
    requireCwd(persisted.meta.cwd, request);
    requireContiguousPersistedEvents(persisted.events);
    return persisted;
  }
}
