import { matchLifecycleRunsToToolCalls } from "../agentChatSubagentMatching";
import { parseSubagentLifecycleMessage } from "../agentChatSubagents";
import type { AgentMessagesInput } from "./messages";
import { selectChild } from "./toolCalls";
import type {
  ToolCallEntity,
  ToolCallOperation,
  ToolChildState,
  ToolExecutionState,
  ToolOutcome,
} from "./toolCalls.types";

/** A real child session with only observed delegation metadata. */
export type SubagentRun = ToolChildState & {
  readonly agentId?: string;
  readonly agentName?: string;
  readonly parentCallId?: string;
  readonly title?: string;
  readonly summary?: string;
  readonly mode?: "background" | "foreground";
};
type LifecycleRun = SubagentRun & { agentName: string; parentToolCallId?: string; sourceIndex: number };

/** Projects the current normalized window using the shared exact/legacy association contract. */
export function projectSubagents(
  input: AgentMessagesInput,
  sessionEndedAtMs?: number | null,
): {
  childRuns: ReadonlyMap<string, SubagentRun>;
  childOperations: readonly ToolCallOperation[];
  acceptedResultSourceIds: ReadonlySet<string>;
} {
  const calls: { rowId: string; agentName: string }[] = [];
  const agentCallIds = new Set<string>();
  for (const { message } of input.messages) {
    if (message.role !== "assistant" || !Array.isArray(message.content)) continue;
    for (const block of message.content) {
      if (block.type !== "toolCall" || block.name !== "Agent") continue;
      agentCallIds.add(block.id);
      if (typeof block.arguments.agent === "string") calls.push({ rowId: block.id, agentName: block.arguments.agent });
    }
  }
  const foregroundBoundaries = new Map<string, number>();
  const runs = new Map<string, LifecycleRun>();
  const starts = new Map<string, number | undefined>();
  for (const [sourceIndex, { message, toolSource }] of input.messages.entries()) {
    if (
      message.role === "toolResult" &&
      message.toolCallId &&
      (message.toolName === "Agent" || agentCallIds.has(message.toolCallId)) &&
      (message.details?.mode !== "background" || message.isError === true)
    )
      foregroundBoundaries.set(message.toolCallId, sourceIndex);
    const lifecycle = parseSubagentLifecycleMessage(message);
    if (!lifecycle) continue;
    const previous = runs.get(lifecycle.childSessionId);
    const selected = selectChild(previous, {
      childSessionId: lifecycle.childSessionId,
      event: lifecycle.event,
      outcome: getChildOutcome(lifecycle.status),
      source: toolSource,
      derivedFrom: "lifecycle",
    });
    if (selected === previous) continue;
    const createdAt =
      typeof message.details?.createdAt === "string" ? Date.parse(message.details.createdAt) : Number.NaN;
    const startedAt = Number.isFinite(createdAt)
      ? createdAt
      : Number.isFinite(message.startedAtMs)
        ? message.startedAtMs
        : message.timestamp;
    starts.set(
      lifecycle.childSessionId,
      typeof startedAt === "number" && Number.isFinite(startedAt) ? startedAt : undefined,
    );
    const mode = message.details?.mode;
    runs.set(lifecycle.childSessionId, {
      ...selected,
      agentId: lifecycle.agentId,
      agentName: lifecycle.agentName,
      parentToolCallId: lifecycle.parentToolCallId,
      title: lifecycle.title,
      summary: lifecycle.summary,
      ...(mode === "background" || mode === "foreground" ? { mode } : {}),
      sourceIndex,
    });
  }
  const matched = matchLifecycleRunsToToolCalls(runs, calls, foregroundBoundaries);
  const childRuns = new Map<string, SubagentRun>();
  const childOperations: ToolCallOperation[] = [];
  for (const run of runs.values()) {
    const parentCallId = run.parentToolCallId ?? [...matched].find(([, candidate]) => candidate === run)?.[0];
    const { parentToolCallId: _parent, sourceIndex: _index, ...child } = run;
    const projected = { ...child, ...(parentCallId ? { parentCallId } : {}) };
    childRuns.set(run.childSessionId, projected);
  }
  const acceptedResultSourceIds = new Set<string>();
  for (const { message, toolSource } of input.messages) {
    if (
      message.role !== "toolResult" ||
      !message.toolCallId ||
      !(message.toolName === "Agent" || agentCallIds.has(message.toolCallId))
    )
      continue;
    if (message.details?.mode === "background" && message.isError !== true) acceptedResultSourceIds.add(toolSource.id);
    if (
      message.details?.mode !== "foreground" ||
      typeof message.details.sessionId !== "string" ||
      !message.details.sessionId.trim()
    )
      continue;
    const childSessionId = message.details.sessionId;
    const previous = childRuns.get(childSessionId);
    const selected = selectChild(previous, {
      childSessionId,
      event: "completed",
      outcome: getChildOutcome(message.details.status),
      source: toolSource,
      derivedFrom: "result",
    });
    if (selected === previous) continue;
    childRuns.set(childSessionId, {
      ...previous,
      ...selected,
      parentCallId: message.toolCallId,
      mode: "foreground",
      ...(typeof message.details.agentId === "string" ? { agentId: message.details.agentId } : {}),
      ...(previous?.agentName === undefined &&
      calls.find((call) => call.rowId === message.toolCallId)?.agentName !== undefined
        ? { agentName: calls.find((call) => call.rowId === message.toolCallId)?.agentName }
        : {}),
    });
  }
  if (sessionEndedAtMs != null) {
    for (const [childSessionId, child] of childRuns) {
      const startedAt = starts.get(childSessionId);
      if (!child.isComplete && (startedAt === undefined || startedAt < sessionEndedAtMs))
        childRuns.set(childSessionId, selectChild(child, { ...child, event: "completed", outcome: "interrupted" }));
    }
  }
  // Emit the window-selected facts; session composition reconciles retained independent evidence.
  for (const child of childRuns.values()) {
    if (child.parentCallId)
      childOperations.push({ type: "child", sessionId: input.sessionId, callId: child.parentCallId, child });
  }
  return { childRuns, childOperations, acceptedResultSourceIds };
}

function getChildOutcome(status: unknown): ToolOutcome | undefined {
  if (status === "completed") return "succeeded";
  if (status === "failed") return "failed";
  if (status === "cancelled") return "interrupted";
  return undefined;
}

/** Derives Agent presentation without changing the tool execution ledger. */
export function getToolPresentationState(entity: ToolCallEntity | undefined): ToolExecutionState {
  if (!entity) return "unknown";
  if (entity.owner?.name !== "Agent") return entity.executionState;
  const children = [...(entity.children?.values() ?? [])];
  if (children.some((child) => !child.isComplete)) return "running";
  if (entity.dispatchState === "failed") return "failed";
  if (children.length) {
    if (children.some((child) => child.state === "failed")) return "failed";
    if (children.some((child) => child.state === "interrupted")) return "interrupted";
    return children.some((child) => child.state === "unknown") ? "unknown" : "succeeded";
  }
  return entity.dispatchState === "accepted" ? "pending" : entity.executionState;
}
