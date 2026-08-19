// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, createEvent, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { inspectGitRepository } from "../../../domains/git/commands/gitCommands";
import { OPEN_CREATE_WORKSPACE_DIALOG_EVENT } from "../../../domains/workspace/commands/workspaceCommands";
import { WorkspaceNavigatorView } from "./WorkspaceNavigatorView";

const mocked = vi.hoisted(() => {
  const renameWorkspace = vi.fn();
  const renameWorkspaceBranch = vi.fn();
  const closeWorkspace = vi.fn();
  const deleteProject = vi.fn();
  const activateProject = vi.fn();
  const activateWorkspace = vi.fn();
  const setLastUsedExternalAppId = vi.fn();
  const openEntryInExternalApp = vi.fn();
  const listDetectedExternalAppIds = vi.fn();
  const deleteLocalFolder = vi.fn();
  const reorderWorkspace = vi.fn();
  let rendererPlatform = "darwin";

  const stateRef: {
    current: {
      projects: Array<{
        id: string;
        name: string;
        path: string;
        missing: boolean;
        worktreePath: string;
        icon: string;
        color: string;
      }>;
      workspaces: Array<{
        id: string;
        repoId: string;
        name: string;
        title: string;
        sourceBranch: string;
        branch: string;
        summaryId: string;
        worktreePath?: string;
        projectId?: string;
        nodeId?: string;
        kind?: "managed" | "local" | "folder";
        status?: "active" | "closed" | "provisioning";
      }>;
      selectedProjectId: string;
      selectedWorkspaceId: string;
      displayProjectIds: string[];
      lastUsedExternalAppId?: string;
      pullRequestByWorkspaceId: Record<string, unknown>;
      latestPullRequestByWorkspaceId: Record<string, unknown>;
      currentBranchByWorkspaceId: Record<string, string>;
      setWorkspaceCurrentBranch: (workspaceId: string, branch: string) => void;
      gitChangeTotalsByWorkspaceId: Record<string, { additions: number; deletions: number }>;
      setLastUsedExternalAppId: (appId: string) => void;
      renameWorkspace: (input: { repoId: string; workspaceId: string; name: string }) => Promise<void>;
      renameWorkspaceBranch: (input: { repoId: string; workspaceId: string; branch: string }) => Promise<void>;
      closeWorkspace: (input: { repoId: string; workspaceId: string }) => Promise<void>;
      deleteProject: (input: { repoId: string }) => Promise<void>;
      workspaceAgentStatusByWorkspaceId: Record<string, "running" | "waiting_input">;
      workspaceUnreadToneByWorkspaceId: Record<string, "success" | "error">;
      markWorkspaceNotificationsRead: (workspaceId: string) => void;
      orderedWorkspaceIds: string[];
      setOrderedWorkspaceIds: (ids: string[]) => void;
      progressByWorkspaceId: Record<string, { isComplete: boolean }>;
    };
  } = {
    current: {
      projects: [],
      workspaces: [],
      selectedProjectId: "",
      selectedWorkspaceId: "",
      displayProjectIds: [],
      lastUsedExternalAppId: undefined,
      pullRequestByWorkspaceId: {},
      latestPullRequestByWorkspaceId: {},
      currentBranchByWorkspaceId: {},
      setWorkspaceCurrentBranch: (workspaceId: string, branch: string) => {
        stateRef.current.currentBranchByWorkspaceId = {
          ...stateRef.current.currentBranchByWorkspaceId,
          [workspaceId]: branch,
        };
      },
      gitChangeTotalsByWorkspaceId: {},
      setLastUsedExternalAppId,
      renameWorkspace: async () => undefined,
      renameWorkspaceBranch: async () => undefined,
      closeWorkspace: async () => undefined,
      deleteProject: async () => undefined,
      workspaceAgentStatusByWorkspaceId: {},
      workspaceUnreadToneByWorkspaceId: {},
      markWorkspaceNotificationsRead: () => {},
      orderedWorkspaceIds: [],
      setOrderedWorkspaceIds: () => {},
      progressByWorkspaceId: {},
    },
  };

  const markWorkspaceNotificationsRead = vi.fn((workspaceId: string) => {
    const trimmedWorkspaceId = workspaceId.trim();
    if (!trimmedWorkspaceId) {
      return;
    }

    const { [trimmedWorkspaceId]: _removed, ...rest } = stateRef.current.workspaceUnreadToneByWorkspaceId;
    stateRef.current.workspaceUnreadToneByWorkspaceId = rest;
  });
  stateRef.current.markWorkspaceNotificationsRead = markWorkspaceNotificationsRead;

  const workspaceStore = Object.assign(
    vi.fn((selector: (state: typeof stateRef.current) => unknown) => selector(stateRef.current)),
    { getState: () => stateRef.current },
  );

  return {
    renameWorkspace,
    renameWorkspaceBranch,
    closeWorkspace,
    deleteProject,
    activateProject,
    activateWorkspace,
    setLastUsedExternalAppId,
    openEntryInExternalApp,
    listDetectedExternalAppIds,
    markWorkspaceNotificationsRead,
    setWorkspaceCurrentBranch: vi.fn((workspaceId: string, branch: string) => {
      stateRef.current.currentBranchByWorkspaceId = {
        ...stateRef.current.currentBranchByWorkspaceId,
        [workspaceId]: branch,
      };
    }),
    get rendererPlatform() {
      return rendererPlatform;
    },
    set rendererPlatform(value: string) {
      rendererPlatform = value;
    },
    stateRef,
    deleteLocalFolder,
    reorderWorkspace,
    workspaceStore,
  };
});

vi.mock("react-i18next", () => ({
  initReactI18next: {
    type: "3rdParty",
    init: () => undefined,
  },
  useTranslation: () => ({
    t: (key: string, params?: { app?: string }) =>
      key === "workspace.actions.openInExternalAppQuick"
        ? `workspace.actions.openInExternalAppQuick:${params?.app}`
        : key === "layout.toggleWithShortcut"
          ? `${(params as { label?: string; shortcut?: string } | undefined)?.label ?? ""} (${(params as { label?: string; shortcut?: string } | undefined)?.shortcut ?? ""})`
          : key,
  }),
}));

vi.mock("../../../shortcuts/shortcutDisplay", () => ({
  getShortcutDisplayLabelById: (shortcutId: string) => {
    if (shortcutId === "create-workspace") {
      return "⌘+N";
    }

    return null;
  },
}));

vi.mock("../../../domains/workspace/features/create-workspace/CreateWorkspaceDialogView", () => ({
  CreateWorkspaceDialogView: ({ open }: { open: boolean }) =>
    open ? <div data-testid="create-workspace-dialog" /> : null,
}));

vi.mock("../../../domains/workspace/features/rename-workspace/RenameWorkspaceDialogView", () => ({
  RenameWorkspaceDialogView: ({ open }: { open: boolean }) =>
    open ? <div data-testid="rename-workspace-dialog" /> : null,
}));

