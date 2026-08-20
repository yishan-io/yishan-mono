import {
  AGENT_SETTINGS_LABEL_KEY_BY_KIND,
  DEFAULT_AGENT_COMMANDS,
  type DesktopAgentKind,
} from "@renderer/domains/agent";
import { createNewWhiteboard } from "@renderer/domains/files";
import { openTabWithContentSeed } from "@renderer/domains/workbench";
import { openWorkspaceFileSearch, workspaceCreateProgressStore, workspaceStore } from "@renderer/domains/workspace";
import { getRendererPlatform } from "@renderer/platform/platform";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { LuGlobe, LuPencil, LuSearch, LuSparkles, LuSquareTerminal } from "react-icons/lu";
import { getShortcutDisplayLabelById } from "../../../shortcuts/shortcutDisplay";
import { type LaunchAction, LaunchActionsPanel } from "./LaunchActionsPanel";
import { LaunchPreparingWorkspace } from "./LaunchPreparingWorkspace";

export type LaunchViewProps = {
  workspaceId: string;
  enabledAgentKinds: DesktopAgentKind[];
};

/** Renders quick actions when no tab is open in the selected workspace. */
export function LaunchView({ workspaceId, enabledAgentKinds }: LaunchViewProps) {
  const { t } = useTranslation();
  const workspaces = workspaceStore((state) => state.workspaces);
  const workspace = workspaces.find((item) => item.id === workspaceId);
  const workspaceCreateProgress = workspaceCreateProgressStore((state) => state.progressByWorkspaceId[workspaceId]);
  const platform = getRendererPlatform();
  const isPreparingWorkspace = workspace?.status === "provisioning" && Boolean(workspaceCreateProgress);

  const handleAgentLaunch = useCallback(
    (agentKind: DesktopAgentKind) => {
      openTabWithContentSeed({
        workspaceId,
        kind: "terminal",
        title: t(AGENT_SETTINGS_LABEL_KEY_BY_KIND[agentKind]),
        launchCommand: DEFAULT_AGENT_COMMANDS[agentKind],
        agentKind,
        reuseExisting: false,
      });
    },
    [t, workspaceId],
  );

  const launchActions: LaunchAction[] = [
    {
      id: "agent-chat",
      label: t("launch.actions.openAgentChat"),
      shortcutLabel: getShortcutDisplayLabelById("open-agent-chat", platform),
      icon: <LuSparkles size={16} />,
      onClick: () =>
        openTabWithContentSeed({
          workspaceId,
          kind: "agent-chat",
          title: t("agentChat.title"),
          cwd: workspace?.worktreePath || undefined,
        }),
    },
    {
      id: "whiteboard",
      label: t("launch.actions.openWhiteboard"),
      shortcutLabel: getShortcutDisplayLabelById("open-whiteboard", platform),
      icon: <LuPencil size={16} />,
      onClick: () => {
        void createNewWhiteboard(workspaceId);
      },
    },
    {
      id: "browser",
      label: t("launch.actions.openBrowser"),
      shortcutLabel: getShortcutDisplayLabelById("open-browser", platform),
      icon: <LuGlobe size={16} />,
      onClick: () => openTabWithContentSeed({ workspaceId, kind: "browser", url: "" }),
    },
    {
      id: "terminal",
      label: t("launch.actions.openTerminal"),
      shortcutLabel: getShortcutDisplayLabelById("open-terminal", platform),
      icon: <LuSquareTerminal size={16} />,
      onClick: () =>
        openTabWithContentSeed({
          workspaceId,
          kind: "terminal",
          title: t("terminal.title"),
          reuseExisting: false,
        }),
    },
    {
      id: "search-files",
      label: t("launch.actions.searchFiles"),
      shortcutLabel: getShortcutDisplayLabelById("open-file-search", platform),
      icon: <LuSearch size={16} />,
      onClick: openWorkspaceFileSearch,
    },
  ];

  if (isPreparingWorkspace && workspaceCreateProgress) {
    return <LaunchPreparingWorkspace progress={workspaceCreateProgress} />;
  }

  return (
    <LaunchActionsPanel
      workspaceId={workspaceId}
      workspacePath={workspace?.worktreePath}
      enabledAgentKinds={enabledAgentKinds}
      launchActions={launchActions}
      onAgentLaunch={handleAgentLaunch}
    />
  );
}
