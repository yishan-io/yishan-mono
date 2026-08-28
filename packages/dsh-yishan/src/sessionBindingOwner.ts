import type { SessionEvent } from "@deepseek-ai/dsh-session";

import { type SessionBoundData, isYishanSessionBoundEvent } from "./sessionBindingContracts";

/** The session surface needed to append and inspect the initial binding record. */
export type BoundSession = {
  seq: number;
  events: readonly SessionEvent[];
  append(type: "yishan/session-bound.v1", data: SessionBoundData): SessionEvent;
};

/** Appends a binding only to an empty session and reports whether persistence accepted its flush. */
export async function appendSessionBinding(
  session: BoundSession,
  binding: SessionBoundData | undefined,
  flush: (session: BoundSession) => Promise<boolean>,
): Promise<"conflict" | "unavailable" | "persisted"> {
  if (binding === undefined || session.seq !== 0 || session.events.length !== 0) return "conflict";
  session.append("yishan/session-bound.v1", binding);
  return (await flush(session)) === true ? "persisted" : "unavailable";
}

/** Returns whether the session's first event is the exact requested binding. */
export function hasMatchingSessionBinding(session: BoundSession, binding: SessionBoundData | undefined): boolean {
  const firstEvent = session.events[0];
  return (
    binding !== undefined &&
    firstEvent?.seq === 0 &&
    isYishanSessionBoundEvent(firstEvent) &&
    hasSameSessionBinding(firstEvent.data, binding)
  );
}

/** Returns whether both bindings have exactly equal contract fields. */
export function hasSameSessionBinding(
  existing: SessionBoundData | undefined,
  binding: SessionBoundData | undefined,
): boolean {
  return (
    existing !== undefined &&
    binding !== undefined &&
    existing.version === binding.version &&
    existing.workspaceId === binding.workspaceId &&
    existing.projectId === binding.projectId &&
    existing.organizationId === binding.organizationId &&
    existing.ownerNodeId === binding.ownerNodeId &&
    existing.cwd === binding.cwd
  );
}
