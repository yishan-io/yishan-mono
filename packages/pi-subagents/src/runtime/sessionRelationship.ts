import type { AgentResult, AgentRunMode, AgentUsageStats } from "../agents/types";

const CHILD_SESSION_CUSTOM_TYPE = "pi-subagent-parent";
const PARENT_SESSION_CUSTOM_TYPE = "pi-subagent-child";
const METADATA_VERSION = 1;
const MAX_TITLE_LENGTH = 80;
const MAX_SUMMARY_LENGTH = 240;

/** Durable reference to one persisted Pi parent session. */
export interface ParentSessionReference {
  sessionId: string;
  sessionPath: string;
  cwd: string;
}

/** Human-readable metadata for one delegated child session. */
export interface ChildSessionDescriptor {
  title: string;
  summary?: string;
}

/** Structured metadata persisted on one child session. */
export interface ChildSessionMetadata extends ChildSessionDescriptor {
  version: number;
  sessionKind: "subagent";
  agentId: string;
  agentName: string;
  mode: AgentRunMode;
  parentSessionId?: string;
  parentSessionPath?: string;
  childSessionId: string;
  childSessionPath?: string;
}

/** Structured lifecycle entry persisted on one parent session for a child run. */
export interface ParentSessionChildEntry extends ChildSessionDescriptor {
  version: number;
  event: "started" | "completed";
  agentId: string;
  agentName: string;
  mode: AgentRunMode;
  parentSessionId?: string;
  parentSessionPath?: string;
  childSessionId: string;
  childSessionPath?: string;
  status?: AgentResult["status"];
  createdAt?: string;
  completedAt?: string;
  usage?: AgentUsageStats;
}

/** Callback surface for recording parent-session child references. */
export interface ParentSessionWriter {
  recordChildSessionStarted(entry: ParentSessionChildEntry): void;
  recordChildSessionCompleted(entry: ParentSessionChildEntry): void;
}

interface ReadonlySessionManagerLike {
  getSessionId(): string;
  getSessionFile(): string | undefined;
}

interface MutableSessionManagerLike extends ReadonlySessionManagerLike {
  appendCustomEntry(customType: string, data?: unknown): string;
  appendSessionInfo?(name: string): string;
}

/**
 * Builds stable title/summary metadata for one child session from the delegated prompt.
 */
export function buildChildSessionDescriptor(agentName: string, prompt: string): ChildSessionDescriptor {
  const normalizedPrompt = normalizeWhitespace(prompt);
  const title =
    normalizedPrompt.length === 0 ? agentName : `${agentName} — ${truncateText(normalizedPrompt, MAX_TITLE_LENGTH)}`;

  return {
    title,
    summary: normalizedPrompt.length > 0 ? truncateText(normalizedPrompt, MAX_SUMMARY_LENGTH) : undefined,
  };
}

/**
 * Extracts a persisted parent-session reference from the current main-session manager when available.
 */
export function getParentSessionReference(
  sessionManager: ReadonlySessionManagerLike,
  cwd: string,
): ParentSessionReference | undefined {
  const sessionId = sessionManager.getSessionId();
  const sessionPath = sessionManager.getSessionFile();
  if (!sessionId || !sessionPath) {
    return undefined;
  }

  return {
    sessionId,
    sessionPath,
    cwd,
  };
}

/**
 * Creates a best-effort writer that appends parent-session child-reference entries when mutation APIs are available.
 */
export function createParentSessionWriter(sessionManager: ReadonlySessionManagerLike): ParentSessionWriter | undefined {
  if (!isMutableSessionManager(sessionManager)) {
    return undefined;
  }

  return {
    recordChildSessionStarted(entry) {
      sessionManager.appendCustomEntry(PARENT_SESSION_CUSTOM_TYPE, {
        ...entry,
        version: METADATA_VERSION,
        event: "started",
      } satisfies ParentSessionChildEntry);
    },
    recordChildSessionCompleted(entry) {
      sessionManager.appendCustomEntry(PARENT_SESSION_CUSTOM_TYPE, {
        ...entry,
        version: METADATA_VERSION,
        event: "completed",
      } satisfies ParentSessionChildEntry);
    },
  };
}

/**
 * Appends child-session metadata entries onto the child session itself.
 */
export function recordChildSessionMetadata(
  sessionManager: MutableSessionManagerLike,
  metadata: ChildSessionMetadata,
): void {
  if (typeof sessionManager.appendSessionInfo === "function") {
    sessionManager.appendSessionInfo(metadata.title);
  }

  sessionManager.appendCustomEntry(CHILD_SESSION_CUSTOM_TYPE, {
    ...metadata,
    version: METADATA_VERSION,
  } satisfies ChildSessionMetadata);
}

function isMutableSessionManager(
  sessionManager: ReadonlySessionManagerLike,
): sessionManager is MutableSessionManagerLike {
  return typeof (sessionManager as MutableSessionManagerLike).appendCustomEntry === "function";
}

function normalizeWhitespace(text: string): string {
  return text.replaceAll(/\s+/g, " ").trim();
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3)}...`;
}
