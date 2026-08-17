import { useCallback, useState } from "react";
import {
  fetchAgentModels,
  restartAgentSessionForProvider,
} from "../../../features/agent/commands/agentChatCommands";
import { isAgentSessionBusy } from "../../../features/agent/model/agentChatTypes";
import type { AgentSessionState } from "../../../features/agent/model/agentChatTypes";

type UseAgentChatProviderAddParams = {
  tabId: string;
  workspaceId: string;
  cwd: string;
  paneId?: string;
  sessionId: string | null;
  sessionState: AgentSessionState;
};

/**
 * Owns the "add provider" dialog for the agent chat composer. React binding
 * only — the provider-visible polling and session restart race live in
 * `restartAgentSessionForProvider` (AgentChatCommands → AgentSessionRuntime).
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
      // The credential is saved; a busy session is left running and the
      // provider applies to new sessions.
      if (!providerId || isAgentSessionBusy(sessionState)) {
        await fetchAgentModels({ tabId, sessionId });
        return;
      }
      await restartAgentSessionForProvider({
        tabId,
        workspaceId,
        cwd,
        paneId,
        sessionId,
        providerId,
      });
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
