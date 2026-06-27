import { useLocalSearchParams } from "expo-router";

import { normalizePath } from "@/features/workspaces/file-browser";
import { hasRelayWorkspaceQueryContext } from "@/features/workspaces/queries/workspace-query-runtime";
import { readRouteParam } from "@/lib/navigation/read-route-param";
import { useWorkspaceBrowserTabState } from "./useWorkspaceBrowserTabState";
import { type WorkspaceBrowserTab, createWorkspaceBrowserStateId } from "./workspaceBrowserState";

type BrowserParams = {
  branchLabel?: string | string[];
  focusPath?: string | string[];
  nodeId?: string | string[];
  orgId?: string | string[];
  projectId?: string | string[];
  projectLabel?: string | string[];
  workspaceId?: string | string[];
  workspaceLabel?: string | string[];
  terminalLabel?: string | string[];
  terminalId?: string | string[];
  tab?: string | string[];
  directoryPath?: string | string[];
};

export function useWorkspaceBrowserRouteState() {
  const params = useLocalSearchParams<BrowserParams>();

  const organizationId = readRouteParam(params.orgId);
  const projectId = readRouteParam(params.projectId);
  const projectLabel = readRouteParam(params.projectLabel);
  const nodeId = readRouteParam(params.nodeId);
  const branchLabel = readRouteParam(params.branchLabel);
  const focusPath = normalizePath(readRouteParam(params.focusPath));
  const workspaceId = readRouteParam(params.workspaceId);
  const workspaceLabel = readRouteParam(params.workspaceLabel);
  const terminalLabel = readRouteParam(params.terminalLabel);
  const terminalId = readRouteParam(params.terminalId);
  const hasExplicitTabParam = params.tab !== undefined;
  const routeTabParam = readRouteParam(params.tab);
  const routeTab: WorkspaceBrowserTab =
    routeTabParam === "changes" ? "changes" : routeTabParam === "prs" ? "prs" : "files";
  const explicitDirectoryPath = normalizePath(readRouteParam(params.directoryPath));
  const hasContext = hasRelayWorkspaceQueryContext({
    nodeId,
    organizationId,
    projectId,
    workspaceId,
  });
  const browserStateId = createWorkspaceBrowserStateId(organizationId, projectId, workspaceId);
  const browserTabState = useWorkspaceBrowserTabState({
    browserStateId,
    explicitFocusedChangePath: routeTab === "changes" ? focusPath : "",
    explicitFocusedFilePath: routeTab === "files" ? focusPath : "",
    explicitDirectoryPath,
    hasExplicitTabParam,
    routeTab,
  });

  return {
    ...browserTabState,
    browserStateId,
    branchLabel,
    hasContext,
    nodeId,
    organizationId,
    projectId,
    projectLabel,
    terminalId,
    terminalLabel,
    workspaceId,
    workspaceLabel,
  };
}
