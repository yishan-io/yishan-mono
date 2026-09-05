import type { Context } from "@deepseek-ai/cordis";
import type { SessionEvent } from "@deepseek-ai/dsh-session";
import type {} from "@yishan-io/dsh-workspace";

import { SessionExecutionError } from "./errors";
import type { SessionExecutionRequest } from "./protocol";
import type { CwdTask, LiveSession } from "./types";

/** Rejects a durable transcript whose sequence is not contiguous from zero. */
export function requireContiguousPersistedEvents(events: readonly SessionEvent[]): void {
  if (!events.every((event, index) => Number.isSafeInteger(event.seq) && event.seq === index)) {
    throw new SessionExecutionError("persisted session events are not contiguous", "YISHAN_DURABILITY_UNAVAILABLE");
  }
}

/** Verifies a session's plugin-owned workspace identity. */
export function requirePluginWorkspaceId(ctx: Context, sessionId: string, workspaceId: string | undefined): void {
  try {
    if (workspaceId === undefined) throw new Error("workspace identity is required");
    ctx.yishanWorkspaceBindingHost.assertSessionWorkspace(sessionId, workspaceId);
  } catch {
    throw new SessionExecutionError(
      "session does not belong to the current workspace",
      "YISHAN_SESSION_WORKSPACE_MISMATCH",
    );
  }
}

/** Verifies an in-flight task uses the caller's workspace cwd. */
export function requireTaskCwd(task: CwdTask<unknown>, cwd: string): void {
  if (task.cwd !== cwd) {
    throw new SessionExecutionError(
      "session does not belong to the current workspace",
      "YISHAN_SESSION_WORKSPACE_MISMATCH",
    );
  }
}

/** Verifies a session belongs to the caller's workspace cwd. */
export function requireCwd(cwd: string | undefined, request: SessionExecutionRequest): void {
  if (cwd === undefined || cwd !== request.cwd) {
    throw new SessionExecutionError(
      "session does not belong to the current workspace",
      "YISHAN_SESSION_WORKSPACE_MISMATCH",
    );
  }
}

/** Reads the authoritative cwd from an owned live session. */
export function requireAuthoritativeCwd(session: LiveSession): string {
  if (session.header.cwd === undefined) {
    throw new SessionExecutionError("owned session has no workspace", "YISHAN_SESSION_WORKSPACE_MISMATCH");
  }
  return session.header.cwd;
}
