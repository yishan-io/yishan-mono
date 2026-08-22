import type { AgentMessage } from "./agentChatTypes";
import { type AgentChatBilledUsage, parseAgentChatBilledUsage } from "./agentChatUsageSummary";

export type AgentSubagentLifecycleEvent = "started" | "completed";

/** Display state for one active sub-agent panel row. */
export type AgentSubagentPanelState = "queued" | "preparing" | "running";

/** Lifecycle state for an Agent tool call in the transcript. */
export type AgentToolCallLifecycleState = AgentSubagentPanelState | "completed";

/** Structured metadata attached to hidden `pi-subagent-child` parent-session entries. */
export type AgentSubagentLifecycleDetails = {
  event: AgentSubagentLifecycleEvent;
  agentId: string;
  agentName: string;
  childSessionId: string;
  /** Tool call that created this run, when present in newer lifecycle entries. */
  parentToolCallId?: string;
  title?: string;
  summary?: string;
  status?: string;
  /** Final child billing usage, present only for valid completed lifecycle entries. */
  usage?: AgentChatBilledUsage;
};

/** One running sub-agent row rendered above the parent chat composer. */
export type RunningSubagentSummary = {
  rowId: string;
  agentName: string;
  agentId?: string;
  childSessionId?: string;
  title: string;
  promptSummary: string;
  state?: AgentSubagentPanelState;
  /** When the underlying message began, for interrupted-vs-live classification. */
  startedAtMs?: number;
};

/** Child-session metadata persisted on the subagent session itself. */
export type ChildSessionSubagentMetadata = {
  agentId: string;
  agentName: string;
  childSessionId: string;
  parentSessionId?: string;
  parentSessionPath?: string;
  title?: string;
  summary?: string;
};

/** Finds one running sub-agent using stable row id first, then fuzzy agent+summary matching. */
export function findMatchingRunningSubagent(
  runningSubagents: RunningSubagentSummary[],
  target: Pick<RunningSubagentSummary, "rowId" | "agentName" | "promptSummary">,
): RunningSubagentSummary | undefined {
  return runningSubagents.find((candidate) => {
    return (
      candidate.rowId === target.rowId ||
      (candidate.agentName === target.agentName && summariesLikelyMatch(candidate.promptSummary, target.promptSummary))
    );
  });
}

const SUBAGENT_PARENT_CUSTOM_TYPE = "pi-subagent-parent";
const SUBAGENT_CUSTOM_TYPE = "pi-subagent-child";
const TITLE_SEPARATOR = " — ";

/** Parses one hidden sub-agent lifecycle message into structured details when possible. */
export function parseSubagentLifecycleMessage(message: AgentMessage): AgentSubagentLifecycleDetails | null {
  if (message.role !== "custom" || message.customType !== SUBAGENT_CUSTOM_TYPE) {
    return null;
  }

  const payload = parseLifecyclePayload(message.details) ?? parseLifecyclePayload(message.content);
  if (!payload) {
    return null;
  }

  const event = normalizeLifecycleEvent(payload.event);
  const agentId = normalizeRequiredText(payload.agentId);
  const agentName = normalizeRequiredText(payload.agentName);
  const childSessionId = normalizeRequiredText(payload.childSessionId);
  if (!event || !agentId || !agentName || !childSessionId) {
    return null;
  }

  return {
    event,
    agentId,
    agentName,
    childSessionId,
    parentToolCallId: normalizeOptionalText(payload.parentToolCallId),
    title: normalizeOptionalText(payload.title),
    summary: normalizeOptionalText(payload.summary),
    status: normalizeOptionalText(payload.status),
    ...(event === "completed" ? getCompletedChildUsage(payload.usage) : {}),
  };
}

/** Derives the currently running sub-agent rows from transcript history and the active streaming message. */
export function deriveChildSessionSubagentMetadata(messages: AgentMessage[]): ChildSessionSubagentMetadata | null {
  for (const message of messages) {
    if (message.role !== "custom" || message.customType !== SUBAGENT_PARENT_CUSTOM_TYPE) {
      continue;
    }

    const payload = parseLifecyclePayload(message.details) ?? parseLifecyclePayload(message.content);
    if (!payload) {
      continue;
    }

    const agentId = normalizeRequiredText(payload.agentId);
    const agentName = normalizeRequiredText(payload.agentName);
    const childSessionId = normalizeRequiredText(payload.childSessionId);
    if (!agentId || !agentName || !childSessionId) {
      continue;
    }

    return {
      agentId,
      agentName,
      childSessionId,
      parentSessionId: normalizeOptionalText(payload.parentSessionId),
      parentSessionPath: normalizeOptionalText(payload.parentSessionPath),
      title: normalizeOptionalText(payload.title),
      summary: normalizeOptionalText(payload.summary),
    };
  }

  return null;
}

