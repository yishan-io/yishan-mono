import { useCallback, useState } from "react";
import {
  ensurePiSession,
  fetchAgentMessages,
  fetchAgentModels,
  fetchAgentState,
  refreshAgentSessionStats,
  stopPiSession,
} from "../../commands/agentChatCommands";
import { delay } from "../../helpers/delay";
import { getErrorMessage } from "../../helpers/errorHelpers";
import { agentChatStore } from "../../store/agentChatStore";
import { type AgentSessionState, isAgentSessionBusy } from "../../store/agentChatTypes";

/** How long to wait for the refetched model list to show the saved provider before restarting. */
const PROVIDER_VISIBLE_WAIT_MS = 1_500;
/** Poll interval while waiting for the model-list event to land. */
const PROVIDER_VISIBLE_POLL_MS = 100;
/** Poll iterations are counted, not wall-clock, so instant delay (tests) stays fast. */
const PROVIDER_VISIBLE_POLL_ITERATIONS = Math.ceil(PROVIDER_VISIBLE_WAIT_MS / PROVIDER_VISIBLE_POLL_MS);

type UseAgentChatProviderAddParams = {
  tabId: string;
  workspaceId: string;
  cwd: string;
  paneId?: string;
  sessionId: string | null;
  sessionState: AgentSessionState;
};

/**
 * Owns the "add provider" dialog for the agent chat composer. After a save it
 * refreshes pi's available models, then restarts the pi session (preserving the
 * session id so history resumes) only if the new provider's models stay
 * invisible — pi applies provider credentials to new sessions, so a live
 * session's model list may not pick them up. Busy sessions are never restarted.
 */
export function useAgentChatProviderAdd({
  tabId,
  workspaceId,
  cwd,
  paneId,
  sessionId,
  sessionState,
}: UseAgentChatProviderAddParams) {
  const [isOpen, setIsOpen] = useState(false);

  const handleProviderSaved = useCallback(
    async (providerId?: string) => {
      setIsOpen(false);
      if (!sessionId) {
        return;
      }
      try {
        await fetchAgentModels({ tabId, sessionId });

        if (!providerId || isAgentSessionBusy(sessionState)) {
          // The credential is saved; a busy session is left running and the
          // provider applies to new sessions.
          return;
        }

        // fetchAgentModels resolves on the pi.send ack, before the
        // get_available_models response event populates the store, so poll the
        // store briefly instead of reading it synchronously.
        const previousSessionId = sessionId;
        let providerVisible = false;
        for (let attempt = 0; attempt < PROVIDER_VISIBLE_POLL_ITERATIONS; attempt += 1) {
          const models = agentChatStore.getState().sessionsByTabId[tabId]?.availableModels ?? [];
          if (models.some((model) => model.provider?.trim() === providerId)) {
            providerVisible = true;
            break;
          }
          await delay(PROVIDER_VISIBLE_POLL_MS);
        }
        if (providerVisible) {
          return;
        }

        await stopPiSession(tabId);
        const restartedSessionId = await ensurePiSession({
          tabId,
          workspaceId,
          cwd,
          sessionId: previousSessionId,
          paneId,
        });
        await fetchAgentState({ tabId, sessionId: restartedSessionId });
        await fetchAgentMessages({ tabId, sessionId: restartedSessionId });
        await fetchAgentModels({ tabId, sessionId: restartedSessionId });
        await refreshAgentSessionStats(restartedSessionId);
      } catch (error) {
        const message = getErrorMessage(error);
        agentChatStore.getState().setTurnError(tabId, message);
        if (!agentChatStore.getState().sessionsByTabId[tabId]) {
          // The restart dropped the store session; surface a recoverable error state.
          agentChatStore.getState().setSessionError(tabId, message);
        }
      }
    },
    [cwd, paneId, sessionId, sessionState, tabId, workspaceId],
  );

  return {
    openAddProviderDialog: () => setIsOpen(true),
    providerCredentialDialogProps: {
      open: isOpen,
      mode: "add" as const,
      onClose: () => setIsOpen(false),
      onSaved: handleProviderSaved,
    },
  };
}
