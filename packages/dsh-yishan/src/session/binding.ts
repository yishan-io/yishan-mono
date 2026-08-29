import { KNOWN_SESSION_EVENT_TYPES, type Session, type SessionEvent } from "@deepseek-ai/dsh-session";

import { type WireRecord, requireExactRecord, requireNonEmptyString } from "../shared/validation";

declare module "@deepseek-ai/dsh-session/types" {
  interface SessionEventMap {
    "yishan/session-bound.v1": SessionBoundData;
  }
}

/** Durable workspace ownership record appended as the first Yishan session event. */
export type SessionBoundData = {
  version: 1;
  workspaceId: string;
  projectId: string;
  organizationId: string;
  ownerNodeId: string;
  cwd: string;
};

/** Registers Yishan's required event types with the rc.2 persistence reader. */
export function registerSessionEventTypes(): void {
  if (!(KNOWN_SESSION_EVENT_TYPES instanceof Set)) return;
  const knownEventTypes = KNOWN_SESSION_EVENT_TYPES as Set<string>;
  knownEventTypes.add("yishan/session-bound.v1");
}

/** Parses the exact data payload for a session-bound event. */
export function parseSessionBoundData(payload: unknown): SessionBoundData {
  const bound = requireExactRecord(payload, "session bound data", [
    "version",
    "workspaceId",
    "projectId",
    "organizationId",
    "ownerNodeId",
    "cwd",
  ]);
  return {
    version: requireVersion(bound),
    workspaceId: requireNonEmptyString(bound, "workspaceId"),
    projectId: requireString(bound, "projectId"),
    organizationId: requireString(bound, "organizationId"),
    ownerNodeId: requireNonEmptyString(bound, "ownerNodeId"),
    cwd: requireNonEmptyString(bound, "cwd"),
  };
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

/** Returns whether an event is a strictly valid Yishan session-bound event. */
export function isSessionBoundEvent(
  event: unknown,
): event is SessionEvent & { type: "yishan/session-bound.v1"; data: SessionBoundData } {
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

function requireVersion(record: Record<string, unknown>): 1 {
  if (record.version !== 1) throw new TypeError("version must equal 1");
  return 1;
}

function requireString(record: Record<string, unknown>, field: string): string {
  if (typeof record[field] !== "string") throw new TypeError(`${field} must be a string`);
  return record[field];
}
