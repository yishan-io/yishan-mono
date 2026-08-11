import { MAX_SUBAGENT_CHILDREN, MAX_SUBAGENT_MESSAGES_PER_CHILD } from "../helpers/agentChatBudget";
import { agentChatStore } from "../store/agentChatStore";
import type { AgentMessage } from "../store/agentChatTypes";
import { tabStore } from "../store/tabStore";
import { isRecord, normalizeIncomingAgentMessage } from "./agentChatInboundMessage";

// ─── Subagent event parsers ───────────────────────────────────────────────────

type SubagentLiveTranscript = {
  childSessionId: string;
  messages: AgentMessage[];
  thinkingLevel?: string;
};

export function parseSubagentProgressTargets(
  event: Record<string, unknown>,
): Array<{ agentName: string; agentId: string; status: string; childSessionId?: string }> | null {
  if (event.method !== "setWidget" || event.widgetKey !== "pi-subagents-progress") {
    return null;
  }

  const widgetLines = event.widgetLines;
  if (widgetLines === undefined) {
    return [];
  }
  if (!Array.isArray(widgetLines)) {
    return null;
  }

  const targets = widgetLines
    .map((line) => parseSubagentProgressTargetLine(typeof line === "string" ? line : ""))
    .filter(
      (target): target is { agentName: string; agentId: string; status: string; childSessionId?: string } =>
        target !== null,
    );
  return targets;
}

function parseSubagentProgressTargetLine(
  line: string,
): { agentName: string; agentId: string; status: string; childSessionId?: string } | null {
  const normalizedLine = line.replace(/<[^>]+>/g, "").trim();
  const match = normalizedLine.match(
    /^\S+\s+(.+?)\s+·\s+(queued|starting|running)\s+·\s+(?:fg|bg)\s+·\s+(agent-\S+)(?:\s+·\s+(\S+))?$/,
  );
  if (!match) {
    return null;
  }

  const [, agentName, status, agentId, childSessionId] = match;
  if (!agentName || !status || !agentId) {
    return null;
  }

  return { agentName, status, agentId, childSessionId: childSessionId || undefined };
}

export function parseSubagentLiveTranscripts(event: Record<string, unknown>): SubagentLiveTranscript[] | null {
  if (event.method !== "setWidget" || event.widgetKey !== "pi-subagents-live-transcripts") {
    return null;
  }

  const widgetLines = event.widgetLines;
  if (widgetLines === undefined) {
    return [];
  }
  if (!Array.isArray(widgetLines) || widgetLines.length !== 1 || typeof widgetLines[0] !== "string") {
    return null;
  }

  try {
    const payload = JSON.parse(widgetLines[0]) as { version?: unknown; agents?: unknown };
    if (payload.version !== 1 || !Array.isArray(payload.agents)) {
      return null;
    }

    // Cap raw input: limit total children and per-child message count before normalization.
    const cappedAgents = payload.agents.slice(-MAX_SUBAGENT_CHILDREN);

    return cappedAgents.flatMap((agent): SubagentLiveTranscript[] => {
      if (!agent || typeof agent !== "object") {
        return [];
      }
      const { childSessionId, messages, thinkingLevel } = agent as {
        childSessionId?: unknown;
        messages?: unknown;
        thinkingLevel?: unknown;
      };
      if (typeof childSessionId !== "string" || childSessionId.trim().length === 0 || !Array.isArray(messages)) {
        return [];
      }

      const cappedMessages = messages.slice(-MAX_SUBAGENT_MESSAGES_PER_CHILD);

      const normalizedMessages = cappedMessages.flatMap((message) => {
        const normalizedMessage = normalizeIncomingAgentMessage(message);
        return normalizedMessage ? [normalizedMessage] : [];
      });
      return [
        {
          childSessionId,
          messages: normalizedMessages,
          thinkingLevel: typeof thinkingLevel === "string" ? thinkingLevel : undefined,
        },
      ];
    });
  } catch {
    return null;
  }
}

export function applySubagentLiveTranscripts(parentTabId: string, transcripts: SubagentLiveTranscript[]): void {
  agentChatStore
    .getState()
    .setSubagentLiveTranscripts(
      parentTabId,
      Object.fromEntries(transcripts.map((transcript) => [transcript.childSessionId, transcript.messages])),
    );

  for (const transcript of transcripts) {
    const detailTab = tabStore.getState().tabs.find((tab) => {
      return (
        tab.kind === "agent-chat" &&
        tab.data.sessionView === "subagent-detail" &&
        tab.data.sessionId?.trim() === transcript.childSessionId
      );
    });
    if (!detailTab) {
      continue;
    }

    agentChatStore.getState().replaceMessages(detailTab.id, transcript.messages);

    if (transcript.thinkingLevel) {
      agentChatStore.getState().setThinkingLevel(detailTab.id, transcript.thinkingLevel);
    }
  }
}

// ─── Live lifecycle-widget ingestion ─────────────────────────────────────────

const LIFECYCLE_WIDGET_KEY = "pi-subagents-lifecycle";
const LIFECYCLE_WIDGET_VERSION = 1;
const SUBAGENT_CHILD_CUSTOM_TYPE = "pi-subagent-child";

/**
 * Parses the extension's live lifecycle widget into validated parent-child
 * entries. Returns null for malformed payloads (wrong widget, bad JSON, wrong
 * version, or any entry missing its required identity fields).
 */
export function parseSubagentLifecycleWidget(event: Record<string, unknown>): Record<string, unknown>[] | null {
  if (event.method !== "setWidget" || event.widgetKey !== LIFECYCLE_WIDGET_KEY) {
    return null;
  }

  const widgetLines = event.widgetLines;
  if (!Array.isArray(widgetLines) || widgetLines.length !== 1 || typeof widgetLines[0] !== "string") {
    return null;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(widgetLines[0]);
  } catch {
    return null;
  }

  if (!isRecord(payload) || payload.version !== LIFECYCLE_WIDGET_VERSION || !Array.isArray(payload.entries)) {
    return null;
  }

  const entries: Record<string, unknown>[] = [];
  for (const rawEntry of payload.entries) {
    const entry = parseLifecycleWidgetEntry(rawEntry);
    if (!entry) {
      return null;
    }
    entries.push(entry);
  }
  return entries;
}

/**
 * Applies parsed lifecycle entries to the store as hidden custom messages so
 * started/completed sub-agent rows appear (and clear) in real time instead of
 * only after a get_messages round trip.
 */
export function applySubagentLifecycleWidget(parentTabId: string, entries: Record<string, unknown>[]): void {
  for (const entry of entries) {
    const childSessionId = typeof entry.childSessionId === "string" ? entry.childSessionId : "";
    const event = entry.event === "completed" ? "completed" : "started";
    agentChatStore.getState().appendMessage(parentTabId, {
      id: `${childSessionId}:${event}`,
      role: "custom",
      customType: SUBAGENT_CHILD_CUSTOM_TYPE,
      display: false,
      content: "",
      details: entry,
      timestamp: Date.now(),
    });
  }
}

function parseLifecycleWidgetEntry(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) {
    return null;
  }
  if (value.event !== "started" && value.event !== "completed") {
    return null;
  }
  if (typeof value.agentId !== "string" || value.agentId.trim().length === 0) {
    return null;
  }
  if (typeof value.agentName !== "string" || value.agentName.trim().length === 0) {
    return null;
  }
  if (typeof value.childSessionId !== "string" || value.childSessionId.trim().length === 0) {
    return null;
  }
  return value;
}