vi.mock("@renderer/domains/workspace", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@renderer/domains/workspace")>();
  return {
    ...actual,
    useSelectedProjectId: () => mocked.stateRef.current.selectedProjectId ?? "",
    useSelectedWorkspaceId: () => mocked.stateRef.current.selectedWorkspaceId ?? "",
    useWorkspaces: () => mocked.stateRef.current.workspaces ?? [],
    useSelectedWorkspaceWorktreePath: () => "",
    setOrderedWorkspaceIds: vi.fn(),
    closeWorkspace: mocked.closeWorkspace,
    deleteLocalFolder: mocked.deleteLocalFolder,
    reorderWorkspace: mocked.reorderWorkspace,
    setLastUsedExternalAppId: mocked.setLastUsedExternalAppId,
  };
});

vi.mock("@renderer/domains/project", async () => {
  // The workspace feature graph (reached through @renderer/domains/workspace)
  // imports project public-API members; load the stateless ones from deep
  // paths (async factory avoids the project<->workspace index cycle).
  const sharedWorkspace = await import("@shared/workspace/localFolderProjectId");
  const projectCapability = await import("../../../domains/project/model/projectGitCapability");
  const projectListRules = await import("../../../domains/project/model/projectListRules");
  const projectSelectors = await import("../../../domains/project/state/projectSelectors");
  const projectReadHooks = await import("../../../domains/project/hooks/useProjectReadHooks");
  const projectActions = await import("../../../domains/project/state/projectActions");
  const projectDeletionFlow = await import("../../../domains/project/features/project-delete/useProjectDeletionFlow");
  const projectDeleteDialog = await import("../../../domains/project/features/project-delete/ProjectDeleteDialogView");
  return {
    deleteProject: mocked.deleteProject,
    LOCAL_FOLDER_PROJECT_ID: sharedWorkspace.LOCAL_FOLDER_PROJECT_ID,
    supportsGitFeatures: projectCapability.supportsGitFeatures,
    filterVisibleProjects: projectListRules.filterVisibleProjects,
    selectProjectById: projectSelectors.selectProjectById,
    selectProjectDisplayIds: projectSelectors.selectProjectDisplayIds,
    selectProjects: projectSelectors.selectProjects,
    useProjects: projectReadHooks.useProjects,
    useDisplayProjectIds: projectReadHooks.useDisplayProjectIds,
    useWorkspaceListHierarchyMode: projectReadHooks.useWorkspaceListHierarchyMode,
    useLastUsedExternalAppId: projectReadHooks.useLastUsedExternalAppId,
    setWorkspaceListHierarchyMode: projectActions.setWorkspaceListHierarchyMode,
    renderProjectIcon: () => "R",
    ProjectDeleteDialogView: projectDeleteDialog.ProjectDeleteDialogView,
    useProjectDeletionFlow: projectDeletionFlow.useProjectDeletionFlow,
    ProjectConfigDialogView: ({ open }: { open: boolean }) => (open ? <div data-testid="repo-config-dialog" /> : null),
    getProjectListPreferences: async () => ({
      version: 1,
      by_project: {
        projectOrderIds: [],
        nodeOrderByParentId: {},
        foldedProjectIds: [],
        foldedNodeKeys: [],
      },
      by_node: {
        projectOrderIds: [],
        nodeOrderByParentId: {},
        foldedProjectIds: [],
        foldedNodeKeys: [],
      },
      workspaceOrderByParentId: {},
    }),
    setProjectListPreferences: async () => undefined,
  };
});

vi.mock("../../../domains/workspace/state/workspaceStore", () => ({
  workspaceStore: mocked.workspaceStore,
}));

vi.mock("@renderer/domains/workbench", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@renderer/domains/workbench")>();
  const navState = () => ({
    activeProjectId: mocked.stateRef.current.selectedProjectId ?? "",
    activeWorkspaceId: mocked.stateRef.current.selectedWorkspaceId ?? "",
    overlayPanel: null,
  });
  const navStore = Object.assign(
    vi.fn((selector: (state: Record<string, unknown>) => unknown) => {
      return selector(navState());
    }),
    {
      getState: navState,
      subscribe: vi.fn(() => () => {}),
      setState: vi.fn((partial: Record<string, unknown>) => {
        Object.assign(mocked.stateRef.current, partial);
      }),
    },
  );
  return {
    ...actual,
    activateProject: mocked.activateProject,
    activateWorkspace: mocked.activateWorkspace,
    workbenchNavigationStore: navStore,
  };
});

vi.mock("../../../domains/git/state/gitProjectionStore", () => {
  const project = (
    selector: (state: {
      pullRequestByWorkspaceId: Record<string, unknown>;
      currentBranchByWorkspaceId: Record<string, string>;
      gitChangeTotalsByWorkspaceId: Record<string, { additions: number; deletions: number }>;
      setWorkspaceCurrentBranch: (id: string, branch: string) => void;
    }) => unknown,
  ) =>
    selector({
      pullRequestByWorkspaceId: mocked.stateRef.current.pullRequestByWorkspaceId,
      currentBranchByWorkspaceId: mocked.stateRef.current.currentBranchByWorkspaceId,
      gitChangeTotalsByWorkspaceId: mocked.stateRef.current.gitChangeTotalsByWorkspaceId,
      setWorkspaceCurrentBranch: mocked.stateRef.current.setWorkspaceCurrentBranch,
    });
  (project as unknown as { getState: () => typeof mocked.stateRef.current }).getState = () => mocked.stateRef.current;
  return { gitProjectionStore: project };
});

vi.mock("../../../domains/project/state/projectStore", () => {
  const projectStore = (
    selector: (state: { projects: unknown[]; displayProjectIds: string[]; lastUsedExternalAppId?: string }) => unknown,
  ) =>
    selector({
      projects: mocked.stateRef.current.projects ?? [],
      displayProjectIds: mocked.stateRef.current.displayProjectIds ?? [],
      lastUsedExternalAppId: mocked.stateRef.current.lastUsedExternalAppId as string | undefined,
    });
  (
    projectStore as unknown as {
      getState: () => { projects: unknown[]; displayProjectIds: string[]; lastUsedExternalAppId?: string };
    }
  ).getState = () => ({
    projects: mocked.stateRef.current.projects ?? [],
    displayProjectIds: mocked.stateRef.current.displayProjectIds ?? [],
    lastUsedExternalAppId: mocked.stateRef.current.lastUsedExternalAppId as string | undefined,
  });
  return { projectStore };
});

vi.mock("../../../domains/session/state/sessionStore", () => ({
  sessionStore: vi.fn((selector: (state: { selectedOrganizationId: string }) => unknown) =>
    selector({ selectedOrganizationId: "" }),
  ),
}));

vi.mock("../../../rpc/rpcTransport", () => ({
  subscribeDaemonConnectionStatus: vi.fn(() => vi.fn()),
  subscribeDesktopRpcEvent: vi.fn(() => vi.fn()),
  getDaemonClient: vi.fn(async () => ({
    project: {
      getListPreferences: vi.fn(async () => ({
        version: 1,
        by_project: { projectOrderIds: [], nodeOrderByParentId: {}, foldedProjectIds: [], foldedNodeKeys: [] },
        by_node: { projectOrderIds: [], nodeOrderByParentId: {}, foldedProjectIds: [], foldedNodeKeys: [] },
        workspaceOrderByParentId: {},
      })),
      setListPreferences: vi.fn(async () => ({ ok: true })),
    },
  })),
}));

