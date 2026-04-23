import { Box, Typography } from "@mui/material";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { LuSquareTerminal } from "react-icons/lu";
import { FileEditor } from "../../components/FileEditor";
import { ProjectDiffViewer } from "../../components/ProjectDiffViewer";
import { TabBar, type TabBarCreateOption } from "../../components/TabBar";
import { getFileTreeIcon } from "../../components/fileTreeIcons";
import { type DesktopAgentKind, SUPPORTED_DESKTOP_AGENT_KINDS } from "../../helpers/agentSettings";
import { useCommands } from "../../hooks/useCommands";
import { agentSettingsStore } from "../../store/agentSettingsStore";
import { tabStore } from "../../store/tabStore";
import { workspaceStore } from "../../store/workspaceStore";
import { DARK_SURFACE_COLORS } from "../../theme";
import { LaunchView } from "./LaunchView";
import { MainPaneTitleBarView } from "./MainPaneTitleBarView";
import { TerminalView } from "./TerminalView";

const paneHeaderSx = {
  minHeight: 42,
  px: 1.5,
  borderBottom: 1,
  borderColor: "divider",
  display: "flex",
  alignItems: "center",
} as const;

const agentTerminalConfigs: Record<
  Extract<TabBarCreateOption, DesktopAgentKind>,
  { title: string; command: string }
> = {
  opencode: {
    title: "OpenCode",
    command: "opencode",
  },
  codex: {
    title: "Codex",
    command: "codex",
  },
  claude: {
    title: "Claude",
    command: "claude",
  },
};

/** Creates a terminal tab payload that launches one agent CLI command. */
function buildAgentTerminalInput(agentKind: DesktopAgentKind) {
  const config = agentTerminalConfigs[agentKind];
  return {
    kind: "terminal" as const,
    title: config.title,
    launchCommand: config.command,
    agentKind,
    reuseExisting: false,
  };
}

/** Creates a plain terminal tab payload without one prefilled launch command. */
function buildTerminalInput(title: string) {
  return {
    kind: "terminal" as const,
    title,
    reuseExisting: false,
  };
}

