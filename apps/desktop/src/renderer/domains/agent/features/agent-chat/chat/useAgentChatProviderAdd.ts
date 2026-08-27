import { useCallback, useState } from "react";
import { isAgentSessionBusy } from "../../../chat/agentChatTypes";
import type { AgentSessionState } from "../../../chat/agentChatTypes";
import type { AgentRuntime } from "../../../daemon/daemonAgentTypes";
import { fetchPiAgentModelsCompatibility, loadDSHSessionModels, restartAgentSessionForProvider } from "../../../commands/agentChatCommands";

type UseAgentChatProviderAddParams = {
  tabId: string;
  workspaceId: string;
  cwd: string;
  paneId?: string;
  sessionId: string | null;
  sessionState: AgentSessionState;
  runtime?: AgentRuntime;
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
  runtime,
}: UseAgentChatProviderAddParams) {
  const [isOpen, setIsOpen] = useState(false);

  const handleProviderSaved = useCallback(
    async (providerId?: string) => {
      setIsOpen(false);
      if (!sessionId) return;
      // DSH: credentials are picked up on the next request; just reload the models list.
      if (runtime === "dsh") {
        await loadDSHSessionModels(tabId);
        return;
      }
      // Pi: the credential is saved; a busy session is left running and the
      // provider applies to new sessions.
      if (!providerId || isAgentSessionBusy(sessionState)) {
        await fetchPiAgentModelsCompatibility({ tabId, sessionId });
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
    [cwd, paneId, runtime, sessionId, sessionState, tabId, workspaceId],
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
