import type {} from "@deepseek-ai/dsh-agent";
import type { SessionId } from "@deepseek-ai/dsh-session";
import type { SessionLogSnapshot, SessionRecord } from "@deepseek-ai/dsh-session-query";

import {
  parseSessionCancelRequest,
  parseSessionFlushRequest,
  parseSessionPromptRequest,
  parseSessionStartRequest,
  parseSessionSubscribeRequest,
} from "./executionContracts";
import { YISHAN_METHODS } from "./protocol";
import {
  type SessionDisposeResult,
  type SessionHeaderResult,
  type SessionListResult,
  type SessionReadRequest,
  type SessionReadResult,
  type SessionResumeResult,
  parseSessionDisposeRequest,
  parseSessionListRequest,
  parseSessionReadRequest,
  parseSessionResumeRequest,
} from "./sessionContracts";

/** Error codes returned by the corrected Phase 2 session extension. */
export type YishanSessionErrorCode =
  | "YISHAN_SESSION_ID_MISMATCH"
  | "YISHAN_SESSION_NOT_PERSISTED"
  | "YISHAN_SESSION_WORKSPACE_MISMATCH"
  | "YISHAN_UNSUPPORTED_METHOD";

/** Base typed error for a Yishan session extension request failure. */
export class YishanSessionError extends Error {
  /** Machine-readable extension error code. */
  readonly code: YishanSessionErrorCode;

  /** Creates a typed Yishan session extension error. */
  constructor(message: string, code: YishanSessionErrorCode) {
    super(message);
    this.name = "YishanSessionError";
    this.code = code;
  }
}

/** Raised when DSH returns a different session than the requested identity. */
export class YishanSessionIdMismatchError extends YishanSessionError {
  /** Creates an identity-mismatch error. */
  constructor() {
    super("session query returned a different session", "YISHAN_SESSION_ID_MISMATCH");
    this.name = "YishanSessionIdMismatchError";
  }
}

/** Raised when a session header does not belong to the requested workspace. */
export class YishanSessionWorkspaceMismatchError extends YishanSessionError {
  /** Creates a workspace-mismatch error without disclosing another workspace path. */
  constructor(sessionId: string) {
    super(`session does not belong to the current workspace: ${sessionId}`, "YISHAN_SESSION_WORKSPACE_MISMATCH");
    this.name = "YishanSessionWorkspaceMismatchError";
  }
}

/** Raised when a session cannot be cold-resumed from DSH persistence. */
export class YishanSessionNotPersistedError extends YishanSessionError {
  /** Creates a persistence error. */
  constructor(sessionId: string) {
    super(`session is not persisted: ${sessionId}`, "YISHAN_SESSION_NOT_PERSISTED");
    this.name = "YishanSessionNotPersistedError";
  }
}

/** Raised when the handler receives an unsupported Yishan extension method. */
export class YishanUnsupportedMethodError extends YishanSessionError {
  /** Creates an unsupported-method error. */
  constructor(method: string) {
    super(`unsupported Yishan protocol method: ${method}`, "YISHAN_UNSUPPORTED_METHOD");
    this.name = "YishanUnsupportedMethodError";
  }
}

/** DSH services required by the workspace-scoped Yishan session handler. */
export type YishanSessionHandlerDependencies = {
  sessionQuery: {
    listSessions(): Promise<SessionRecord[]>;
    readSession(sessionId: SessionId): Promise<SessionLogSnapshot>;
  };
  resumeSession(sessionId: SessionId): Promise<void>;
  disposeSession(sessionId: SessionId): Promise<boolean>;
  execution?: {
    start(request: ReturnType<typeof parseSessionStartRequest>): Promise<unknown>;
    prompt(request: ReturnType<typeof parseSessionPromptRequest>): Promise<unknown>;
    cancel(request: ReturnType<typeof parseSessionCancelRequest>): Promise<unknown>;
    flushSession(request: ReturnType<typeof parseSessionFlushRequest>): Promise<unknown>;
    subscribe(request: ReturnType<typeof parseSessionSubscribeRequest>): Promise<unknown>;
    readDurableSession(request: SessionReadRequest): Promise<{
      session: { id: string; createdAt: number; parentSession?: string; agentPreset?: string };
      events: SessionReadResult["events"];
      incarnation: string;
      asOfSeq: number;
      durableThroughSeq: number;
    }>;
    resume(request: ReturnType<typeof parseSessionResumeRequest>): Promise<void>;
    disposeSession(request: ReturnType<typeof parseSessionDisposeRequest>): Promise<boolean>;
  };
};

