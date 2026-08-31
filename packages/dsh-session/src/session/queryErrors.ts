/** Error codes returned by the corrected Phase 2 session extension. */
export type SessionErrorCode =
  | "YISHAN_SESSION_ID_MISMATCH"
  | "YISHAN_SESSION_NOT_FOUND"
  | "YISHAN_SESSION_NOT_PERSISTED"
  | "YISHAN_SESSION_WORKSPACE_MISMATCH"
  | "YISHAN_UNSUPPORTED_METHOD";

/** Base typed error for a Yishan session extension request failure. */
export class SessionError extends Error {
  /** Machine-readable extension error code. */
  readonly code: SessionErrorCode;

  /** Creates a typed Yishan session extension error. */
  constructor(message: string, code: SessionErrorCode) {
    super(message);
    this.name = "SessionError";
    this.code = code;
  }
}

/** Raised when DSH returns a different session than the requested identity. */
export class SessionIdMismatchError extends SessionError {
  /** Creates an identity-mismatch error. */
  constructor() {
    super("session query returned a different session", "YISHAN_SESSION_ID_MISMATCH");
    this.name = "SessionIdMismatchError";
  }
}

/** Raised when a session header does not belong to the requested workspace. */
export class SessionWorkspaceMismatchError extends SessionError {
  /** Creates a workspace-mismatch error without disclosing another workspace path. */
  constructor(sessionId: string) {
    super(`session does not belong to the current workspace: ${sessionId}`, "YISHAN_SESSION_WORKSPACE_MISMATCH");
    this.name = "SessionWorkspaceMismatchError";
  }
}

/** Raised when a requested session cannot be found in the DSH session query. */
export class SessionNotFoundError extends SessionError {
  /** Creates a missing-session error. */
  constructor(sessionId: string) {
    super(`session does not exist: ${sessionId}`, "YISHAN_SESSION_NOT_FOUND");
    this.name = "SessionNotFoundError";
  }
}

/** Raised when a session cannot be cold-resumed from DSH persistence. */
export class SessionNotPersistedError extends SessionError {
  /** Creates a persistence error. */
  constructor(sessionId: string) {
    super(`session is not persisted: ${sessionId}`, "YISHAN_SESSION_NOT_PERSISTED");
    this.name = "SessionNotPersistedError";
  }
}

/** Raised when the handler receives an unsupported Yishan extension method. */
export class UnsupportedMethodError extends SessionError {
  /** Creates an unsupported-method error. */
  constructor(method: string) {
    super(`unsupported Yishan protocol method: ${method}`, "YISHAN_UNSUPPORTED_METHOD");
    this.name = "UnsupportedMethodError";
  }
}

/** Stable in-process code for stock execution paths denied by the Yishan runtime boundary. */
export type RequestPolicyErrorCode = "YISHAN_STOCK_SESSION_EXECUTION_DENIED";

/**
 * Stable stdio error-message prefix for stock session execution policy denials.
 *
 * The pinned `JsonRpcLineTransport` serializes rejected handlers as `-32603`
 * errors without JSON-RPC error data. Stdio clients must match this prefix.
 */
export const YISHAN_REQUEST_POLICY_DENIAL_MESSAGE = "YISHAN_STOCK_SESSION_EXECUTION_DENIED";

/** Raised when stock DSH session execution would bypass Yishan session ownership. */
export class RequestPolicyError extends Error {
  /** Stable in-process policy-denial code; it is not serialized as JSON-RPC error data. */
  readonly code: RequestPolicyErrorCode = YISHAN_REQUEST_POLICY_DENIAL_MESSAGE;

  /** Creates a stock session execution policy denial. */
  constructor(method: string) {
    super(`${YISHAN_REQUEST_POLICY_DENIAL_MESSAGE}: stock DSH session execution is denied by Yishan policy: ${method}`);
    this.name = "RequestPolicyError";
  }
}
