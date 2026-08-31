import type { Context } from "@deepseek-ai/cordis";
import type { SessionEvent } from "@deepseek-ai/dsh-session";

import {
  type SessionBoundData,
  appendSessionBinding,
  hasMatchingSessionBinding,
  hasSameSessionBinding,
  isSessionBoundEvent,
  parseSessionBoundData,
} from "./binding";
import { SessionExecutionError } from "./errors";
import type { LiveSession } from "./types";

/** Resolves the daemon workspace binding for a new or persisted session. */
export function getWorkspaceBinding(
  operation: "start" | "resume",
  binding: SessionBoundData | undefined,
  persistedEvents: readonly SessionEvent[] | undefined,
): SessionBoundData {
  if (operation === "start" && binding !== undefined) return parseSessionBoundData(binding);
  const persistedBinding = persistedEvents?.[0];
  if (persistedBinding?.seq !== 0 || !isSessionBoundEvent(persistedBinding)) {
    throw new SessionExecutionError("session has no daemon workspace binding", "YISHAN_SESSION_BINDING_CONFLICT");
  }
  return parseSessionBoundData(persistedBinding.data);
}

/** Appends the daemon binding to a newly-created session's durable transcript. */
export async function persistSessionMetadata(
  ctx: Context,
  session: LiveSession,
  binding: SessionBoundData | undefined,
): Promise<void> {
  const result = await appendSessionBinding(
    session,
    binding,
    async (boundSession) => await ctx.sessions.flush(boundSession),
  );
  if (result === "conflict") {
    throw new SessionExecutionError(
      "session binding conflicts with existing session",
      "YISHAN_SESSION_BINDING_CONFLICT",
    );
  }
  if (result === "unavailable") {
    throw new SessionExecutionError("no session durability listener is installed", "YISHAN_DURABILITY_UNAVAILABLE");
  }
}

/** Rejects a request whose binding conflicts with an owned live session. */
export function requireMatchingBinding(session: LiveSession, binding: SessionBoundData | undefined): void {
  if (!hasMatchingSessionBinding(session, binding)) {
    throw new SessionExecutionError(
      "session binding conflicts with existing session",
      "YISHAN_SESSION_BINDING_CONFLICT",
    );
  }
}

/** Rejects a request whose binding conflicts with an in-flight session creation. */
export function requireMatchingBindingData(
  existing: SessionBoundData | undefined,
  binding: SessionBoundData | undefined,
): void {
  if (!hasSameSessionBinding(existing, binding)) {
    throw new SessionExecutionError(
      "session binding conflicts with existing session",
      "YISHAN_SESSION_BINDING_CONFLICT",
    );
  }
}
