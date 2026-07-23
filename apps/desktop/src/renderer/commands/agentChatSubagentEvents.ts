import { MAX_SUBAGENT_CHILDREN, MAX_SUBAGENT_MESSAGES_PER_CHILD } from "../helpers/agentChatBudget";
import { agentChatStore } from "../store/agentChatStore";
import type { AgentMessage } from "../store/agentChatTypes";
import { tabStore } from "../store/tabStore";
import { normalizeIncomingAgentMessage } from "./agentChatInboundMessage";

// ─── Subagent event parsers ───────────────────────────────────────────────────

type SubagentLiveTranscript = {
  childSessionId: string;
  messages: AgentMessage[];
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
      const { childSessionId, messages } = agent as { childSessionId?: unknown; messages?: unknown };
      if (typeof childSessionId !== "string" || childSessionId.trim().length === 0 || !Array.isArray(messages)) {
        return [];
      }

      const cappedMessages = messages.slice(-MAX_SUBAGENT_MESSAGES_PER_CHILD);

      const normalizedMessages = cappedMessages.flatMap((message) => {
        const normalizedMessage = normalizeIncomingAgentMessage(message);
        return normalizedMessage ? [normalizedMessage] : [];
      });
      return [{ childSessionId, messages: normalizedMessages }];
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
  }
}
