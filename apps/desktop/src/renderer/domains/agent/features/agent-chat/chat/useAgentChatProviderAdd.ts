import { useCallback, useState } from "react";

import { getErrorMessage } from "@shared/errors/getErrorMessage";
import { isAgentSessionBusy } from "../../../chat/agentChatTypes";
import type { AgentSessionState } from "../../../chat/agentChatTypes";
import {
  fetchPiAgentModelsCompatibility,
  loadDSHSessionModels,
  restartAgentSessionForProvider,
} from "../../../commands/agentChatCommands";
import { saveDSHCredential } from "../../../commands/dshCredentialCommands";
import { listDSHProviders } from "../../../daemon/daemonAgentProcedures";
import type { AgentRuntime, DSHProviderCatalogEntry } from "../../../daemon/daemonAgentTypes";
import type {
  ProviderCredentialCatalogEntry,
  ProviderCredentialSaveInput,
} from "../../provider-credentials/ProviderCredentialDialog";

type UseAgentChatProviderAddParams = {
  tabId: string;
  workspaceId: string;
  cwd: string;
  paneId?: string;
  sessionId: string | null;
  sessionState: AgentSessionState;
  runtime?: AgentRuntime;
};

export type UseAgentChatProviderAddResult = {
  openAddProviderDialog: () => void;
  /** Props for Pi's credential adapter (runtime !== "dsh"). */
  piProviderCredentialDialogProps: {
    open: boolean;
    mode: "add";
    onClose: () => void;
    onSaved: (providerId?: string) => void;
  };
  /** Props for the shared dialog backed by DSH's provider catalog and credential procedure. */
  providerCredentialDialogProps: {
    open: boolean;
    mode: "add";
    providers: ProviderCredentialCatalogEntry[];
    emptyMessage: string;
    onClose: () => void;
    onSave: (input: ProviderCredentialSaveInput) => Promise<void>;
    onSaved: (providerId?: string) => void;
  };
};

/** Maps DSH's safe catalog contract to the shared credential presentation contract. */
function mapDSHProviderCatalog(providers: DSHProviderCatalogEntry[]): ProviderCredentialCatalogEntry[] {
  return providers.map((provider) => ({
    id: provider.id,
    displayName: provider.displayName,
    authMode: provider.authentication === "api-key" && provider.credentialRef ? "api-key" : "ambient",
    credentialRef: provider.credentialRef,
    setupGuidance: provider.setupGuidance,
  }));
}

/** Owns runtime-specific provider catalog loading and post-save session refresh behavior. */
export function useAgentChatProviderAdd({
  tabId,
  workspaceId,
  cwd,
  paneId,
  sessionId,
  sessionState,
  runtime,
}: UseAgentChatProviderAddParams): UseAgentChatProviderAddResult {
  const [isOpen, setIsOpen] = useState(false);
  const [dshProviders, setDSHProviders] = useState<ProviderCredentialCatalogEntry[]>([]);

  const handleDSHCredentialSaved = useCallback(async () => {
    setIsOpen(false);
    await loadDSHSessionModels(tabId);
  }, [tabId]);

  const handleDSHCredentialSave = useCallback(async ({ provider, key }: ProviderCredentialSaveInput) => {
    if (!provider.credentialRef) {
      throw new Error(`DSH provider ${provider.id} does not declare a credential reference.`);
    }
    await saveDSHCredential({ ref: provider.credentialRef, value: key });
  }, []);

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

  const openAddProviderDialog = useCallback(() => {
    if (runtime !== "dsh") {
      setIsOpen(true);
      return;
    }
    void listDSHProviders()
      .then((catalog) => {
        setDSHProviders(mapDSHProviderCatalog(catalog.providers));
        setIsOpen(true);
      })
      .catch((error) => {
        console.warn("Failed to load DSH providers", getErrorMessage(error));
        setDSHProviders([]);
        setIsOpen(true);
      });
  }, [runtime]);

  const handleClose = useCallback(() => setIsOpen(false), []);

  return {
    openAddProviderDialog,
    piProviderCredentialDialogProps: {
      open: isOpen && runtime !== "dsh",
      mode: "add",
      onClose: handleClose,
      onSaved: handlePiProviderSaved,
    },
    providerCredentialDialogProps: {
      open: isOpen && runtime === "dsh",
      mode: "add",
      providers: dshProviders,
      emptyMessage: "No DSH providers are available.",
      onClose: handleClose,
      onSave: handleDSHCredentialSave,
      onSaved: handleDSHCredentialSaved,
    },
  };
}
