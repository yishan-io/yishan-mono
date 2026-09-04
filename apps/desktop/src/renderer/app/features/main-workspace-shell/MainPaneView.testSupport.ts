/** Builds the default immutable test state for MainPaneView test modules. */
export function buildMainPaneStoreState(isInitializing: boolean) {
  return {
    projects: [{ id: "repo-1", name: "Repo 1", path: "/tmp/repo-1" }],
    displayProjectIds: ["repo-1"],
    selectedProjectId: "repo-1",
    workspaces: [
      { id: "workspace-1", repoId: "repo-1", branch: "origin/main", title: "Workspace 1", name: "Workspace 1" },
    ],
    selectedWorkspaceId: "workspace-1",
    tabs: [
      {
        id: "tab-1",
        workspaceId: "workspace-1",
        title: "Chat A",
        pinned: false,
        kind: "agent-chat",
        data: { cwd: "/tmp/project", sessionId: isInitializing ? "" : "session-1", sessionView: "full" },
      },
    ],
    selectedTabId: "tab-1",
    listDetectedPorts: async () => [],
    activateProject: () => undefined,
    activateWorkspace: () => undefined,
    selectTab: () => undefined,
    createTab: () => undefined,
    openTab: () => undefined,
    closeTab: () => undefined,
    closeOtherTabs: () => undefined,
    closeAllTabs: () => undefined,
    toggleTabPinned: () => undefined,
    reorderTab: () => undefined,
    renameTab: () => undefined,
    readFile: () => undefined,
    readDiff: () => undefined,
    readCommitDiff: () => undefined,
    readBranchComparisonDiff: () => undefined,
    refreshFileTabFromDisk: () => undefined,
    refreshDiffTabContent: () => undefined,
    updateFileTabContent: () => undefined,
    markFileTabSaved: () => undefined,
    unreadTones: {},
  };
}
