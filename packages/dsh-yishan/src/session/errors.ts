/** Stable machine-readable codes for Yishan-owned session execution failures. */
export type SessionExecutionErrorCode =
  | "YISHAN_DURABILITY_UNAVAILABLE"
  | "YISHAN_SESSION_COLLISION"
  | "YISHAN_SESSION_DISPOSING"
  | "YISHAN_SESSION_WORKSPACE_MISMATCH"
  | "YISHAN_SESSION_REPLAY_RESET_REQUIRED"
  | "YISHAN_SESSION_BINDING_CONFLICT";

/**
 * Failure raised while operating on a Yishan-owned live DSH session.
 *
 * This name distinguishes execution failures from the public protocol `SessionError`.
 */
export class SessionExecutionError extends Error {
  /** Stable machine-readable execution failure code. */
  readonly code: SessionExecutionErrorCode;

  /** Creates one typed execution failure. */
  constructor(message: string, code: SessionExecutionErrorCode) {
    super(message);
    this.name = "SessionExecutionError";
    this.code = code;
  }
}
