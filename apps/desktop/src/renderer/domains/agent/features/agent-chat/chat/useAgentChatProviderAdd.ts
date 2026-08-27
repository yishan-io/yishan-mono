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
  /** For DSH sessions: the env-var ref name for the provider's API key (e.g. "DEEPSEEK_API_KEY"). */
  dshCredentialRef?: string;
  /** For DSH sessions: display name for the provider (e.g. "DeepSeek"). */
  dshProviderName?: string;
};

export type UseAgentChatProviderAddResult = {
  openAddProviderDialog: () => void;
  /** Props for Pi's ProviderCredentialDialog (runtime !== "dsh"). */
  providerCredentialDialogProps: {
    open: boolean;
    mode: "add";
    onClose: () => void;
    onSaved: (providerId?: string) => void;
  };
  /** Props for DSH's DSHCredentialDialog (runtime === "dsh"). */
  dshCredentialDialogProps: {
    open: boolean;
    credentialRef: string;
    providerName: string;
    onClose: () => void;
    onSaved: () => void;
  };
};

/**
 * Owns the "add provider" dialog for the agent chat composer.
 * Pi sessions use ProviderCredentialDialog; DSH sessions use DSHCredentialDialog.
 */
export function useAgentChatProviderAdd({
  tabId,
  workspaceId,
  cwd,
  paneId,
  sessionId,
  sessionState,
  runtime,
  dshCredentialRef = "",
  dshProviderName = "Provider",
}: UseAgentChatProviderAddParams): UseAgentChatProviderAddResult {
  const [isOpen, setIsOpen] = useState(false);

  const handleDSHCredentialSaved = useCallback(async () => {
    setIsOpen(false);
    await loadDSHSessionModels(tabId);
  }, [tabId]);

  const handlePiProviderSaved = useCallback(
    async (providerId?: string) => {
      setIsOpen(false);
      if (!sessionId) return;
      if (!providerId || isAgentSessionBusy(sessionState)) {
        await fetchPiAgentModelsCompatibility({ tabId, sessionId });
        return;
      }
      await restartAgentSessionForProvider({ tabId, workspaceId, cwd, paneId, sessionId, providerId });
    },
    [cwd, paneId, sessionId, sessionState, tabId, workspaceId],
  );

  return {
    openAddProviderDialog: () => setIsOpen(true),
    providerCredentialDialogProps: {
      open: isOpen && runtime !== "dsh",
      mode: "add" as const,
      onClose: () => setIsOpen(false),
      onSaved: handlePiProviderSaved,
    },
    dshCredentialDialogProps: {
      open: isOpen && runtime === "dsh",
      credentialRef: dshCredentialRef,
      providerName: dshProviderName,
      onClose: () => setIsOpen(false),
      onSaved: handleDSHCredentialSaved,
    },
  };
}
