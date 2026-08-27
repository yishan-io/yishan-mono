import { randomBytes } from "node:crypto";
import { createUserMessage } from "@deepseek-ai/dsh-llm";

import type { SessionEvent, SessionHeader } from "@deepseek-ai/dsh-session";

import type { DurableCursor } from "./durableCursor";
import type {
  SequencedSessionEvent,
  SessionCancelRequest,
  SessionCancelResult,
  SessionExecutionRequest,
  SessionFlushRequest,
  SessionPromptRequest,
  SessionPromptResult,
  SessionStartRequest,
  SessionStartResult,
  SessionSubscribeRequest,
  SessionSubscribeResult,
  TextPromptContentBlock,
} from "./executionContracts";
import { YISHAN_NOTIFICATIONS } from "./protocol";
import { type SessionBoundData, registerYishanSessionEventTypes } from "./sessionBindingContracts";
import { appendSessionBinding, hasMatchingSessionBinding, hasSameSessionBinding } from "./sessionBindingOwner";
import type {
  AgentHandle,
  CwdTask,
  DurableSessionSnapshot,
  InitializeOptions,
  LiveSession,
  YishanSessionExecutionDependencies,
} from "./sessionExecutionOwnerContracts";
export type { DurableSessionSnapshot, YishanSessionExecutionDependencies } from "./sessionExecutionOwnerContracts";

/** Failures raised while operating on a Yishan-owned live DSH session. */
export class YishanSessionExecutionError extends Error {
  /** Stable machine-readable execution failure code. */
  readonly code:
    | "YISHAN_DURABILITY_UNAVAILABLE"
    | "YISHAN_SESSION_COLLISION"
    | "YISHAN_SESSION_DISPOSING"
    | "YISHAN_SESSION_WORKSPACE_MISMATCH"
    | "YISHAN_SESSION_REPLAY_RESET_REQUIRED"
    | "YISHAN_SESSION_BINDING_CONFLICT";

  /** Creates one typed execution failure. */
  constructor(message: string, code: YishanSessionExecutionError["code"]) {
    super(message);
    this.name = "YishanSessionExecutionError";
    this.code = code;
  }
}

/** Owns all Yishan-created or resumed DSH agent handles for one runtime incarnation. */
export class YishanSessionExecutionOwner {
  private readonly handles = new Map<string, AgentHandle>();
  private readonly creations = new Map<string, CwdTask<AgentHandle>>();
  private readonly disposals = new Map<string, CwdTask<boolean>>();
  private readonly flushes = new Map<string, CwdTask<DurableCursor>>();
  private readonly incarnation: string;
  private initializeOptions: InitializeOptions = {};
  private isShuttingDown = false;

  /** Creates the owner and mints its opaque process-local incarnation. */
  constructor(private readonly dependencies: YishanSessionExecutionDependencies) {
    registerYishanSessionEventTypes();
    this.incarnation = dependencies.incarnation ?? `yishan-${randomBytes(24).toString("hex")}`;
  }

  /** Returns this runtime's opaque process-local incarnation. */
  getIncarnation(): string {
    return this.incarnation;
  }

  /** Reads one physical durable snapshot without flushing or consulting live events. */
  async readDurableSession(request: SessionExecutionRequest): Promise<DurableSessionSnapshot> {
    const live = this.dependencies.sessions.get(request.sessionId);
    if (live !== undefined && this.owns(request.sessionId) && live.seq === 0) {
      this.requireCwd(live, request);
      return {
        session: live.header,
        events: [],
        incarnation: this.incarnation,
        asOfSeq: -1,
        durableThroughSeq: -1,
      };
    }
    const persisted = await this.dependencies.sessionPersistence.readFrom(request.sessionId, 0);
    this.requirePersistedSnapshot(persisted.meta, persisted.events, request);
    const durableThroughSeq = persisted.events.length - 1;
    return {
      session: persisted.meta,
      events: persisted.events,
      incarnation: this.incarnation,
      asOfSeq: durableThroughSeq,
      durableThroughSeq,
    };
  }

  /** Records stock initialization options only after stock initialization has succeeded. */
  setInitializeOptions(options: InitializeOptions): void {
    this.initializeOptions = { ...options };
  }

  /** Creates one Yishan-owned session with the caller's exact workspace cwd. */
  async start(request: SessionStartRequest): Promise<SessionStartResult> {
    this.requireAdmitted();
    await this.getOrCreate(request.sessionId, request.cwd, "start", request.binding, request.agentOptions);
    return { sessionId: request.sessionId, incarnation: this.incarnation };
  }

