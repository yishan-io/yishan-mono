import type { AgentMessage } from "./agentChatTypes";

export type AgentSubagentLifecycleEvent = "started" | "completed";

/** Structured metadata attached to hidden `pi-subagent-child` parent-session entries. */
export type AgentSubagentLifecycleDetails = {
  event: AgentSubagentLifecycleEvent;
  agentId: string;
  agentName: string;
  childSessionId: string;
  title?: string;
  summary?: string;
  status?: string;
};

/** One running sub-agent row rendered above the parent chat composer. */
export type RunningSubagentSummary = {
  rowId: string;
  agentName: string;
  agentId?: string;
  childSessionId?: string;
  title: string;
  promptSummary: string;
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
    title: normalizeOptionalText(payload.title),
    summary: normalizeOptionalText(payload.summary),
    status: normalizeOptionalText(payload.status),
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

export function deriveRunningSubagents(
  messages: AgentMessage[],
  trailingMessage?: AgentMessage | null,
): RunningSubagentSummary[] {
  const runningByChildSessionId = new Map<string, RunningSubagentSummary>();
  const pendingByToolCallId = new Map<string, RunningSubagentSummary>();
  const messageSequence = trailingMessage ? [...messages, trailingMessage] : messages;

  for (const message of messageSequence) {
    const lifecycle = parseSubagentLifecycleMessage(message);
    if (lifecycle) {
      const lifecycleSummary = lifecycle.summary ?? derivePromptSummary(lifecycle.title, lifecycle.agentName);
      if (lifecycle.event === "completed") {
        runningByChildSessionId.delete(lifecycle.childSessionId);
        removePendingSubagentBySignature(pendingByToolCallId, lifecycle.agentName, lifecycleSummary);
        continue;
      }

      removePendingSubagentBySignature(pendingByToolCallId, lifecycle.agentName, lifecycleSummary);
      runningByChildSessionId.set(lifecycle.childSessionId, {
        rowId: lifecycle.childSessionId,
        agentId: lifecycle.agentId,
        agentName: lifecycle.agentName,
        childSessionId: lifecycle.childSessionId,
        title: lifecycle.title ?? buildFallbackTitle(lifecycle.agentName, lifecycle.summary),
        promptSummary: lifecycleSummary,
      });
      continue;
    }

    if (message.role === "toolResult" && message.toolName === "Agent" && message.toolCallId) {
      pendingByToolCallId.delete(message.toolCallId);
      continue;
    }

    if (message.role !== "assistant" || !Array.isArray(message.content)) {
      continue;
    }

    for (const block of message.content) {
      if (block.type !== "toolCall" || block.name !== "Agent") {
        continue;
      }

      const pendingSubagent = buildPendingSubagent(block.id, block.arguments);
      if (!pendingSubagent) {
        continue;
      }
      if (
        hasMatchingLifecycleSubagent(runningByChildSessionId, pendingSubagent.agentName, pendingSubagent.promptSummary)
      ) {
        continue;
      }

      pendingByToolCallId.set(block.id, pendingSubagent);
    }
  }

  return [...runningByChildSessionId.values(), ...pendingByToolCallId.values()];
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
    agentName,
    title: buildFallbackTitle(agentName, promptSummary),
    promptSummary,
  };
}

function hasMatchingLifecycleSubagent(
  runningByChildSessionId: Map<string, RunningSubagentSummary>,
  agentName: string,
  promptSummary: string,
): boolean {
  for (const subagent of runningByChildSessionId.values()) {
    if (subagent.agentName !== agentName) {
      continue;
    }
    if (summariesLikelyMatch(subagent.promptSummary, promptSummary)) {
      return true;
    }
  }

  return false;
}

function removePendingSubagentBySignature(
  pendingByToolCallId: Map<string, RunningSubagentSummary>,
  agentName: string,
  promptSummary: string,
): void {
  for (const [toolCallId, subagent] of pendingByToolCallId.entries()) {
    if (subagent.agentName !== agentName) {
      continue;
    }
    if (!summariesLikelyMatch(subagent.promptSummary, promptSummary)) {
      continue;
    }

    pendingByToolCallId.delete(toolCallId);
    return;
  }
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