/** Renders the primary workspace pane with tabbed content, per-tab views, and pane visibility controls. */
export function MainPaneView() {
  const { t } = useTranslation();
  const workspaces = workspaceStore((state) => state.workspaces);
  const selectedWorkspaceId = workspaceStore((state) => state.selectedWorkspaceId);
  const tabs = tabStore((state) => state.tabs);
  const selectedTabId = tabStore((state) => state.selectedTabId);
  const {
    setSelectedTabId,
    openTab,
    closeTab,
    closeOtherTabs,
    closeAllTabs,
    toggleTabPinned,
    reorderTab,
    renameTab,
    updateFileTabContent,
    markFileTabSaved,
    writeFile,
  } = useCommands();
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId);
  const inUseByAgentKind = agentSettingsStore((state) => state.inUseByAgentKind);
  const workspaceTabs = tabs.filter((tab) => tab.workspaceId === selectedWorkspaceId);
  const terminalTabs = tabs.filter((tab) => tab.kind === "terminal");
  const nonTerminalWorkspaceTabs = workspaceTabs.filter((tab) => tab.kind !== "terminal");
  const orderedWorkspaceTabs = [...workspaceTabs].sort((leftTab, rightTab) => {
    if (leftTab.pinned === rightTab.pinned) {
      return 0;
    }
    return leftTab.pinned ? -1 : 1;
  });
  const tabBarTabs = orderedWorkspaceTabs.map((tab) => ({
    id: tab.id,
    title: tab.title,
    pinned: tab.pinned,
    kind: tab.kind,
    isDirty: tab.kind === "file" ? tab.data.isDirty : false,
    isTemporary: tab.kind === "file" ? tab.data.isTemporary : false,
  }));
  const selectedTab = workspaceTabs.find((tab) => tab.id === selectedTabId);
  const hasWorkspaceTabs = workspaceTabs.length > 0;
  const enabledAgentKinds = useMemo(
    () => SUPPORTED_DESKTOP_AGENT_KINDS.filter((agentKind) => inUseByAgentKind[agentKind]),
    [inUseByAgentKind],
  );
  const enabledAgentKindSet = useMemo(() => new Set(enabledAgentKinds), [enabledAgentKinds]);

  /** Handles tab creation from the tab bar type selector menu. */
  const handleCreateTab = (option: TabBarCreateOption) => {
    if (option === "terminal") {
      openTab({
        workspaceId: selectedWorkspaceId,
        ...buildTerminalInput(t("terminal.title")),
      });
      return;
    }

    if (!enabledAgentKindSet.has(option)) {
      return;
    }

    openTab({
      workspaceId: selectedWorkspaceId,
      ...buildAgentTerminalInput(option),
    });
  };

  return (
    <Box
      data-testid="dashboard-main"
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        bgcolor: (theme) =>
          theme.palette.mode === "dark" ? DARK_SURFACE_COLORS.mainPane : theme.palette.background.default,
      }}
    >
      <MainPaneTitleBarView />
      <Box sx={{ ...paneHeaderSx, minWidth: 0 }}>
        <TabBar
          tabs={tabBarTabs}
          selectedTabId={selectedTabId}
          onSelectTab={setSelectedTabId}
          onCloseTab={closeTab}
          onCloseOtherTabs={closeOtherTabs}
          onCloseAllTabs={closeAllTabs}
          onTogglePinTab={toggleTabPinned}
          onReorderTab={reorderTab}
          onCreateTab={handleCreateTab}
          onRenameTab={renameTab}
          enabledAgentKinds={enabledAgentKinds}
          getTabIcon={(tab) => {
            const fullTab = workspaceTabs.find((item) => item.id === tab.id);

            if (fullTab?.kind === "terminal") {
              return <LuSquareTerminal size={14} />;
            }

            if (fullTab?.kind === "file" || fullTab?.kind === "diff") {
              return (
                <Box
                  component="img"
                  src={getFileTreeIcon(fullTab.data.path, false)}
                  alt=""
                  sx={{ width: 14, height: 14, flexShrink: 0 }}
                />
              );
            }

            return null;
          }}
          disabled={!selectedWorkspaceId}
        />
      </Box>
      <Box sx={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {nonTerminalWorkspaceTabs.map((tab) => {
          const isSelected = tab.id === selectedTabId;
          if (tab.kind === "diff") {
            return (
              <Box
                key={tab.id}
                sx={{
                  position: "absolute",
                  inset: 0,
                  display: isSelected ? "flex" : "none",
                  flexDirection: "column",
                }}
              >
                <ProjectDiffViewer
                  filePath={tab.data.path}
                  oldContent={tab.data.oldContent ?? ""}
                  newContent={tab.data.newContent ?? ""}
                />
              </Box>
            );
          }

          if (tab.kind === "file") {
            return (
              <Box
                key={tab.id}
                sx={{
                  position: "absolute",
                  inset: 0,
                  display: isSelected ? "flex" : "none",
                  flexDirection: "column",
                }}
              >
                <FileEditor
                  path={tab.data.path}
                  content={tab.data.content ?? ""}
                  onContentChange={(nextContent) => {
                    updateFileTabContent(tab.id, nextContent);
                  }}
                  onSave={async (nextContent) => {
                    const workspaceWorktreePath = selectedWorkspace?.worktreePath;
                    if (!workspaceWorktreePath) {
                      return;
                    }

                    try {
                      await writeFile({
                        workspaceWorktreePath,
                        relativePath: tab.data.path,
                        content: nextContent,
                      });

                      updateFileTabContent(tab.id, nextContent);
                      markFileTabSaved(tab.id);
                    } catch (error) {
                      console.error("Failed to save workspace file", error);
                    }
                  }}
                />
              </Box>
            );
          }

          if (tab.kind === "session") {
            return (
              <Box
                key={tab.id}
                sx={{
                  position: "absolute",
                  inset: 0,
                  display: isSelected ? "flex" : "none",
                  flexDirection: "column",
                }}
              >
                <Box
                  sx={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 1.5,
                  }}
                >
                  <Typography variant="body2" color="text.secondary">
                    Chat is currently disabled.
                  </Typography>
                </Box>
              </Box>
            );
          }

          return null;
        })}
        {terminalTabs.map((tab) => {
          const isSelectedWorkspaceTab = tab.workspaceId === selectedWorkspaceId;
          const isSelected = isSelectedWorkspaceTab && tab.id === selectedTabId;

          return (
            <Box
              key={tab.id}
              sx={{
                position: "absolute",
                inset: 0,
                display: isSelected ? "flex" : "none",
                flexDirection: "column",
              }}
            >
              <TerminalView tabId={tab.id} />
            </Box>
          );
        })}
        {!hasWorkspaceTabs ? (
          <Box
            sx={{
              position: "absolute",
              inset: 0,
            }}
          >
            <LaunchView />
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}
