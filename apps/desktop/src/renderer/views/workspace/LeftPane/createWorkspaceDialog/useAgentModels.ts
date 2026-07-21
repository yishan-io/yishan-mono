import type { AgentModelInfo } from "@renderer/commands/agentCommands";
import type { DesktopAgentKind } from "@renderer/helpers/agentSettings";
import { useEffect, useState } from "react";

type UseAgentModelsInput = {
  taskAgentKind: DesktopAgentKind | "";
  listAgentModels: (agentKind: DesktopAgentKind) => Promise<{ models?: AgentModelInfo[] }>;
};

type UseAgentModelsResult = {
  agentModels: AgentModelInfo[];
  loadingAgentModels: boolean;
};

/** Loads model options for the selected task-run agent kind. */
export function useAgentModels({ taskAgentKind, listAgentModels }: UseAgentModelsInput): UseAgentModelsResult {
  const [agentModels, setAgentModels] = useState<AgentModelInfo[]>([]);
  const [loadingAgentModels, setLoadingAgentModels] = useState(false);

  useEffect(() => {
    if (!taskAgentKind) {
      setAgentModels([]);
      return;
    }

    let cancelled = false;
    setLoadingAgentModels(true);
    listAgentModels(taskAgentKind)
      .then((result) => {
        if (!cancelled) {
          setAgentModels(result.models ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAgentModels([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingAgentModels(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [listAgentModels, taskAgentKind]);

  return { agentModels, loadingAgentModels };
}
