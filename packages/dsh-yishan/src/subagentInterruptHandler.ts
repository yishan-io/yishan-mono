import type { SessionId } from "@deepseek-ai/dsh-session";
import type { SessionRecord } from "@deepseek-ai/dsh-session-query";
import type { SubagentListEntry } from "@deepseek-ai/dsh-subagent";

import {
  type SubagentInterruptRequest,
  type SubagentInterruptResult,
  parseSubagentInterruptRequest,
} from "./subagentInterruptContracts";

/** Typed denial from the direct-subagent interrupt extension. */
export class YishanSubagentInterruptError extends Error {
  /** Stable machine-readable denial code. */
  readonly code: "YISHAN_PARENT_NOT_OWNED" | "YISHAN_PARENT_WORKSPACE_MISMATCH" | "YISHAN_CHILD_LINEAGE_DENIED";

  /** Creates a direct-subagent interrupt denial. */
  constructor(message: string, code: YishanSubagentInterruptError["code"]) {
    super(message);
    this.name = "YishanSubagentInterruptError";
    this.code = code;
  }
}

/** Services required to authorize and dispatch one direct-subagent interrupt. */
export type YishanSubagentInterruptDependencies = {
  execution: { getOwnedLiveSession(sessionId: string): { header: { cwd?: string } } | undefined };
  sessionQuery: { listSessions(): Promise<SessionRecord[]> };
  subagents: {
    listChildren(parentSessionId: SessionId): Promise<SubagentListEntry[]>;
    interrupt(childSessionId: SessionId, authority: { kind: "user"; parentSessionId: SessionId }): void;
  };
};

/** Creates the public runtime handler for direct Yishan-owned child interruption. */
export function createSubagentInterruptHandler(dependencies: YishanSubagentInterruptDependencies) {
  return async (payload: unknown): Promise<SubagentInterruptResult> => {
    const request = parseSubagentInterruptRequest(payload);
    authorizeParent(dependencies, request);
    const [children, sessionRecords] = await Promise.all([
      dependencies.subagents.listChildren(request.parentSessionId as SessionId),
      dependencies.sessionQuery.listSessions(),
    ]);
    authorizeChild(request, children, sessionRecords);
    dependencies.subagents.interrupt(request.childSessionId as SessionId, {
      kind: "user",
      parentSessionId: request.parentSessionId as SessionId,
    });
    return {
      parentSessionId: request.parentSessionId,
      childSessionId: request.childSessionId,
      interruptRequested: true,
    };
  };
}

function authorizeParent(dependencies: YishanSubagentInterruptDependencies, request: SubagentInterruptRequest): void {
  const parent = dependencies.execution.getOwnedLiveSession(request.parentSessionId);
  if (parent === undefined) {
    throw new YishanSubagentInterruptError("parent session is not Yishan-owned and live", "YISHAN_PARENT_NOT_OWNED");
  }
  if (parent.header.cwd !== request.cwd) {
    throw new YishanSubagentInterruptError(
      "parent session does not belong to the current workspace",
      "YISHAN_PARENT_WORKSPACE_MISMATCH",
    );
  }
}

function authorizeChild(
  request: SubagentInterruptRequest,
  children: SubagentListEntry[],
  sessionRecords: SessionRecord[],
): void {
  const isDirectChild = children.some((entry) => entry.kind === "child" && entry.id === request.childSessionId);
  const childRecord = sessionRecords.find(({ header }) => header.id === request.childSessionId);
  if (
    !isDirectChild ||
    childRecord?.header.cwd !== request.cwd ||
    childRecord.header.origin !== "subagent" ||
    childRecord.header.parentSession !== request.parentSessionId
  ) {
    throw new YishanSubagentInterruptError(
      "child session is not a direct subagent in the current workspace",
      "YISHAN_CHILD_LINEAGE_DENIED",
    );
  }
}