  /** Resumes one persisted session into Yishan ownership after checking its durable workspace. */
  async resume(request: SessionExecutionRequest): Promise<void> {
    this.requireAdmitted();
    const existing = this.handles.get(request.sessionId);
    if (existing !== undefined) return this.requireCwd(existing.agent.session, request);
    await this.getOrCreate(request.sessionId, request.cwd, "resume");
  }

  /** Adds text-only prompt blocks as one semantic user message to an owned session. */
  async prompt(request: SessionPromptRequest): Promise<SessionPromptResult> {
    this.requireAdmitted();
    const handle = await this.requireOwnedHandle(request.sessionId);
    this.requireCwd(handle.agent.session, request);
    return this.followup(handle, request.contentBlocks);
  }

  /** Adds a stock prompt to an owned session using only its authoritative handle cwd. */
  async stockPrompt(sessionId: string, contentBlocks: TextPromptContentBlock[]): Promise<SessionPromptResult> {
    this.requireAdmitted();
    const handle = await this.requireOwnedHandle(sessionId);
    this.requireAuthoritativeCwd(handle.agent.session);
    return this.followup(handle, contentBlocks);
  }

  /** Cancels an owned session while retaining its handle and queued inbox. */
  async cancel(request: SessionCancelRequest): Promise<SessionCancelResult> {
    this.requireAdmitted();
    const handle = await this.requireOwnedHandle(request.sessionId);
    this.requireCwd(handle.agent.session, request);
    handle.agent.cancel({ kind: "user" }, { keepInbox: true });
    return { sessionId: request.sessionId, cancelled: true };
  }

  /** Disposes one owned handle, retaining ownership until the handle disposal settles. */
  async disposeSession(request: SessionExecutionRequest): Promise<boolean> {
    this.requireAdmitted();
    await this.creations.get(request.sessionId)?.task;
    const handle = this.handles.get(request.sessionId);
    if (handle === undefined) return false;
    this.requireCwd(handle.agent.session, request);
    const active = this.disposals.get(request.sessionId);
    if (active !== undefined) {
      this.requireTaskCwd(active, request.cwd);
      return await active.task;
    }
    return await this.disposeOwned(request.sessionId, request.cwd);
  }

  /** Flushes one owned session and reports the pre-flush conservative durable cursor. */
  async flushSession(request: SessionFlushRequest): Promise<DurableCursor> {
    this.requireAdmitted();
    return await this.getOrStartFlush(request);
  }

  /** Reads the durable tail after a cursor and reports its physical durable head. */
  async subscribe(request: SessionSubscribeRequest): Promise<SessionSubscribeResult> {
    const live = this.dependencies.sessions.get(request.sessionId);
    if (live !== undefined) this.requireCwd(live, request);
    const owned = this.handles.get(request.sessionId);
    const durabilityTarget = owned === undefined || live === undefined ? undefined : live.seq - 1;
    if (owned !== undefined) await this.flushSession({ cwd: request.cwd, sessionId: request.sessionId });
    if (owned !== undefined && live?.seq === 0 && request.afterSeq === -1) {
      return this.emptySubscribe(request);
    }
    const persisted = await this.dependencies.sessionPersistence.readFrom(request.sessionId, 0);
    this.requirePersistedCwd(persisted.meta.cwd, request);
    this.requireContiguousPersistedEvents(persisted.events);
    const durableThroughSeq = persisted.events.length - 1;
    if (request.afterSeq > durableThroughSeq) throw this.replayResetError();
    if (durabilityTarget !== undefined && durableThroughSeq < durabilityTarget) {
      throw new YishanSessionExecutionError(
        "session persistence did not reach the live durability target",
        "YISHAN_DURABILITY_UNAVAILABLE",
      );
    }
    return {
      sessionId: request.sessionId,
      incarnation: this.incarnation,
      events: persisted.events.filter((event) => event.seq > request.afterSeq),
      asOfSeq: durableThroughSeq,
      durableThroughSeq,
      headSeq: durableThroughSeq,
    };
  }