vi.mock("../../../domains/agent/state/chatStore", () => ({
  chatStore: mocked.workspaceStore,
}));

vi.mock("../../../domains/workspace/state/workspaceCreateProgressStore", () => ({
  workspaceCreateProgressStore: vi.fn(
    (selector: (state: { progressByWorkspaceId: Record<string, { isComplete: boolean }> }) => unknown) =>
      selector({ progressByWorkspaceId: mocked.stateRef.current.progressByWorkspaceId }),
  ),
}));

vi.mock("../../../domains/files/commands/fileCommands", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../domains/files/commands/fileCommands")>();
  return {
    ...actual,
    openEntryInExternalApp: (...args: unknown[]) => mocked.openEntryInExternalApp(...args),
    listDetectedExternalAppIds: (...args: unknown[]) => mocked.listDetectedExternalAppIds(...args),
  };
});

vi.mock("../../../domains/git/commands/gitCommands", () => ({
  // Full mock (no importOriginal) — importOriginal recurses through workspace ->
  // create-workspace -> git index and leaks the real inspectGitRepository (D10).
  inspectGitRepository: vi.fn(() => Promise.resolve({ isGitRepository: true, currentBranch: "feature/live-branch" })),
  listGitBranches: vi.fn(async () => ({ branches: [] })),
  readDiff: vi.fn(),
  readCommitDiff: vi.fn(),
  readBranchComparisonDiff: vi.fn(),
  listGitChanges: vi.fn(),
  listGitCommitsToTarget: vi.fn(),
  getGitAuthorName: vi.fn(),
  revertGitChanges: vi.fn(),
  trackGitChanges: vi.fn(),
  unstageGitChanges: vi.fn(),
  mergePullRequest: vi.fn(),
  closePullRequest: vi.fn(),
}));

