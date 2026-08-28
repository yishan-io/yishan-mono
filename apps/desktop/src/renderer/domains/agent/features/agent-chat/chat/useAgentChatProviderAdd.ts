import { useCallback, useState } from "react";

import { getErrorMessage } from "@shared/errors/getErrorMessage";
import { isAgentSessionBusy } from "../../../chat/agentChatTypes";
import type { AgentSessionState } from "../../../chat/agentChatTypes";
import {
  fetchPiAgentModelsCompatibility,
  loadDSHSessionModels,
  restartAgentSessionForProvider,
} from "../../../commands/agentChatCommands";
import { listDSHProviders } from "../../../daemon/daemonAgentProcedures";
import type { AgentRuntime, DSHProviderCatalogEntry } from "../../../daemon/daemonAgentTypes";

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
  /** Props for the DSH provider picker. */
  dshProviderPickerDialogProps: {
    open: boolean;
    providers: DSHProviderCatalogEntry[];
    onClose: () => void;
    onSelect: (provider: DSHProviderCatalogEntry) => void;
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
  const [providers, setProviders] = useState<DSHProviderCatalogEntry[]>([]);
  const [pendingProvider, setPendingProvider] = useState<DSHProviderCatalogEntry | null>(null);

  const handleDSHCredentialSaved = useCallback(async () => {
    setPendingProvider(null);
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
    openAddProviderDialog: () => {
      if (runtime !== "dsh") {
        setIsOpen(true);
        return;
      }
      void listDSHProviders()
        .then((catalog) => {
          setProviders(catalog.providers);
          setIsOpen(true);
        })
        .catch((error) => {
          console.warn("Failed to load DSH providers", getErrorMessage(error));
          setProviders([]);
          setIsOpen(true);
        });
    },
    dshProviderPickerDialogProps: {
      open: isOpen && runtime === "dsh" && pendingProvider === null,
      providers,
      onClose: () => setIsOpen(false),
      onSelect: (provider) => {
        if (provider.authentication === "ambient") {
          setIsOpen(false);
          return;
        }
        setPendingProvider(provider);
      },
    },
    providerCredentialDialogProps: {
      open: isOpen && runtime !== "dsh",
      mode: "add" as const,
      onClose: () => setIsOpen(false),
      onSaved: handlePiProviderSaved,
    },
    dshCredentialDialogProps: {
      open: isOpen && runtime === "dsh" && pendingProvider !== null,
      credentialRef: pendingProvider?.credentialRef ?? dshCredentialRef,
      providerName: pendingProvider?.displayName ?? dshProviderName,
      onClose: () => {
        setPendingProvider(null);
        setIsOpen(false);
      },
      onSaved: handleDSHCredentialSaved,
    },
  };
}