/** Derives completed sub-agent rows that remain available for opening their persisted transcript. */
export function deriveFinishedSubagents(messages: AgentMessage[]): RunningSubagentSummary[] {
  const finishedByChildSessionId = new Map<string, RunningSubagentSummary>();

  for (const message of messages) {
    const lifecycle = parseSubagentLifecycleMessage(message);
    if (!lifecycle || lifecycle.event !== "completed") {
      continue;
    }

    const promptSummary = lifecycle.summary ?? derivePromptSummary(lifecycle.title, lifecycle.agentName);
    finishedByChildSessionId.set(lifecycle.childSessionId, {
      rowId: lifecycle.childSessionId,
      agentId: lifecycle.agentId,
      agentName: lifecycle.agentName,
      childSessionId: lifecycle.childSessionId,
      title: lifecycle.title ?? buildFallbackTitle(lifecycle.agentName, lifecycle.summary),
      promptSummary,
    });
  }

  return [...finishedByChildSessionId.values()];
}

export function deriveRunningSubagents(
  messages: AgentMessage[],
  trailingMessage?: AgentMessage | null,
  sessionEndedAtMs?: number | null,
): RunningSubagentSummary[] {
  const lifecycleRuns = collectLifecycleRuns(messages);
  const toolCalls = collectAgentToolCalls(messages, trailingMessage);
  const backgroundAcceptedToolCallIds = collectBackgroundAcceptedToolCallIds(messages);
  const completedForegroundToolCallIds = collectCompletedForegroundToolCallIds(messages);
  const lifecycleByToolCallId = matchLifecycleRunsToToolCalls(lifecycleRuns, toolCalls, completedForegroundToolCallIds);

  const activeSubagents: RunningSubagentSummary[] = [];
  const matchedLifecycleKeys = new Set<LifecycleRun>();
  for (const toolCall of toolCalls) {
    const lifecycleRun = lifecycleByToolCallId.get(toolCall.rowId);
    if (lifecycleRun) {
      matchedLifecycleKeys.add(lifecycleRun);
      if (lifecycleRun.event === "started") activeSubagents.push(buildRunningSubagent(lifecycleRun));
      continue;
    }

    if (!completedForegroundToolCallIds.has(toolCall.rowId)) {
      activeSubagents.push({
        ...toolCall,
        state: backgroundAcceptedToolCallIds.has(toolCall.rowId) ? "queued" : "preparing",
      });
    }
  }

  for (const lifecycleRun of lifecycleRuns.values()) {
    if (!matchedLifecycleKeys.has(lifecycleRun) && lifecycleRun.event === "started") {
      activeSubagents.push(buildRunningSubagent(lifecycleRun));
    }
  }

  if (sessionEndedAtMs == null) return activeSubagents;
  return activeSubagents.filter((subagent) => (subagent.startedAtMs ?? 0) >= sessionEndedAtMs);
}

/**
 * Resolves each Agent tool call to its composer lifecycle state. Exact parent
 * tool-call IDs take precedence; older lifecycle entries are matched in source
 * order so identical serial delegations consume one call each deterministically.
 */
export function resolveAgentToolCallLifecycleStates(
  messages: AgentMessage[],
  trailingMessage?: AgentMessage | null,
): Map<string, AgentToolCallLifecycleState> {
  const toolCalls = collectAgentToolCalls(messages, trailingMessage);
  const backgroundAcceptedToolCallIds = collectBackgroundAcceptedToolCallIds(messages);
  const completedForegroundToolCallIds = collectCompletedForegroundToolCallIds(messages);
  const lifecycleByToolCallId = matchLifecycleRunsToToolCalls(
    collectLifecycleRuns(messages),
    toolCalls,
    completedForegroundToolCallIds,
  );
  const states = new Map<string, AgentToolCallLifecycleState>();

  for (const toolCall of toolCalls) {
    const lifecycleRun = lifecycleByToolCallId.get(toolCall.rowId);
    if (lifecycleRun) {
      states.set(toolCall.rowId, lifecycleRun.event === "started" ? "running" : "completed");
    } else if (completedForegroundToolCallIds.has(toolCall.rowId)) {
      states.set(toolCall.rowId, "completed");
    } else {
      states.set(toolCall.rowId, backgroundAcceptedToolCallIds.has(toolCall.rowId) ? "queued" : "preparing");
    }
  }

  return states;
}

