import { KNOWN_SESSION_EVENT_TYPES, type Session, type SessionEvent } from "@deepseek-ai/dsh-session";

import type { WireRecord } from "../shared/validation";
import { type SessionBoundData, type WorkspaceBindingPolicy, sessionBoundDataSchema } from "./schemas";

export type { SessionBoundData, WorkspaceBindingPolicy };

declare module "@deepseek-ai/dsh-session/types" {
  interface SessionEventMap {
    "yishan/session-bound.v1": SessionBoundData;
  }
}

/** Registers Yishan's required event types with the rc.2 persistence reader. */
export function registerSessionEventTypes(): void {
  if (!(KNOWN_SESSION_EVENT_TYPES instanceof Set)) return;
  const knownEventTypes = KNOWN_SESSION_EVENT_TYPES as Set<string>;
  knownEventTypes.add("yishan/session-bound.v1");
}

/** Parses data persisted for a session-bound event. */
export function parseSessionBoundData(payload: unknown): SessionBoundData {
  return sessionBoundDataSchema.parse(payload);
}

/** Appends a binding only to an empty session and reports whether persistence accepted its flush. */
export async function appendSessionBinding(
  session: Session,
  binding: SessionBoundData | undefined,
  flush: (session: Session) => Promise<boolean>,
): Promise<"conflict" | "unavailable" | "persisted"> {
  if (binding === undefined || session.seq !== 0 || session.events.length !== 0) return "conflict";
  session.append("yishan/session-bound.v1", binding);
  return (await flush(session)) === true ? "persisted" : "unavailable";
}

/** Returns whether the session's first event is the exact requested binding. */
export function hasMatchingSessionBinding(session: Session, binding: SessionBoundData | undefined): boolean {
  const firstEvent = session.events[0];
  return (
    binding !== undefined &&
    firstEvent?.seq === 0 &&
    isSessionBoundEvent(firstEvent) &&
    hasSameSessionBinding(firstEvent.data, binding)
  );
}

/** Returns whether both bindings have exactly equal contract fields. */
export function hasSameSessionBinding(existing: unknown, binding: unknown): boolean {
  const normalizedExisting = parseBindingForComparison(existing);
  const normalizedBinding = parseBindingForComparison(binding);
  return (
    normalizedExisting !== undefined &&
    normalizedBinding !== undefined &&
    normalizedExisting.version === normalizedBinding.version &&
    normalizedExisting.workspaceId === normalizedBinding.workspaceId &&
    normalizedExisting.projectId === normalizedBinding.projectId &&
    normalizedExisting.organizationId === normalizedBinding.organizationId &&
    normalizedExisting.ownerNodeId === normalizedBinding.ownerNodeId &&
    normalizedExisting.cwd === normalizedBinding.cwd &&
    normalizedExisting.policy.authorization === normalizedBinding.policy.authorization
  );
}

/** Returns whether an event is a strictly valid Yishan session-bound event. */
export function isSessionBoundEvent(event: unknown): event is SessionEvent & {
  type: "yishan/session-bound.v1";
  data: SessionBoundData;
} {
  return isSessionEvent(event, "yishan/session-bound.v1", parseSessionBoundData);
}

function isSessionEvent<T>(event: unknown, type: string, parseData: (payload: unknown) => T): boolean {
  if (event === null || typeof event !== "object" || Array.isArray(event)) return false;
  const sessionEvent = event as WireRecord;
  if (sessionEvent.type !== type) return false;
  try {
    parseData(sessionEvent.data);
    return true;
  } catch {
    return false;
  }
}

function parseBindingForComparison(binding: unknown): SessionBoundData | undefined {
  if (binding === undefined) return undefined;
  try {
    return parseSessionBoundData(binding);
  } catch {
    return undefined;
  }
}