vi.mock("@renderer/platform/platform", () => ({
  getRendererPlatform: () => mocked.rendererPlatform,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocked.rendererPlatform = "darwin";
  mocked.stateRef.current.progressByWorkspaceId = {};
});

function renderWorkspaceNavigatorView() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <WorkspaceNavigatorView />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Renders the project list with one non-git local-folder workspace. */
function renderFolderList() {
  mocked.deleteLocalFolder.mockResolvedValue(undefined);
  mocked.stateRef.current = {
    projects: [
      {
        id: "repo-1",
        name: "Repo 1",
        path: "/tmp/repo-1",
        missing: false,
        worktreePath: "/tmp/worktrees",
        icon: "folder",
        color: "#111111",
      },
    ],
    workspaces: [
      {
        id: "folder-1",
        repoId: "folder-1",
        projectId: "local-folder",
        nodeId: "node-1",
        name: "My Folder",
        title: "My Folder",
        sourceBranch: "",
        branch: "",
        summaryId: "folder-1",
        worktreePath: "/tmp/my-folder",
        kind: "folder",
        status: "active",
      },
    ],
    selectedProjectId: "local-folder",
    selectedWorkspaceId: "folder-1",
    displayProjectIds: ["repo-1"],
    lastUsedExternalAppId: undefined,
    pullRequestByWorkspaceId: {},
    latestPullRequestByWorkspaceId: {},
    currentBranchByWorkspaceId: {},
    setWorkspaceCurrentBranch: mocked.setWorkspaceCurrentBranch,
    gitChangeTotalsByWorkspaceId: {},
    setLastUsedExternalAppId: mocked.setLastUsedExternalAppId,
    renameWorkspace: mocked.renameWorkspace,
    renameWorkspaceBranch: mocked.renameWorkspaceBranch,
    closeWorkspace: mocked.closeWorkspace,
    deleteProject: mocked.deleteProject,
    workspaceAgentStatusByWorkspaceId: {},
    workspaceUnreadToneByWorkspaceId: {},
    markWorkspaceNotificationsRead: mocked.markWorkspaceNotificationsRead,
    orderedWorkspaceIds: [],
    setOrderedWorkspaceIds: vi.fn(),
    progressByWorkspaceId: {},
  };
  renderWorkspaceNavigatorView();
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

function renderRepoList(
  foldedRepoIds: string[] = [],
  lastUsedExternalAppId?: string,
  selectedWorkspaceId = "workspace-1",
  detectedExternalAppIds: string[] | Error | Promise<string[]> = new Error("unavailable"),
) {
  mocked.renameWorkspace.mockResolvedValue(undefined);
  mocked.renameWorkspaceBranch.mockResolvedValue(undefined);
  mocked.closeWorkspace.mockResolvedValue(undefined);
  mocked.deleteProject.mockResolvedValue(undefined);
  mocked.openEntryInExternalApp.mockResolvedValue({ ok: true });
  if (detectedExternalAppIds instanceof Error) {
    mocked.listDetectedExternalAppIds.mockRejectedValue(detectedExternalAppIds);
  } else if (detectedExternalAppIds instanceof Promise) {
    mocked.listDetectedExternalAppIds.mockReturnValue(detectedExternalAppIds);
  } else {
    mocked.listDetectedExternalAppIds.mockResolvedValue(detectedExternalAppIds);
  }
  mocked.stateRef.current = {
    projects: [
      {
        id: "repo-1",
        name: "Repo 1",
        path: "/tmp/repo-1",
        missing: false,
        worktreePath: "/tmp/worktrees",
        icon: "folder",
        color: "#111111",
      },
    ],
    workspaces: [
      {
        id: "workspace-1",
        repoId: "repo-1",
        name: "Workspace 1",
        title: "Workspace 1",
        sourceBranch: "main",
        branch: "feature/repo-fold",
        summaryId: "summary-1",
        worktreePath: "/tmp/worktrees/workspace-1",
      },
    ],
    selectedProjectId: "repo-1",
    selectedWorkspaceId,
    displayProjectIds: ["repo-1"],
    lastUsedExternalAppId,
    pullRequestByWorkspaceId: {},
    latestPullRequestByWorkspaceId: {},
    currentBranchByWorkspaceId: { "workspace-1": "feature/live-branch" },
    setWorkspaceCurrentBranch: mocked.setWorkspaceCurrentBranch,
    gitChangeTotalsByWorkspaceId: {
      "workspace-1": { additions: 12, deletions: 4 },
    },
    setLastUsedExternalAppId: mocked.setLastUsedExternalAppId,
    renameWorkspace: mocked.renameWorkspace,
    renameWorkspaceBranch: mocked.renameWorkspaceBranch,
    closeWorkspace: mocked.closeWorkspace,
    deleteProject: mocked.deleteProject,
    workspaceAgentStatusByWorkspaceId: {},
    workspaceUnreadToneByWorkspaceId: {},
    markWorkspaceNotificationsRead: mocked.markWorkspaceNotificationsRead,
    orderedWorkspaceIds: [],
    setOrderedWorkspaceIds: vi.fn(),
    progressByWorkspaceId: {},
  };

  const queryClient = new QueryClient();
  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <WorkspaceNavigatorView />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  if (foldedRepoIds.includes("repo-1")) {
    fireEvent.click(screen.getByRole("button", { name: "repo.actions.collapse" }));
  }

  return {
    onRenameWorkspace: mocked.renameWorkspace,
    onRenameWorkspaceBranch: mocked.renameWorkspaceBranch,
    rerender: (ui: React.ReactElement) =>
      rendered.rerender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>),
  };
}

describe("WorkspaceNavigatorView", () => {
  it("shows workspace items when repository is expanded", () => {
    renderRepoList();

    expect(screen.getByText("Workspace 1")).toBeTruthy();
    expect(screen.getByRole("button", { name: "repo.actions.collapse" })).toBeTruthy();
  });

  it("renders workspace name as one truncated line without inline branch label", () => {
    renderRepoList();

    const workspaceName = screen.getByTestId("workspace-name-workspace-1");
    expect(workspaceName.className).toContain("MuiTypography-noWrap");
    expect(screen.queryByText("feature/repo-fold")).toBeNull();
  });

  it("renders workspace git change totals beside workspace row", () => {
    renderRepoList();

    const totals = screen.getByTestId("workspace-change-totals-workspace-1");
    expect(totals.textContent).toContain("+12");
    expect(totals.textContent).toContain("-4");
  });

  it("does not render workspace git totals when no totals are cached", () => {
    mocked.stateRef.current = {
      ...mocked.stateRef.current,
      projects: [
        {
          id: "repo-1",
          name: "Repo 1",
          path: "/tmp/repo-1",
          missing: false,
          worktreePath: "/tmp/worktrees",
          icon: "folder",
          color: "#111111",
        },
      ],
      workspaces: [
        {
          id: "workspace-1",
          repoId: "repo-1",
          name: "Workspace 1",
          title: "Workspace 1",
          sourceBranch: "main",
          branch: "feature/repo-fold",
          summaryId: "summary-1",
          worktreePath: "/tmp/worktrees/workspace-1",
        },
      ],
      selectedProjectId: "repo-1",
      selectedWorkspaceId: "workspace-1",
      displayProjectIds: ["repo-1"],
      pullRequestByWorkspaceId: {},
      currentBranchByWorkspaceId: {},
      gitChangeTotalsByWorkspaceId: {},
      setWorkspaceCurrentBranch: mocked.setWorkspaceCurrentBranch,
    };

    renderWorkspaceNavigatorView();

    expect(screen.queryByTestId("workspace-change-totals-workspace-1")).toBeNull();
  });

  it("shows create-workspace shortcut in repo add tooltip", async () => {
    renderRepoList();

    fireEvent.mouseOver(screen.getByRole("button", { name: "workspace.actions.add" }));

    expect(await screen.findByText("workspace.actions.add (⌘+N)")).toBeTruthy();
  });

  it("opens create-workspace dialog when command shortcut event is dispatched", async () => {
    renderRepoList();

    act(() => {
      window.dispatchEvent(
        new CustomEvent(OPEN_CREATE_WORKSPACE_DIALOG_EVENT, {
          detail: { repoId: "repo-1" },
        }),
      );
    });

    expect(await screen.findByTestId("create-workspace-dialog")).toBeTruthy();
  });

  it("renders local workspace rows with a computer icon and no delete action", () => {
    mocked.stateRef.current = {
      projects: [
        {
          id: "repo-1",
          name: "Repo 1",
          path: "/tmp/repo-1",
          missing: false,
          worktreePath: "/tmp/worktrees",
          icon: "folder",
          color: "#111111",
        },
      ],
      workspaces: [
        {
          id: "workspace-local-1",
          repoId: "repo-1",
          name: "local",
          title: "local",
          sourceBranch: "main",
          branch: "main",
          summaryId: "workspace-local-1",
          worktreePath: "/tmp/repo-1",
          kind: "local",
        },
      ],
      progressByWorkspaceId: {},
      selectedProjectId: "repo-1",
      selectedWorkspaceId: "workspace-local-1",
      displayProjectIds: ["repo-1"],
      lastUsedExternalAppId: undefined,
      pullRequestByWorkspaceId: {},
      latestPullRequestByWorkspaceId: {},
      currentBranchByWorkspaceId: {},
      setWorkspaceCurrentBranch: mocked.setWorkspaceCurrentBranch,
      gitChangeTotalsByWorkspaceId: {
        "workspace-local-1": { additions: 2, deletions: 1 },
      },
      setLastUsedExternalAppId: mocked.setLastUsedExternalAppId,
      renameWorkspace: mocked.renameWorkspace,
      renameWorkspaceBranch: mocked.renameWorkspaceBranch,
      closeWorkspace: mocked.closeWorkspace,
      deleteProject: mocked.deleteProject,
      workspaceAgentStatusByWorkspaceId: {},
      workspaceUnreadToneByWorkspaceId: {},
      markWorkspaceNotificationsRead: mocked.markWorkspaceNotificationsRead,
      orderedWorkspaceIds: [],
      setOrderedWorkspaceIds: vi.fn(),
    };
    renderWorkspaceNavigatorView();

    expect(screen.getByTestId("workspace-kind-local-workspace-local-1")).toBeTruthy();
    expect(screen.queryByTestId("workspace-actions-workspace-local-1")).toBeNull();

    fireEvent.contextMenu(screen.getByTestId("workspace-row-workspace-local-1"));
    expect(screen.queryByRole("menuitem", { name: "workspace.actions.rename" })).toBeNull();
  });

  it("hides workspace items when repository is folded and exposes expand action", () => {
    renderRepoList(["repo-1"]);

    expect(screen.queryByText("Workspace 1")).toBeNull();
    expect(screen.getByRole("button", { name: "repo.actions.expand" })).toBeTruthy();
  });

  it("toggles repository fold without selecting repository", () => {
    const { onRenameWorkspace } = renderRepoList();

    mocked.activateProject.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "repo.actions.collapse" }));

    expect(screen.queryByText("Workspace 1")).toBeNull();
    expect(mocked.activateProject).not.toHaveBeenCalled();
    expect(onRenameWorkspace).not.toHaveBeenCalled();
  });

  it("opens context menu on right click and deletes repository from menu action", async () => {
    renderRepoList();

    fireEvent.contextMenu(screen.getByText("Repo 1"));
    fireEvent.click(screen.getByRole("menuitem", { name: "project.actions.delete" }));
    fireEvent.click(screen.getByRole("button", { name: "project.actions.delete" }));

    await waitFor(() => {
      expect(mocked.deleteProject).toHaveBeenCalledWith("repo-1");
    });
  });

  it("opens context menu on right click and opens repo config from menu action", () => {
    renderRepoList();

    fireEvent.contextMenu(screen.getByText("Repo 1"));
    fireEvent.click(screen.getByRole("menuitem", { name: "project.actions.config" }));

    expect(screen.getByTestId("repo-config-dialog")).toBeTruthy();
  });

  it("suppresses native context menu while repo context menu is open", () => {
    renderRepoList();

    fireEvent.contextMenu(screen.getByText("Repo 1"));
    expect(screen.getByRole("menuitem", { name: "project.actions.config" })).toBeTruthy();

    const whileMenuOpenContextMenuEvent = createEvent.contextMenu(document.body, { cancelable: true });
    document.body.dispatchEvent(whileMenuOpenContextMenuEvent);
    expect(whileMenuOpenContextMenuEvent.defaultPrevented).toBe(true);

    cleanup();

    const afterUnmountContextMenuEvent = createEvent.contextMenu(document.body, { cancelable: true });
    document.body.dispatchEvent(afterUnmountContextMenuEvent);
    expect(afterUnmountContextMenuEvent.defaultPrevented).toBe(false);
  });

  it("opens workspace context menu on right click and deletes workspace from menu action", () => {
    renderRepoList();

    fireEvent.contextMenu(screen.getByTestId("workspace-row-workspace-1"));
    const closeWorkspaceMenuItem = screen.getByRole("menuitem", { name: "workspace.actions.delete" });
    expect(closeWorkspaceMenuItem.querySelector(".MuiListItemIcon-root")).toBeNull();
    fireEvent.click(closeWorkspaceMenuItem);
    expect(screen.getByText("workspace.delete.confirm")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "workspace.actions.delete" }));
    expect(mocked.closeWorkspace).toHaveBeenCalledWith("workspace-1", { removeBranch: true });
  });

  it("opens rename dialog from workspace context menu", () => {
    renderRepoList();
    fireEvent.contextMenu(screen.getByTestId("workspace-row-workspace-1"));
    fireEvent.click(screen.getByRole("menuitem", { name: "workspace.actions.rename" }));

    expect(screen.getByTestId("rename-workspace-dialog")).toBeTruthy();
  });

  it("shows delete-folder only (no git rename/delete) for a folder workspace context menu", async () => {
    mocked.listDetectedExternalAppIds.mockResolvedValue(["cursor"]);
    mocked.stateRef.current.lastUsedExternalAppId = "cursor";
    renderFolderList();

    await waitFor(() => {
      expect(mocked.listDetectedExternalAppIds).toHaveBeenCalled();
    });

    fireEvent.contextMenu(screen.getByTestId("workspace-row-folder-1"));

    // Folder menu = open-in-file-manager + delete-folder. No git actions.
    expect(screen.getByRole("menuitem", { name: "workspace.actions.deleteFolder" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "workspace.actions.rename" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "workspace.actions.delete" })).toBeNull();
    // External-app (IDE/quick-open) entries are hidden for folders even when
    // a usable app is detected for regular workspaces.
    expect(screen.queryByRole("menuitem", { name: /^workspace.actions.openInExternalAppQuick:/ })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "workspace.actions.openInExternalApp" })).toBeNull();
  });

  it("invokes the deleteLocalFolder command from the folder context menu", async () => {
    renderFolderList();

    fireEvent.contextMenu(screen.getByTestId("workspace-row-folder-1"));
    fireEvent.click(screen.getByRole("menuitem", { name: "workspace.actions.deleteFolder" }));

    await waitFor(() => {
      expect(mocked.deleteLocalFolder).toHaveBeenCalledWith("folder-1");
    });
  });

  it("folds the Local Folders group to hide folder children", () => {
    renderFolderList();

    // The group renders expanded with folder children visible.
    expect(screen.getByText("My Folder")).toBeTruthy();
    const collapseButton = screen.getByRole("button", { name: "repo.actions.collapse" });
    expect(collapseButton).toBeTruthy();

    fireEvent.click(collapseButton);

    // Folding the group hides the folder child rows.
    expect(screen.queryByText("My Folder")).toBeNull();
  });

  it("does not select a project when the Local Folders group row is clicked", () => {
    renderFolderList();
    mocked.activateProject.mockClear();

    fireEvent.click(screen.getByText("project.list.localFolders"));

    // Clicking the group only folds/unfolds it; no project selection occurs.
    expect(mocked.activateProject).not.toHaveBeenCalled();
  });

  it("shows detected external apps directly in workspace context submenu when host detection succeeds", async () => {
    renderRepoList([], undefined, "workspace-1", ["cursor", "jetbrains-webstorm"]);

    await waitFor(() => {
      expect(mocked.listDetectedExternalAppIds).toHaveBeenCalled();
    });

    fireEvent.contextMenu(screen.getByTestId("workspace-row-workspace-1"));
    const openWorkspaceInMenuItem = screen.getByRole("menuitem", { name: "workspace.actions.openInExternalApp" });
    fireEvent.mouseEnter(openWorkspaceInMenuItem);

    expect(await screen.findByRole("menuitem", { name: "Cursor" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "WebStorm" })).toBeTruthy();
    await waitFor(() => {
      expect(screen.queryByRole("menuitem", { name: "JetBrains" })).toBeNull();
      expect(screen.queryByRole("menuitem", { name: "Zed" })).toBeNull();
    });
  });

  it("hides the workspace external-app submenu while app detection is still loading", async () => {
    const deferredDetectedAppIds = createDeferred<string[]>();
    renderRepoList([], undefined, "workspace-1", deferredDetectedAppIds.promise);

    await waitFor(() => {
      expect(mocked.listDetectedExternalAppIds).toHaveBeenCalled();
    });

    fireEvent.contextMenu(screen.getByTestId("workspace-row-workspace-1"));
    expect(screen.queryByRole("menuitem", { name: "workspace.actions.openInExternalApp" })).toBeNull();
  });

  it("hides the workspace external-app submenu when detection succeeds with no matches", async () => {
    renderRepoList([], undefined, "workspace-1", []);

    await waitFor(() => {
      expect(mocked.listDetectedExternalAppIds).toHaveBeenCalled();
    });

    fireEvent.contextMenu(screen.getByTestId("workspace-row-workspace-1"));
    await waitFor(() => {
      expect(screen.queryByRole("menuitem", { name: "workspace.actions.openInExternalApp" })).toBeNull();
    });
  });

  it("falls back to the full workspace context submenu when detection fails", async () => {
    renderRepoList([], undefined, "workspace-1", new Error("boom"));

    await waitFor(() => {
      expect(mocked.listDetectedExternalAppIds).toHaveBeenCalled();
    });

    fireEvent.contextMenu(screen.getByTestId("workspace-row-workspace-1"));
    const openWorkspaceInMenuItem = screen.getByRole("menuitem", { name: "workspace.actions.openInExternalApp" });
    fireEvent.mouseEnter(openWorkspaceInMenuItem);

    expect(await screen.findByRole("menuitem", { name: "Cursor" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "JetBrains" })).toBeTruthy();
  });

  it("opens workspace root in one external app from hover-expanded workspace context submenu", async () => {
    renderRepoList([], undefined, "workspace-1", ["cursor"]);

    await waitFor(() => {
      expect(mocked.listDetectedExternalAppIds).toHaveBeenCalled();
    });

    fireEvent.contextMenu(screen.getByTestId("workspace-row-workspace-1"));
    const openWorkspaceInMenuItem = screen.getByRole("menuitem", { name: "workspace.actions.openInExternalApp" });
    fireEvent.mouseEnter(openWorkspaceInMenuItem);
    expect(openWorkspaceInMenuItem.className).toContain("Mui-selected");
    fireEvent.click(screen.getByRole("menuitem", { name: "Cursor" }));

    expect(mocked.openEntryInExternalApp).toHaveBeenCalledWith({
      workspaceWorktreePath: "/tmp/worktrees/workspace-1",
      appId: "cursor",
    });
  });

  it("opens workspace root in file manager from workspace context menu", () => {
    renderRepoList();

    fireEvent.contextMenu(screen.getByTestId("workspace-row-workspace-1"));
    fireEvent.click(screen.getByRole("menuitem", { name: "workspace.actions.openInFinder" }));

    expect(mocked.openEntryInExternalApp).toHaveBeenCalledWith({
      workspaceWorktreePath: "/tmp/worktrees/workspace-1",
      appId: "system-file-manager",
    });
  });

  it("does not show one quick external-app action when no app was used previously", async () => {
    renderRepoList([], undefined, "workspace-1", ["cursor"]);

    await waitFor(() => {
      expect(mocked.listDetectedExternalAppIds).toHaveBeenCalled();
    });

    fireEvent.contextMenu(screen.getByTestId("workspace-row-workspace-1"));

    expect(screen.queryByRole("menuitem", { name: /^workspace\.actions\.openInExternalAppQuick:/ })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "workspace.actions.openInExternalApp" })).toBeTruthy();
  });

  it("shows one first-level quick open action for the last used external app", async () => {
    renderRepoList([], "cursor", "workspace-1", ["cursor"]);

    await waitFor(() => {
      expect(mocked.listDetectedExternalAppIds).toHaveBeenCalled();
    });

    fireEvent.contextMenu(screen.getByTestId("workspace-row-workspace-1"));
    const quickOpenMenuItem = screen.getByRole("menuitem", { name: "workspace.actions.openInExternalAppQuick:Cursor" });
    const quickOpenMenuItemIcon = quickOpenMenuItem.querySelector("img");
    expect(quickOpenMenuItemIcon?.getAttribute("src")).toBe("app-icons/cursor.svg");
    fireEvent.click(quickOpenMenuItem);

    await waitFor(() => {
      expect(mocked.openEntryInExternalApp).toHaveBeenCalledWith({
        workspaceWorktreePath: "/tmp/worktrees/workspace-1",
        appId: "cursor",
      });
      expect(mocked.setLastUsedExternalAppId).toHaveBeenCalledWith("cursor");
    });
  });

  it("opens workspace root in one JetBrains IDE from third-level submenu", async () => {
    renderRepoList([], undefined, "workspace-1", ["jetbrains-webstorm"]);

    await waitFor(() => {
      expect(mocked.listDetectedExternalAppIds).toHaveBeenCalled();
    });

    fireEvent.contextMenu(screen.getByTestId("workspace-row-workspace-1"));
    const openWorkspaceInMenuItem = screen.getByRole("menuitem", { name: "workspace.actions.openInExternalApp" });
    fireEvent.mouseEnter(openWorkspaceInMenuItem);
    fireEvent.click(screen.getByRole("menuitem", { name: "WebStorm" }));

    expect(mocked.openEntryInExternalApp).toHaveBeenCalledWith({
      workspaceWorktreePath: "/tmp/worktrees/workspace-1",
      appId: "jetbrains-webstorm",
    });
  });

  it("resets workspace submenu state when reopening workspace context menu", async () => {
    renderRepoList([], undefined, "workspace-1", ["cursor"]);

    await waitFor(() => {
      expect(mocked.listDetectedExternalAppIds).toHaveBeenCalled();
    });

    fireEvent.contextMenu(screen.getByTestId("workspace-row-workspace-1"));
    const openWorkspaceInMenuItem = screen.getByRole("menuitem", { name: "workspace.actions.openInExternalApp" });
    fireEvent.mouseEnter(openWorkspaceInMenuItem);
    expect(await screen.findByRole("menuitem", { name: "Cursor" })).toBeTruthy();

    fireEvent.contextMenu(screen.getByTestId("workspace-row-workspace-1"));

    expect(screen.getByRole("menuitem", { name: "workspace.actions.delete" })).toBeTruthy();
    await waitFor(() => {
      expect(screen.queryByRole("menuitem", { name: "Cursor" })).toBeNull();
    });
  });

  it("hides workspace external-app action on unsupported platform", () => {
    mocked.rendererPlatform = "win32";
    renderRepoList();

    fireEvent.contextMenu(screen.getByTestId("workspace-row-workspace-1"));
    expect(screen.getByRole("menuitem", { name: "workspace.actions.openInExplorer" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "workspace.actions.openInExternalApp" })).toBeNull();
  });

  it("suppresses native context menu while workspace context menu is open", () => {
    renderRepoList();

    fireEvent.contextMenu(screen.getByTestId("workspace-row-workspace-1"));
    expect(screen.getByRole("menuitem", { name: "workspace.actions.delete" })).toBeTruthy();

    const whileMenuOpenContextMenuEvent = createEvent.contextMenu(document.body, { cancelable: true });
    document.body.dispatchEvent(whileMenuOpenContextMenuEvent);
    expect(whileMenuOpenContextMenuEvent.defaultPrevented).toBe(true);

    cleanup();

    const afterUnmountContextMenuEvent = createEvent.contextMenu(document.body, { cancelable: true });
    document.body.dispatchEvent(afterUnmountContextMenuEvent);
    expect(afterUnmountContextMenuEvent.defaultPrevented).toBe(false);
  });

  it("opens create workspace dialog from repo action", () => {
    renderRepoList();

    fireEvent.click(screen.getByRole("button", { name: "workspace.actions.add" }));

    expect(screen.getByTestId("create-workspace-dialog")).toBeTruthy();
  });

  it("asks for confirmation before deleting workspace", () => {
    renderRepoList();

    const workspaceActions = screen.getByTestId("workspace-actions-workspace-1");
    const deleteButton = within(workspaceActions).getByLabelText("workspace.actions.delete");
    fireEvent.click(deleteButton);

    expect(screen.getByText("workspace.delete.confirm")).toBeTruthy();
    expect((screen.getByRole("checkbox", { name: "workspace.delete.removeBranch" }) as HTMLInputElement).checked).toBe(
      true,
    );
    fireEvent.click(screen.getByRole("button", { name: "workspace.actions.delete" }));
    expect(mocked.closeWorkspace).toHaveBeenCalledWith("workspace-1", { removeBranch: true });
  });

  it("allows disabling branch removal in workspace delete confirmation", () => {
    renderRepoList();

    const workspaceActions = screen.getByTestId("workspace-actions-workspace-1");
    const deleteButton = within(workspaceActions).getByLabelText("workspace.actions.delete");
    fireEvent.click(deleteButton);

    const removeBranchCheckbox = screen.getByRole("checkbox", { name: "workspace.delete.removeBranch" });
    fireEvent.click(removeBranchCheckbox);
    expect((removeBranchCheckbox as HTMLInputElement).checked).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "workspace.actions.delete" }));
    expect(mocked.closeWorkspace).toHaveBeenCalledWith("workspace-1", { removeBranch: false });
  });

  it("renders running spinner when workspace status is running", () => {
    renderRepoList();
    mocked.stateRef.current.workspaceAgentStatusByWorkspaceId = { "workspace-1": "running" };
    cleanup();
    renderWorkspaceNavigatorView();
    expect(screen.getByTestId("workspace-status-running-spinner-workspace-1")).toBeTruthy();
  });

  it("renders waiting-input dot when workspace status is waiting_input", () => {
    renderRepoList();
    mocked.stateRef.current.workspaceAgentStatusByWorkspaceId = { "workspace-1": "waiting_input" };
    cleanup();
    renderWorkspaceNavigatorView();
    expect(screen.getByTestId("workspace-status-waiting-input-badge-workspace-1")).toBeTruthy();
  });

  it.each(["error", "success"] as const)(
    "keeps the waiting-input badge when the workspace also has an unread %s notification",
    (unreadTone) => {
      renderRepoList();
      mocked.stateRef.current.workspaceAgentStatusByWorkspaceId = { "workspace-1": "waiting_input" };
      mocked.stateRef.current.workspaceUnreadToneByWorkspaceId = { "workspace-1": unreadTone };
      cleanup();
      renderWorkspaceNavigatorView();

      expect(screen.getByTestId("workspace-status-waiting-input-badge-workspace-1")).toBeTruthy();
      expect(screen.queryByTestId("workspace-status-done-badge-workspace-1")).toBeNull();
      expect(screen.queryByTestId("workspace-status-failed-badge-workspace-1")).toBeNull();
    },
  );

  it("renders no indicator when workspace has no active runtime status and no unread notifications", () => {
    renderRepoList();
    cleanup();
    renderWorkspaceNavigatorView();
    expect(screen.queryByTestId("workspace-status-running-spinner-workspace-1")).toBeNull();
    expect(screen.queryByTestId("workspace-status-waiting-input-badge-workspace-1")).toBeNull();
    expect(screen.queryByTestId("workspace-status-done-badge-workspace-1")).toBeNull();
    expect(screen.queryByTestId("workspace-status-failed-badge-workspace-1")).toBeNull();
  });

  it("renders a create spinner for provisioning workspaces from the snapshot", () => {
    renderRepoList();
    const existingWorkspace = mocked.stateRef.current.workspaces[0];
    if (!existingWorkspace) {
      throw new Error("Expected seeded workspace");
    }

    mocked.stateRef.current.workspaces = [
      {
        ...existingWorkspace,
        status: "provisioning",
        worktreePath: "",
      },
    ];
    cleanup();
    renderWorkspaceNavigatorView();
    expect(screen.getByTestId("workspace-creating-spinner-workspace-1")).toBeTruthy();
  });

  it("keeps the create spinner ahead of runtime and unread notifications", () => {
    renderRepoList();
    const existingWorkspace = mocked.stateRef.current.workspaces[0];
    if (!existingWorkspace) {
      throw new Error("Expected seeded workspace");
    }

    mocked.stateRef.current.workspaces = [{ ...existingWorkspace, status: "provisioning", worktreePath: "" }];
    mocked.stateRef.current.workspaceAgentStatusByWorkspaceId = { "workspace-1": "running" };
    mocked.stateRef.current.workspaceUnreadToneByWorkspaceId = { "workspace-1": "error" };
    cleanup();
    renderWorkspaceNavigatorView();

    expect(screen.getByTestId("workspace-creating-spinner-workspace-1")).toBeTruthy();
    expect(screen.queryByTestId("workspace-status-running-spinner-workspace-1")).toBeNull();
    expect(screen.queryByTestId("workspace-status-failed-badge-workspace-1")).toBeNull();
  });

  it("keeps the running spinner ahead of unread notification badges", () => {
    renderRepoList([], undefined, "workspace-2");
    mocked.stateRef.current.workspaceAgentStatusByWorkspaceId = { "workspace-1": "running" };
    mocked.stateRef.current.workspaceUnreadToneByWorkspaceId = { "workspace-1": "success" };
    cleanup();
    renderWorkspaceNavigatorView();

    expect(screen.getByTestId("workspace-status-running-spinner-workspace-1")).toBeTruthy();
    expect(screen.queryByTestId("workspace-status-done-badge-workspace-1")).toBeNull();
    expect(screen.queryByTestId("workspace-status-failed-badge-workspace-1")).toBeNull();
  });

  it("does not render a create spinner for active workspaces with stale progress entries", () => {
    renderRepoList();
    mocked.stateRef.current.progressByWorkspaceId = {
      "workspace-1": { isComplete: false },
    };
    cleanup();
    renderWorkspaceNavigatorView();
    expect(screen.queryByTestId("workspace-creating-spinner-workspace-1")).toBeNull();
  });

  it("renders done indicator for background workspace notifications", () => {
    renderRepoList([], undefined, "workspace-2");
    mocked.stateRef.current.workspaceUnreadToneByWorkspaceId = { "workspace-1": "success" };
    cleanup();
    renderWorkspaceNavigatorView();

    const doneBadge = screen.getByTestId("workspace-status-done-badge-workspace-1");
    expect(doneBadge).toBeTruthy();
  });

  it("renders failed indicator for background workspace notifications", () => {
    renderRepoList([], undefined, "workspace-2");
    mocked.stateRef.current.workspaceUnreadToneByWorkspaceId = { "workspace-1": "error" };
    cleanup();
    renderWorkspaceNavigatorView();

    const failedBadge = screen.getByTestId("workspace-status-failed-badge-workspace-1");
    expect(failedBadge).toBeTruthy();
  });

  it("clears unread indicator after opening that workspace while app is focused", () => {
    const { rerender } = renderRepoList([], undefined, "workspace-2");
    mocked.stateRef.current.workspaceUnreadToneByWorkspaceId = { "workspace-1": "success" };
    rerender(<WorkspaceNavigatorView />);
    expect(screen.getByTestId("workspace-status-done-badge-workspace-1")).toBeTruthy();

    mocked.stateRef.current.selectedWorkspaceId = "workspace-1";
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    rerender(<WorkspaceNavigatorView />);

    expect(screen.queryByTestId("workspace-status-done-badge-workspace-1")).toBeNull();
  });

  it("shows workspace info popover on hover and hides it on mouse leave", async () => {
    vi.useFakeTimers();
    renderRepoList();

    fireEvent.mouseEnter(screen.getByTestId("workspace-row-workspace-1"));

    // Wait for the async daemon branch fetch to resolve.
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const infoPopper = screen.getByTestId("workspace-info-popper");

    expect(infoPopper.textContent).toContain("workspace.info.branch: feature/live-branch");
    expect(infoPopper.textContent).toContain("workspace.info.sourceBranch: main");

    fireEvent.mouseLeave(screen.getByTestId("workspace-row-workspace-1"));
    act(() => {
      vi.advanceTimersByTime(121);
    });

    expect(screen.queryByTestId("workspace-info-popper")).toBeNull();
    vi.useRealTimers();
  });

  it("shows pull request info in workspace popover when one exists", async () => {
    vi.useFakeTimers();
    const view = renderRepoList();
    mocked.stateRef.current.pullRequestByWorkspaceId = {
      "workspace-1": {
        number: 42,
        title: "Add PR tracking",
        status: "review",
      },
    };
    view.rerender(<WorkspaceNavigatorView />);

    fireEvent.mouseEnter(screen.getByTestId("workspace-row-workspace-1"));
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const infoPopper = screen.getByTestId("workspace-info-popper");
    expect(infoPopper.textContent).toContain("workspace.pr.tab");
    expect(infoPopper.textContent).toContain("#42 Add PR tracking");
    vi.useRealTimers();
  });

  it("keeps workspace info popover open when cursor moves into it", async () => {
    vi.useFakeTimers();
    renderRepoList();

    const workspaceRow = screen.getByTestId("workspace-row-workspace-1");
    fireEvent.mouseEnter(workspaceRow);

    // Wait for the async daemon branch fetch to resolve.
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    fireEvent.mouseLeave(workspaceRow);

    const infoPopper = screen.getByTestId("workspace-info-popper");
    act(() => {
      vi.advanceTimersByTime(60);
    });
    fireEvent.mouseEnter(infoPopper);

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(infoPopper.textContent).toContain("workspace.info.branch: feature/live-branch");
    expect(infoPopper.textContent).toContain("workspace.info.sourceBranch: main");

    fireEvent.mouseLeave(infoPopper);
    act(() => {
      vi.advanceTimersByTime(121);
    });
    expect(screen.queryByTestId("workspace-info-popper")).toBeNull();
    vi.useRealTimers();
  });

  it("revalidates a stale cached branch when hovering a primary workspace", async () => {
    vi.useFakeTimers();
    vi.mocked(inspectGitRepository).mockResolvedValueOnce({ isGitRepository: true, currentBranch: "feature/new" });
    mocked.stateRef.current = {
      ...mocked.stateRef.current,
      projects: [
        {
          id: "repo-1",
          name: "Repo 1",
          path: "/tmp/worktrees/workspace-1",
          missing: false,
          worktreePath: "/tmp/worktrees/workspace-1",
          icon: "folder",
          color: "#111111",
        },
      ],
      workspaces: [
        {
          id: "workspace-1",
          repoId: "repo-1",
          name: "Workspace 1",
          title: "Workspace 1",
          sourceBranch: "main",
          branch: "main",
          summaryId: "summary-1",
          worktreePath: "/tmp/worktrees/workspace-1",
        },
      ],
      selectedProjectId: "repo-1",
      selectedWorkspaceId: "workspace-1",
      displayProjectIds: ["repo-1"],
      pullRequestByWorkspaceId: {},
      latestPullRequestByWorkspaceId: {},
      currentBranchByWorkspaceId: { "workspace-1": "feature/old" },
      setWorkspaceCurrentBranch: mocked.setWorkspaceCurrentBranch,
      gitChangeTotalsByWorkspaceId: {},
    };

    const view = renderWorkspaceNavigatorView();

    fireEvent.mouseEnter(screen.getByTestId("workspace-row-workspace-1"));

    const initialInfoPopper = screen.getByTestId("workspace-info-popper");
    expect(initialInfoPopper.textContent).toContain("workspace.info.branch: feature/old");

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <WorkspaceNavigatorView />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const infoPopper = screen.getByTestId("workspace-info-popper");
    expect(vi.mocked(inspectGitRepository)).toHaveBeenCalledWith({ workspaceId: "workspace-1" });
    expect(infoPopper.textContent).toContain("workspace.info.branch: feature/new");
    expect(infoPopper.textContent).not.toContain("workspace.info.sourceBranch:");
    vi.useRealTimers();
  });

  it("does not show source branch for primary workspace", async () => {
    vi.useFakeTimers();
    vi.mocked(inspectGitRepository).mockResolvedValueOnce({
      isGitRepository: true,
      currentBranch: "feature/live-branch",
    });
    mocked.stateRef.current = {
      ...mocked.stateRef.current,
      projects: [
        {
          id: "repo-1",
          name: "Repo 1",
          path: "/tmp/worktrees/workspace-1",
          missing: false,
          worktreePath: "/tmp/worktrees/workspace-1",
          icon: "folder",
          color: "#111111",
        },
      ],
      workspaces: [
        {
          id: "workspace-1",
          repoId: "repo-1",
          name: "Workspace 1",
          title: "Workspace 1",
          sourceBranch: "main",
          branch: "main",
          summaryId: "summary-1",
          worktreePath: "/tmp/worktrees/workspace-1",
        },
      ],
      selectedProjectId: "repo-1",
      selectedWorkspaceId: "workspace-1",
      displayProjectIds: ["repo-1"],
      pullRequestByWorkspaceId: {},
      currentBranchByWorkspaceId: { "workspace-1": "feature/live-branch" },
      gitChangeTotalsByWorkspaceId: {},
      setWorkspaceCurrentBranch: mocked.setWorkspaceCurrentBranch,
    };

    renderWorkspaceNavigatorView();

    fireEvent.mouseEnter(screen.getByTestId("workspace-row-workspace-1"));
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const infoPopper = screen.getByTestId("workspace-info-popper");
    expect(infoPopper.textContent).toContain("workspace.info.branch: feature/live-branch");
    expect(infoPopper.textContent).not.toContain("workspace.info.sourceBranch:");
    vi.useRealTimers();
  });

  it("does not show source branch for primary workspace even on main branch", async () => {
    vi.useFakeTimers();
    vi.mocked(inspectGitRepository).mockResolvedValueOnce({ isGitRepository: true, currentBranch: "main" });
    mocked.stateRef.current = {
      ...mocked.stateRef.current,
      projects: [
        {
          id: "repo-1",
          name: "Repo 1",
          path: "/tmp/worktrees/workspace-1",
          missing: false,
          worktreePath: "/tmp/worktrees/workspace-1",
          icon: "folder",
          color: "#111111",
        },
      ],
      workspaces: [
        {
          id: "workspace-1",
          repoId: "repo-1",
          name: "Workspace 1",
          title: "Workspace 1",
          sourceBranch: "",
          branch: "main",
          summaryId: "summary-1",
          worktreePath: "/tmp/worktrees/workspace-1",
        },
      ],
      selectedProjectId: "repo-1",
      selectedWorkspaceId: "workspace-1",
      displayProjectIds: ["repo-1"],
      pullRequestByWorkspaceId: {},
      currentBranchByWorkspaceId: {},
    };
    renderWorkspaceNavigatorView();

    fireEvent.mouseEnter(screen.getByTestId("workspace-row-workspace-1"));
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const infoPopper = screen.getByTestId("workspace-info-popper");
    expect(infoPopper.textContent).toContain("workspace.info.branch: main");
    expect(infoPopper.textContent).not.toContain("workspace.info.sourceBranch:");
    vi.useRealTimers();
  });
});