  /** Starts a coalesced durability checkpoint when an owned turn ends. */
  handleSessionEvent(session: LiveSession, event: SequencedSessionEvent): void {
    if (this.isShuttingDown || !this.handles.has(session.id) || event.type !== "turn/end") return;
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
          !(result.reason instanceof YishanSessionExecutionError && result.reason.code === "YISHAN_SESSION_DISPOSING"),
      )
      .map((result) => result.reason);
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) throw new AggregateError(failures, "failed to shut down Yishan sessions");
  }

  /** Returns an owned live session, excluding sessions being created or disposed. */
  getOwnedLiveSession(sessionId: string): LiveSession | undefined {
    return this.handles.get(sessionId)?.agent.session;
  }

  /** Returns whether this runtime owns a live, creating, or disposing agent identity. */
  owns(sessionId: string): boolean {
    return this.handles.has(sessionId) || this.creations.has(sessionId) || this.disposals.has(sessionId);
  }

  private async getOrCreate(
    sessionId: string,
    cwd: string,
    operation: "start" | "resume",
    binding?: SessionBoundData,
    agentOptions?: { model?: string; provider?: string },
  ): Promise<AgentHandle> {
    const owned = this.handles.get(sessionId);
    if (owned !== undefined) {
      this.requireCwd(owned.agent.session, { sessionId, cwd });
      if (operation === "start") this.requireMatchingBinding(owned.agent.session, binding);
      return owned;
    }
    const creating = this.creations.get(sessionId);
    if (creating !== undefined) {
      this.requireTaskCwd(creating, cwd);
      if (operation === "start") this.requireMatchingBindingData(creating.binding, binding);
      return await creating.task;
    }
    if (this.disposals.has(sessionId)) throw this.disposingError();
    if (
      this.dependencies.agents.get(sessionId) !== undefined ||
      this.dependencies.sessions.get(sessionId) !== undefined
    ) {
      throw new YishanSessionExecutionError("session is owned by stock DSH", "YISHAN_SESSION_COLLISION");
    }
    const task = this.createAndRetain(sessionId, cwd, operation, binding, agentOptions);
    this.creations.set(sessionId, { cwd, binding, task });
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
  ): Promise<AgentHandle> {
    if (operation === "resume") {
      const persisted = await this.dependencies.sessionPersistence.readFrom(sessionId, 0);
      this.requirePersistedCwd(persisted.meta.cwd, { sessionId, cwd });
    }
    const mergedOptions = agentOptions ? { ...this.initializeOptions, ...agentOptions } : this.initializeOptions;
    const handle = await (operation === "start"
      ? this.dependencies.agents.create({ sessionId, meta: { cwd }, agentOptions: mergedOptions })
      : this.dependencies.agents.resume({ resumeSessionId: sessionId, agentOptions: this.initializeOptions }));
    try {
      this.requireAdmitted();
      if (handle.agent.session.id !== sessionId) {
        throw new YishanSessionExecutionError(
          "agent returned a different session identity",
          "YISHAN_SESSION_COLLISION",
        );
      }
      this.requireCwd(handle.agent.session, { sessionId, cwd });
      if (operation === "start") await this.appendAndFlushBinding(handle.agent.session, binding);
      this.handles.set(sessionId, handle);
      return handle;
    } catch (error) {
      await handle.dispose();
      throw error;
    }
  }

  private async appendAndFlushBinding(session: LiveSession, binding: SessionBoundData | undefined): Promise<void> {
    const result = await appendSessionBinding(
      session,
      binding,
      async (boundSession) => await this.dependencies.sessions.flush(boundSession as LiveSession),
    );
    if (result === "conflict") throw this.bindingConflictError();
    if (result === "unavailable") {
      throw new YishanSessionExecutionError(
        "no session durability listener is installed",
        "YISHAN_DURABILITY_UNAVAILABLE",
      );
    }
  }

  private requireMatchingBinding(session: LiveSession, binding: SessionBoundData | undefined): void {
    if (!hasMatchingSessionBinding(session, binding)) throw this.bindingConflictError();
  }

  private requireMatchingBindingData(
    existing: SessionBoundData | undefined,
    binding: SessionBoundData | undefined,
  ): void {
    if (!hasSameSessionBinding(existing, binding)) throw this.bindingConflictError();
  }

  private async getOrStartFlush(request: SessionFlushRequest): Promise<DurableCursor> {
    if (this.disposals.has(request.sessionId)) throw this.disposingError();
    const active = this.flushes.get(request.sessionId);
    if (active !== undefined) {
      this.requireTaskCwd(active, request.cwd);
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
    this.requireCwd(handle.agent.session, request);
    return await this.flushHandle(request.sessionId, handle);
  }

  private async flushHandle(sessionId: string, handle: AgentHandle): Promise<DurableCursor> {
    const durableThroughSeq = handle.agent.session.seq - 1;
    if ((await this.dependencies.sessions.flush(handle.agent.session)) !== true) {
      throw new YishanSessionExecutionError(
        "no session durability listener is installed",
        "YISHAN_DURABILITY_UNAVAILABLE",
      );
    }
    const cursor = { sessionId, durableThroughSeq, incarnation: this.incarnation };
    this.dependencies.notify(YISHAN_NOTIFICATIONS.durableCursor, cursor);
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
    if (this.handles.get(sessionId) === handle) this.handles.delete(sessionId);
    return true;
  }

  private async disposeForShutdown(sessionId: string): Promise<boolean> {
    const handle = this.handles.get(sessionId);
    if (handle === undefined) return false;
    const cwd = this.requireAuthoritativeCwd(handle.agent.session);
    const active = this.disposals.get(sessionId);
    if (active !== undefined) return await active.task;
    return await this.disposeOwned(sessionId, cwd);
  }

  private async requireOwnedHandle(sessionId: string): Promise<AgentHandle> {
    if (this.disposals.has(sessionId)) throw this.disposingError();
    await this.creations.get(sessionId)?.task;
    if (this.disposals.has(sessionId)) throw this.disposingError();
    const handle = this.handles.get(sessionId);
    if (handle === undefined)
      throw new YishanSessionExecutionError("session is owned by stock DSH", "YISHAN_SESSION_COLLISION");
    return handle;
  }

  private followup(handle: AgentHandle, contentBlocks: TextPromptContentBlock[]): SessionPromptResult {
    const message = createUserMessage({ content: contentBlocks, source: { kind: "user" } });
    handle.agent.followup(message);
    return { messageId: message.id };
  }

  private requireAdmitted(): void {
    if (this.isShuttingDown) throw this.disposingError();
  }

  private requireCwd(session: LiveSession, request: SessionExecutionRequest): void {
    this.requirePersistedCwd(session.header.cwd, request);
  }

  private requireAuthoritativeCwd(session: LiveSession): string {
    if (session.header.cwd === undefined) {
      throw new YishanSessionExecutionError("owned session has no workspace", "YISHAN_SESSION_WORKSPACE_MISMATCH");
    }
    return session.header.cwd;
  }

  private requirePersistedSnapshot(
    header: SessionHeader,
    events: readonly SessionEvent[],
    request: SessionExecutionRequest,
  ): void {
    if (header.id !== request.sessionId) {
      throw new YishanSessionExecutionError("persisted session identity does not match", "YISHAN_SESSION_COLLISION");
    }
    this.requirePersistedCwd(header.cwd, request);
    this.requireContiguousPersistedEvents(events);
  }

  private requireContiguousPersistedEvents(events: readonly SessionEvent[]): void {
    if (!events.every((event, index) => Number.isSafeInteger(event.seq) && event.seq === index)) {
      throw new YishanSessionExecutionError(
        "persisted session events are not contiguous",
        "YISHAN_DURABILITY_UNAVAILABLE",
      );
    }
  }

  private requirePersistedCwd(cwd: string | undefined, request: SessionExecutionRequest): void {
    if (cwd === undefined || cwd !== request.cwd) {
      throw new YishanSessionExecutionError(
        "session does not belong to the current workspace",
        "YISHAN_SESSION_WORKSPACE_MISMATCH",
      );
    }
  }

  private requireTaskCwd(task: CwdTask<unknown>, cwd: string): void {
    if (task.cwd !== cwd) {
      throw new YishanSessionExecutionError(
        "session does not belong to the current workspace",
        "YISHAN_SESSION_WORKSPACE_MISMATCH",
      );
    }
  }

  private emptySubscribe(request: SessionSubscribeRequest): SessionSubscribeResult {
    return {
      sessionId: request.sessionId,
      incarnation: this.incarnation,
      events: [],
      asOfSeq: -1,
      durableThroughSeq: -1,
      headSeq: -1,
    };
  }

  private replayResetError(): YishanSessionExecutionError {
    return new YishanSessionExecutionError(
      "session replay cursor is no longer available; reset the transcript",
      "YISHAN_SESSION_REPLAY_RESET_REQUIRED",
    );
  }

  private bindingConflictError(): YishanSessionExecutionError {
    return new YishanSessionExecutionError(
      "session binding conflicts with existing session",
      "YISHAN_SESSION_BINDING_CONFLICT",
    );
  }

  private disposingError(): YishanSessionExecutionError {
    return new YishanSessionExecutionError("session execution is disposing", "YISHAN_SESSION_DISPOSING");
  }
}