function matchLifecycleRunsToToolCalls(
  lifecycleRuns: Map<string, LifecycleRun>,
  toolCalls: Array<Omit<RunningSubagentSummary, "state">>,
  completedForegroundToolCallSourceIndexes: Map<string, number>,
): Map<string, LifecycleRun> {
  const lifecycleByToolCallId = new Map<string, LifecycleRun>();
  const matchedLegacyToolCallIds = new Set<string>();

  for (const lifecycleRun of lifecycleRuns.values()) {
    if (lifecycleRun.parentToolCallId) {
      lifecycleByToolCallId.set(lifecycleRun.parentToolCallId, lifecycleRun);
    }
  }

  for (const lifecycleRun of lifecycleRuns.values()) {
    if (lifecycleRun.parentToolCallId) continue;
    // Legacy lifecycle entries lack a stable parent call ID. Pair each run with
    // the next unmatched invocation for the same agent; title/summary metadata
    // is optional and cannot disqualify that deterministic pairing.
    const matchingToolCall = toolCalls.find((toolCall) => {
      return (
        !lifecycleByToolCallId.has(toolCall.rowId) &&
        !matchedLegacyToolCallIds.has(toolCall.rowId) &&
        shouldMatchLegacyToolCall(lifecycleRun, toolCall.rowId, completedForegroundToolCallSourceIndexes) &&
        toolCall.agentName === lifecycleRun.agentName
      );
    });
    if (matchingToolCall) {
      lifecycleByToolCallId.set(matchingToolCall.rowId, lifecycleRun);
      matchedLegacyToolCallIds.add(matchingToolCall.rowId);
    }
  }

  return lifecycleByToolCallId;
}

type LifecycleRun = {
  event: AgentSubagentLifecycleEvent;
  agentId: string;
  agentName: string;
  childSessionId: string;
  parentToolCallId?: string;
  title?: string;
  promptSummary: string;
  startedAtMs?: number;
  sourceIndex: number;
};

function collectLifecycleRuns(messages: AgentMessage[]): Map<string, LifecycleRun> {
  const lifecycleRuns = new Map<string, LifecycleRun>();
  for (const [sourceIndex, message] of messages.entries()) {
    const lifecycle = parseSubagentLifecycleMessage(message);
    if (!lifecycle) continue;

    const lifecycleKey = lifecycle.parentToolCallId ?? lifecycle.childSessionId;
    lifecycleRuns.set(lifecycleKey, {
      event: lifecycle.event,
      agentId: lifecycle.agentId,
      agentName: lifecycle.agentName,
      childSessionId: lifecycle.childSessionId,
      parentToolCallId: lifecycle.parentToolCallId,
      title: lifecycle.title,
      promptSummary: lifecycle.summary ?? derivePromptSummary(lifecycle.title, lifecycle.agentName),
      startedAtMs: extractMessageStartedAtMs(message),
      sourceIndex,
    });
  }
  return lifecycleRuns;
}

function collectAgentToolCalls(
  messages: AgentMessage[],
  trailingMessage?: AgentMessage | null,
): Array<Omit<RunningSubagentSummary, "state">> {
  const toolCalls: Array<Omit<RunningSubagentSummary, "state">> = [];
  for (const message of trailingMessage ? [...messages, trailingMessage] : messages) {
    if (message.role !== "assistant" || !Array.isArray(message.content)) continue;
    for (const block of message.content) {
      if (block.type !== "toolCall" || block.name !== "Agent") continue;
      const toolCall = buildPendingSubagent(block.id, block.arguments);
      if (toolCall) toolCalls.push({ ...toolCall, startedAtMs: extractMessageStartedAtMs(message) });
    }
  }
  return toolCalls;
}

function collectBackgroundAcceptedToolCallIds(messages: AgentMessage[]): Set<string> {
  const toolCallIds = new Set<string>();
  for (const message of messages) {
    if (
      message.role === "toolResult" &&
      message.toolName === "Agent" &&
      message.toolCallId &&
      message.details?.mode === "background"
    ) {
      toolCallIds.add(message.toolCallId);
    }
  }
  return toolCallIds;
}

