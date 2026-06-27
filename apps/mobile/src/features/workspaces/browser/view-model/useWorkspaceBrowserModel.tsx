import { useRouter } from "expo-router";

import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import { useWorkspaceBrowserCommands } from "@/features/workspaces/browser/commands/useWorkspaceBrowserCommands";
import { useWorkspaceLiveQueryInvalidation } from "@/features/workspaces/queries/useWorkspaceLiveQueryInvalidation";
import { useWorkspaceBrowserRouteState } from "../state/useWorkspaceBrowserRouteState";

export function useWorkspaceBrowserModel() {
  const router = useRouter();
  const { t } = useAppLanguage();
  const route = useWorkspaceBrowserRouteState();
  const commands = useWorkspaceBrowserCommands({
    browserStateId: route.browserStateId,
    organizationId: route.organizationId,
    projectId: route.projectId,
    router,
    setFocusedChangePath: route.setFocusedChangePath,
    setFocusedFilePath: route.setFocusedFilePath,
    workspaceId: route.workspaceId,
  });
  useWorkspaceLiveQueryInvalidation({
    enabled: route.hasContext,
    workspace: route.hasContext
      ? {
          id: route.workspaceId,
          nodeId: route.nodeId,
          organizationId: route.organizationId,
          projectId: route.projectId,
        }
      : null,
  });

  const title =
    route.projectLabel && route.workspaceLabel
      ? `${route.projectLabel}/${route.workspaceLabel}`
      : route.projectLabel || route.workspaceLabel || route.terminalLabel || t("shell.projectFallbackTitle");

  const subtitle = route.branchLabel || undefined;

  return {
    ...route,
    ...commands,
    browserHeader: {
      onBack: commands.handleBack,
      subtitle,
      title,
      titleNumberOfLines: 1 as const,
      titleVariant: "prominent" as const,
    },
    browserHeaderSubtitleKind: subtitle ? "branch" : null,
    browserTabs: {
      activeTab: route.activeTab,
      onSelectTab: route.setActiveTab,
    },
    changesPane: {
      browserStateId: route.browserStateId,
      focusedPath: route.focusedChangePath,
      nodeId: route.nodeId,
      onOpenDiff: commands.openDiff,
      organizationId: route.organizationId,
      projectId: route.projectId,
      workspaceId: route.workspaceId,
    },
    filesPane: {
      activeDirectoryPath: route.directoryPath,
      browserStateId: route.browserStateId,
      focusedPath: route.focusedFilePath,
      nodeId: route.nodeId,
      onOpenFile: commands.openFile,
      organizationId: route.organizationId,
      projectId: route.projectId,
      workspaceId: route.workspaceId,
    },
    prsPane: {
      organizationId: route.organizationId,
      projectId: route.projectId,
      workspaceId: route.workspaceId,
    },
    t,
  };
}