/** Handles corrected Phase 2 workspace-scoped session requests through DSH services. */
export function createSessionHandler(dependencies: YishanSessionHandlerDependencies) {
  return async (method: string, params: Record<string, unknown>): Promise<unknown> => {
    switch (method) {
      case YISHAN_METHODS.cancel:
        return await requireExecution(dependencies).cancel(parseSessionCancelRequest(params));
      case YISHAN_METHODS.dispose:
        return dependencies.execution === undefined
          ? await handleDispose(dependencies, params)
          : {
              sessionId: parseSessionDisposeRequest(params).sessionId,
              disposed: await dependencies.execution.disposeSession(parseSessionDisposeRequest(params)),
            };
      case YISHAN_METHODS.flush:
        return await requireExecution(dependencies).flushSession(parseSessionFlushRequest(params));
      case YISHAN_METHODS.prompt:
        return await requireExecution(dependencies).prompt(parseSessionPromptRequest(params));
      case YISHAN_METHODS.start:
        return await requireExecution(dependencies).start(parseSessionStartRequest(params));
      case YISHAN_METHODS.subscribe:
        return await requireExecution(dependencies).subscribe(parseSessionSubscribeRequest(params));
      case YISHAN_METHODS.list:
        return await handleList(dependencies, params);
      case YISHAN_METHODS.read:
        return await handleRead(dependencies, params);
      case YISHAN_METHODS.resume:
        return await handleResume(dependencies, params);
      default:
        throw new YishanUnsupportedMethodError(method);
    }
  };
}

async function handleDispose(
  dependencies: YishanSessionHandlerDependencies,
  params: Record<string, unknown>,
): Promise<SessionDisposeResult> {
  const request = parseSessionDisposeRequest(params);
  const snapshot = await readWorkspaceSession(dependencies, request);
  const disposed = await dependencies.disposeSession(snapshot.session.id);
  return { sessionId: snapshot.session.id, disposed };
}

async function handleList(
  dependencies: YishanSessionHandlerDependencies,
  params: Record<string, unknown>,
): Promise<SessionListResult> {
  const request = parseSessionListRequest(params);
  const sessions = await dependencies.sessionQuery.listSessions();
  return {
    sessions: sessions
      .filter(({ header }) => header.cwd === request.cwd && (header.delegationDepth ?? 0) === 0)
      .map(({ header, live, persisted }) => ({ ...createSessionHeaderResult(header), live, persisted })),
  };
}

async function handleRead(
  dependencies: YishanSessionHandlerDependencies,
  params: Record<string, unknown>,
): Promise<SessionReadResult> {
  const request = parseSessionReadRequest(params);
  const snapshot = await requireExecution(dependencies).readDurableSession(request);
  return {
    session: createSessionHeaderResult(snapshot.session),
    events: snapshot.events,
    incarnation: snapshot.incarnation,
    asOfSeq: snapshot.asOfSeq,
    durableThroughSeq: snapshot.durableThroughSeq,
  };
}

async function handleResume(
  dependencies: YishanSessionHandlerDependencies,
  params: Record<string, unknown>,
): Promise<SessionResumeResult> {
  const request = parseSessionResumeRequest(params);
  if (dependencies.execution !== undefined) {
    await dependencies.execution.resume(request);
    return { sessionId: request.sessionId };
  }
  const snapshot = await readWorkspaceSession(dependencies, request);
  const records = await dependencies.sessionQuery.listSessions();
  const record = records.find(({ header }) => header.id === snapshot.session.id);
  if (record?.persisted !== true) throw new YishanSessionNotPersistedError(request.sessionId);
  if (!record.live) await dependencies.resumeSession(snapshot.session.id);
  return { sessionId: snapshot.session.id };
}

async function readWorkspaceSession(
  dependencies: YishanSessionHandlerDependencies,
  request: SessionReadRequest,
): Promise<SessionLogSnapshot> {
  const snapshot = await dependencies.sessionQuery.readSession(request.sessionId as SessionId);
  if (snapshot.session.id !== request.sessionId) throw new YishanSessionIdMismatchError();
  if (snapshot.session.cwd !== request.cwd) throw new YishanSessionWorkspaceMismatchError(request.sessionId);
  return snapshot;
}

function createSessionHeaderResult(header: {
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

function requireExecution(
  dependencies: YishanSessionHandlerDependencies,
): NonNullable<YishanSessionHandlerDependencies["execution"]> {
  if (dependencies.execution === undefined)
    throw new YishanUnsupportedMethodError("session execution is not configured");
  return dependencies.execution;
}