function collectCompletedForegroundToolCallIds(messages: AgentMessage[]): Map<string, number> {
  const toolCallSourceIndexes = new Map<string, number>();
  for (const [sourceIndex, message] of messages.entries()) {
    if (
      message.role === "toolResult" &&
      message.toolName === "Agent" &&
      message.toolCallId &&
      message.details?.mode !== "background"
    ) {
      toolCallSourceIndexes.set(message.toolCallId, sourceIndex);
    }
  }
  return toolCallSourceIndexes;
}

function shouldMatchLegacyToolCall(
  lifecycleRun: LifecycleRun,
  toolCallId: string,
  completedForegroundToolCallSourceIndexes: Map<string, number>,
): boolean {
  const terminalResultSourceIndex = completedForegroundToolCallSourceIndexes.get(toolCallId);
  return terminalResultSourceIndex === undefined || terminalResultSourceIndex > lifecycleRun.sourceIndex;
}

function buildRunningSubagent(lifecycleRun: LifecycleRun): RunningSubagentSummary {
  return {
    rowId: lifecycleRun.childSessionId,
    agentId: lifecycleRun.agentId,
    agentName: lifecycleRun.agentName,
    childSessionId: lifecycleRun.childSessionId,
    title: lifecycleRun.title ?? buildFallbackTitle(lifecycleRun.agentName, lifecycleRun.promptSummary),
    promptSummary: lifecycleRun.promptSummary,
    state: "running",
    ...(lifecycleRun.startedAtMs === undefined ? {} : { startedAtMs: lifecycleRun.startedAtMs }),
  };
}

function buildPendingSubagent(
  toolCallId: string,
  argumentsValue: Record<string, unknown>,
): RunningSubagentSummary | null {
  const agentName = normalizeRequiredText(argumentsValue.agent);
  const prompt = normalizeOptionalText(argumentsValue.prompt);
  if (!agentName || !prompt) {
    return null;
  }

  const promptSummary = normalizePromptSummary(prompt);
  return {
    rowId: toolCallId,
    agentId: undefined,
    agentName,
    childSessionId: undefined,
    title: buildFallbackTitle(agentName, promptSummary),
    promptSummary,
  };
}

function extractMessageStartedAtMs(message: AgentMessage): number | undefined {
  return message.timestamp ?? message.startedAtMs;
}

function summariesLikelyMatch(leftSummary: string, rightSummary: string): boolean {
  const normalizedLeft = normalizeMatchingText(leftSummary);
  const normalizedRight = normalizeMatchingText(rightSummary);
  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  return (
    normalizedLeft === normalizedRight ||
    normalizedLeft.startsWith(normalizedRight) ||
    normalizedRight.startsWith(normalizedLeft)
  );
}

function normalizePromptSummary(prompt: string): string {
  return prompt.replace(/\s+/g, " ").trim();
}

function normalizeMatchingText(value: string): string {
  return normalizePromptSummary(value).replace(/\.\.\.$/, "");
}

function buildFallbackTitle(agentName: string, summary?: string): string {
  const normalizedSummary = normalizeOptionalText(summary);
  return normalizedSummary ? `${agentName}${TITLE_SEPARATOR}${normalizedSummary}` : agentName;
}

function derivePromptSummary(title: string | undefined, agentName: string): string {
  const normalizedTitle = normalizeOptionalText(title);
  if (!normalizedTitle) {
    return agentName;
  }

  const prefix = `${agentName}${TITLE_SEPARATOR}`;
  if (normalizedTitle.startsWith(prefix)) {
    return normalizedTitle.slice(prefix.length).trim() || agentName;
  }

  return normalizedTitle;
}

function parseLifecyclePayload(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  if (!trimmedValue.startsWith("{")) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(trimmedValue);
    return typeof parsedValue === "object" && parsedValue !== null && !Array.isArray(parsedValue)
      ? (parsedValue as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function getCompletedChildUsage(usage: unknown): Pick<AgentSubagentLifecycleDetails, "usage"> {
  const billedUsage = parseAgentChatBilledUsage(usage);
  return billedUsage ? { usage: billedUsage } : {};
}

function normalizeLifecycleEvent(value: unknown): AgentSubagentLifecycleEvent | null {
  const normalizedValue = normalizeRequiredText(value);
  if (normalizedValue === "started" || normalizedValue === "completed") {
    return normalizedValue;
  }

  return null;
}

function normalizeRequiredText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue.length > 0 ? normalizedValue : null;
}

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalizedValue = value.trim();
  return normalizedValue.length > 0 ? normalizedValue : undefined;
}
