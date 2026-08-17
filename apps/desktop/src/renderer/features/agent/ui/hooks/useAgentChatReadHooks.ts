import { useShallow } from "zustand/react/shallow";
import { getCompactContextPercent } from "../../model/agentChatUsageSummary";
import { agentChatStore } from "../../model/agentChatStore";
import { chatStore } from "../../state/chatStore";

/**
 * Agent feature read-only hooks — the stable read surface for Agent State
 * (Phase 17, desktop6.md). Cross-feature UI subscribes to agent chat state
 * through these hooks instead of importing the Agent Stores directly.
 */

/** Subscribes to one agent chat session by tab id. */
export function useAgentChatSession(tabId: string) {
  return agentChatStore((state) => state.sessionsByTabId[tabId]);
}

/**
 * Subscribes to the composer-relevant session projection. Fields are primitives
 * compared with shallow equality, so transcript-only streaming updates (which
 * mutate `streamingMessage` content) do not re-render the composer.
 */
export function useAgentChatSessionMeta(tabId: string) {
  return agentChatStore(
    useShallow((state) => {
      const session = state.sessionsByTabId[tabId];
      return {
        sessionId: session?.sessionId ?? null,
        sessionState: session?.state ?? "starting",
        subagentSessionEndedAtMs: session?.subagentSessionEndedAtMs ?? null,
        compactionReason: session?.compactionReason ?? null,
        availableModels: session?.availableModels ?? [],
        currentModel: session?.currentModel ?? null,
        thinkingLevel: session?.thinkingLevel ?? "medium",
        messageCount: session?.messages.length ?? 0,
        hasStreamingMessage: Boolean(session?.streamingMessage),
        contextPercent: getCompactContextPercent(
          session?.messages ?? [],
          session?.currentModel ?? null,
          session?.sessionStats ?? null,
        ),
      };
    }),
  );
}

/** Subscribes to the full agent chat session map. */
export function useAgentChatSessions() {
  return agentChatStore((state) => state.sessionsByTabId);
}

/**
 * Subscribes to the subagent-tracking projection of one session. Shallow
 * equality keeps transcript streaming updates from re-rendering consumers.
 */
export function useAgentChatSubagentState(tabId: string) {
  return agentChatStore(
    useShallow((state) => {
      const session = state.sessionsByTabId[tabId];
      return {
        runningSubagents: session?.runningSubagents ?? [],
        subagentProgressTargets: session?.subagentProgressTargets ?? [],
        subagentCancelStates: session?.subagentCancelStates ?? {},
      };
    }),
  );
}

/** Subscribes to the chat messages map by tab id. */
export function useChatMessagesByTabId() {
  return chatStore((state) => state.messagesByTabId);
}

/** Subscribes to the available agent models map by tab id. */
export function useChatAvailableModelsByTabId() {
  return chatStore((state) => state.availableModelsByTabId);
}

/** Subscribes to the current agent model map by tab id. */
export function useChatCurrentModelByTabId() {
  return chatStore((state) => state.currentModelByTabId);
}

/** Subscribes to agent status by workspace id. */
export function useWorkspaceAgentStatusByWorkspaceId() {
  return chatStore((state) => state.workspaceAgentStatusByWorkspaceId);
}

/** Subscribes to unread agent tone by workspace id. */
export function useWorkspaceUnreadToneByWorkspaceId() {
  return chatStore((state) => state.workspaceUnreadToneByWorkspaceId);
}
