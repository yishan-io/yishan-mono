// @vitest-environment jsdom

import { act, cleanup, createEvent, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OPEN_CREATE_WORKSPACE_DIALOG_EVENT } from "../../../commands/workspaceCommands";
import { ProjectListView } from "./ProjectListView";

const mocked = vi.hoisted(() => {
  const renameWorkspace = vi.fn();
  const renameWorkspaceBranch = vi.fn();
  const deleteWorkspace = vi.fn();
  const deleteProject = vi.fn();
  const setSelectedRepoId = vi.fn();
  const setSelectedWorkspaceId = vi.fn();
  const setLastUsedExternalAppId = vi.fn();
  const openEntryInExternalApp = vi.fn();
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
        iconBgColor: string;
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
        kind?: "managed" | "local";
      }>;
      selectedProjectId: string;
      selectedWorkspaceId: string;
      displayProjectIds: string[];
      lastUsedExternalAppId?: string;
      gitChangeTotalsByWorkspaceId: Record<string, { additions: number; deletions: number }>;
      setSelectedRepoId: (repoId: string) => void;
      setSelectedWorkspaceId: (workspaceId: string) => void;
      setLastUsedExternalAppId: (appId: string) => void;
      renameWorkspace: (input: { repoId: string; workspaceId: string; name: string }) => Promise<void>;
      renameWorkspaceBranch: (input: { repoId: string; workspaceId: string; branch: string }) => Promise<void>;
      deleteWorkspace: (input: { repoId: string; workspaceId: string }) => Promise<void>;
      deleteProject: (input: { repoId: string }) => Promise<void>;
      workspaceAgentStatusByWorkspaceId: Record<string, "running" | "waiting_input">;
      workspaceUnreadToneByWorkspaceId: Record<string, "success" | "error">;
      markWorkspaceNotificationsRead: (workspaceId: string) => void;
    };
  } = {
    current: {
      projects: [],
      workspaces: [],
      selectedProjectId: "",
      selectedWorkspaceId: "",
      displayProjectIds: [],
      lastUsedExternalAppId: undefined,
      gitChangeTotalsByWorkspaceId: {},
      setSelectedRepoId,
      setSelectedWorkspaceId,
      setLastUsedExternalAppId,
      renameWorkspace: async () => undefined,
      renameWorkspaceBranch: async () => undefined,
      deleteWorkspace: async () => undefined,
      deleteProject: async () => undefined,
      workspaceAgentStatusByWorkspaceId: {},
      workspaceUnreadToneByWorkspaceId: {},
      markWorkspaceNotificationsRead: () => {},
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

  const workspaceStore = vi.fn((selector: (state: typeof stateRef.current) => unknown) => selector(stateRef.current));

  return {
    renameWorkspace,
    renameWorkspaceBranch,
    deleteWorkspace,
    deleteProject,
    setSelectedRepoId,
    setSelectedWorkspaceId,
    setLastUsedExternalAppId,
    openEntryInExternalApp,
    markWorkspaceNotificationsRead,
    get rendererPlatform() {
      return rendererPlatform;
    },
    set rendererPlatform(value: string) {
      rendererPlatform = value;
    },
    stateRef,
    workspaceStore,
  };
});

vi.mock("react-i18next", () => ({
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

vi.mock("../../../components/projectIcons", () => ({
  renderProjectIcon: () => "R",
  renderRepoIcon: () => "R",
}));

vi.mock("./CreateWorkspaceDialogView", () => ({
  CreateWorkspaceDialogView: ({ open, mode }: { open: boolean; mode?: "create" | "rename" }) =>
    open ? <div data-testid={mode === "rename" ? "rename-workspace-dialog" : "create-workspace-dialog"} /> : null,
}));

vi.mock("./ProjectConfigDialogView", () => ({
  ProjectConfigDialogView: ({ open }: { open: boolean }) => (open ? <div data-testid="repo-config-dialog" /> : null),
}));

vi.mock("../../../store/workspaceStore", () => ({
  workspaceStore: mocked.workspaceStore,
}));

vi.mock("../../../store/chatStore", () => ({
  chatStore: mocked.workspaceStore,
}));

vi.mock("../../../hooks/useCommands", () => ({
  useCommands: () => ({
    setSelectedRepoId: mocked.setSelectedRepoId,
    setSelectedWorkspaceId: mocked.setSelectedWorkspaceId,
    renameWorkspace: mocked.renameWorkspace,
    renameWorkspaceBranch: mocked.renameWorkspaceBranch,
    closeWorkspace: mocked.deleteWorkspace,
    deleteProject: mocked.deleteProject,
    openEntryInExternalApp: mocked.openEntryInExternalApp,
    setLastUsedExternalAppId: mocked.setLastUsedExternalAppId,
  }),
}));

vi.mock("../../../commands/fileCommands", () => ({
  openEntryInExternalApp: (...args: unknown[]) => mocked.openEntryInExternalApp(...args),
}));

vi.mock("../../../helpers/platform", () => ({
  getRendererPlatform: () => mocked.rendererPlatform,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocked.rendererPlatform = "darwin";
});

function renderRepoList(
  foldedRepoIds: string[] = [],
  lastUsedExternalAppId?: string,
  selectedWorkspaceId = "workspace-1",
) {
  mocked.renameWorkspace.mockResolvedValue(undefined);
  mocked.renameWorkspaceBranch.mockResolvedValue(undefined);
  mocked.deleteWorkspace.mockResolvedValue(undefined);
  mocked.deleteProject.mockResolvedValue(undefined);
  mocked.openEntryInExternalApp.mockResolvedValue({ ok: true });
  mocked.stateRef.current = {
    projects: [
      {
        id: "repo-1",
        name: "Repo 1",
        path: "/tmp/repo-1",
        missing: false,
        worktreePath: "/tmp/worktrees",
        icon: "folder",
        iconBgColor: "#111111",
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
    gitChangeTotalsByWorkspaceId: {
      "workspace-1": { additions: 12, deletions: 4 },
    },
    setSelectedRepoId: mocked.setSelectedRepoId,
    setSelectedWorkspaceId: mocked.setSelectedWorkspaceId,
    setLastUsedExternalAppId: mocked.setLastUsedExternalAppId,
    renameWorkspace: mocked.renameWorkspace,
    renameWorkspaceBranch: mocked.renameWorkspaceBranch,
    deleteWorkspace: mocked.deleteWorkspace,
    deleteProject: mocked.deleteProject,
    workspaceAgentStatusByWorkspaceId: {},
    workspaceUnreadToneByWorkspaceId: {},
    markWorkspaceNotificationsRead: mocked.markWorkspaceNotificationsRead,
  };

  const rendered = render(<ProjectListView />);

  if (foldedRepoIds.includes("repo-1")) {
    fireEvent.click(screen.getByRole("button", { name: "repo.actions.collapse" }));
  }

  return {
    onRenameWorkspace: mocked.renameWorkspace,
    onRenameWorkspaceBranch: mocked.renameWorkspaceBranch,
    rerender: rendered.rerender,
  };
}

describe("ProjectListView", () => {
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
          iconBgColor: "#111111",
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
      lastUsedExternalAppId: undefined,
      gitChangeTotalsByWorkspaceId: {},
    };

    render(<ProjectListView />);

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
          iconBgColor: "#111111",
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
      selectedProjectId: "repo-1",
      selectedWorkspaceId: "workspace-local-1",
      displayProjectIds: ["repo-1"],
      lastUsedExternalAppId: undefined,
      gitChangeTotalsByWorkspaceId: {
        "workspace-local-1": { additions: 2, deletions: 1 },
      },
      setSelectedRepoId: mocked.setSelectedRepoId,
      setSelectedWorkspaceId: mocked.setSelectedWorkspaceId,
      setLastUsedExternalAppId: mocked.setLastUsedExternalAppId,
      renameWorkspace: mocked.renameWorkspace,
      renameWorkspaceBranch: mocked.renameWorkspaceBranch,
      deleteWorkspace: mocked.deleteWorkspace,
      deleteProject: mocked.deleteProject,
      workspaceAgentStatusByWorkspaceId: {},
      workspaceUnreadToneByWorkspaceId: {},
      markWorkspaceNotificationsRead: mocked.markWorkspaceNotificationsRead,
    };
    render(<ProjectListView />);

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

    mocked.setSelectedRepoId.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "repo.actions.collapse" }));

    expect(screen.queryByText("Workspace 1")).toBeNull();
    expect(mocked.setSelectedRepoId).not.toHaveBeenCalled();
    expect(onRenameWorkspace).not.toHaveBeenCalled();
  });

  it("opens context menu on right click and deletes repository from menu action", () => {
    renderRepoList();

    fireEvent.contextMenu(screen.getByText("Repo 1"));
    fireEvent.click(screen.getByRole("menuitem", { name: "project.actions.delete" }));
    fireEvent.click(screen.getByRole("button", { name: "project.actions.delete" }));

    expect(mocked.deleteProject).toHaveBeenCalledWith("repo-1");
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
    expect(mocked.deleteWorkspace).toHaveBeenCalledWith("workspace-1", { removeBranch: true });
  });

  it("opens rename dialog from workspace context menu", () => {
    renderRepoList();
    fireEvent.contextMenu(screen.getByTestId("workspace-row-workspace-1"));
    fireEvent.click(screen.getByRole("menuitem", { name: "workspace.actions.rename" }));

    expect(screen.getByTestId("rename-workspace-dialog")).toBeTruthy();
  });

  it("opens workspace root in one external app from hover-expanded workspace context submenu", () => {
    renderRepoList();

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

  it("does not show one quick external-app action when no app was used previously", () => {
    renderRepoList();

    fireEvent.contextMenu(screen.getByTestId("workspace-row-workspace-1"));

    expect(screen.queryByRole("menuitem", { name: /^workspace\.actions\.openInExternalAppQuick:/ })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "workspace.actions.openInExternalApp" })).toBeTruthy();
  });

  it("shows one first-level quick open action for the last used external app", () => {
    renderRepoList([], "cursor");

    fireEvent.contextMenu(screen.getByTestId("workspace-row-workspace-1"));
    const quickOpenMenuItem = screen.getByRole("menuitem", { name: "workspace.actions.openInExternalAppQuick:Cursor" });
    const quickOpenMenuItemIcon = quickOpenMenuItem.querySelector("img");
    expect(quickOpenMenuItemIcon?.getAttribute("src")).toBe("app-icons/cursor.svg");
    fireEvent.click(quickOpenMenuItem);

    return waitFor(() => {
      expect(mocked.openEntryInExternalApp).toHaveBeenCalledWith({
        workspaceWorktreePath: "/tmp/worktrees/workspace-1",
        appId: "cursor",
      });
      expect(mocked.setLastUsedExternalAppId).toHaveBeenCalledWith("cursor");
    });
  });

  it("opens workspace root in one JetBrains IDE from third-level submenu", () => {
    renderRepoList();

    fireEvent.contextMenu(screen.getByTestId("workspace-row-workspace-1"));
    const openWorkspaceInMenuItem = screen.getByRole("menuitem", { name: "workspace.actions.openInExternalApp" });
    fireEvent.mouseEnter(openWorkspaceInMenuItem);
    const jetBrainsMenuItem = screen.getByRole("menuitem", { name: "JetBrains" });
    fireEvent.mouseEnter(jetBrainsMenuItem);
    expect(jetBrainsMenuItem.className).toContain("Mui-selected");
    fireEvent.click(screen.getByRole("menuitem", { name: "WebStorm" }));

    expect(mocked.openEntryInExternalApp).toHaveBeenCalledWith({
      workspaceWorktreePath: "/tmp/worktrees/workspace-1",
      appId: "jetbrains-webstorm",
    });
  });

  it("resets workspace submenu state when reopening workspace context menu", async () => {
    renderRepoList();

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
    expect(mocked.deleteWorkspace).toHaveBeenCalledWith("workspace-1", { removeBranch: true });
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
    expect(mocked.deleteWorkspace).toHaveBeenCalledWith("workspace-1", { removeBranch: false });
  });

  it("renders running spinner when workspace status is running", () => {
    renderRepoList();
    mocked.stateRef.current.workspaceAgentStatusByWorkspaceId = { "workspace-1": "running" };
    cleanup();
    render(<ProjectListView />);
    expect(screen.getByTestId("workspace-status-running-spinner-workspace-1")).toBeTruthy();
  });

  it("renders waiting-input dot when workspace status is waiting_input", () => {
    renderRepoList();
    mocked.stateRef.current.workspaceAgentStatusByWorkspaceId = { "workspace-1": "waiting_input" };
    cleanup();
    render(<ProjectListView />);
    expect(screen.getByTestId("workspace-status-waiting-input-badge-workspace-1")).toBeTruthy();
  });

  it("renders no indicator when workspace has no active runtime status and no unread notifications", () => {
    renderRepoList();
    cleanup();
    render(<ProjectListView />);
    expect(screen.queryByTestId("workspace-status-running-spinner-workspace-1")).toBeNull();
    expect(screen.queryByTestId("workspace-status-waiting-input-badge-workspace-1")).toBeNull();
    expect(screen.queryByTestId("workspace-status-done-badge-workspace-1")).toBeNull();
    expect(screen.queryByTestId("workspace-status-failed-badge-workspace-1")).toBeNull();
  });

  it("renders done indicator for background workspace notifications", () => {
    renderRepoList([], undefined, "workspace-2");
    mocked.stateRef.current.workspaceUnreadToneByWorkspaceId = { "workspace-1": "success" };
    cleanup();
    render(<ProjectListView />);

    const doneBadge = screen.getByTestId("workspace-status-done-badge-workspace-1");
    expect(doneBadge).toBeTruthy();
    expect(within(doneBadge).getByTestId("workspace-icon-workspace-1")).toBeTruthy();
  });

  it("renders failed indicator for background workspace notifications", () => {
    renderRepoList([], undefined, "workspace-2");
    mocked.stateRef.current.workspaceUnreadToneByWorkspaceId = { "workspace-1": "error" };
    cleanup();
    render(<ProjectListView />);

    const failedBadge = screen.getByTestId("workspace-status-failed-badge-workspace-1");
    expect(failedBadge).toBeTruthy();
    expect(within(failedBadge).getByTestId("workspace-icon-workspace-1")).toBeTruthy();
  });

  it("clears unread indicator after opening that workspace while app is focused", () => {
    const rendered = renderRepoList([], undefined, "workspace-2");
    mocked.stateRef.current.workspaceUnreadToneByWorkspaceId = { "workspace-1": "success" };
    rendered.rerender(<ProjectListView />);
    expect(screen.getByTestId("workspace-status-done-badge-workspace-1")).toBeTruthy();

    mocked.stateRef.current.selectedWorkspaceId = "workspace-1";
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    rendered.rerender(<ProjectListView />);

    expect(screen.queryByTestId("workspace-status-done-badge-workspace-1")).toBeNull();
  });

  it("shows workspace info popover on hover and hides it on mouse leave", () => {
    vi.useFakeTimers();
    renderRepoList();

    fireEvent.mouseEnter(screen.getByTestId("workspace-row-workspace-1"));
    const infoPopper = screen.getByTestId("workspace-info-popper");

    expect(infoPopper.textContent).toContain("workspace.info.branch: feature/repo-fold");
    expect(infoPopper.textContent).toContain("workspace.info.sourceBranch: main");

    fireEvent.mouseLeave(screen.getByTestId("workspace-row-workspace-1"));
    act(() => {
      vi.advanceTimersByTime(121);
    });

    expect(screen.queryByTestId("workspace-info-popper")).toBeNull();
    vi.useRealTimers();
  });

  it("keeps workspace info popover open when cursor moves into it", () => {
    vi.useFakeTimers();
    renderRepoList();

    const workspaceRow = screen.getByTestId("workspace-row-workspace-1");
    fireEvent.mouseEnter(workspaceRow);
    fireEvent.mouseLeave(workspaceRow);

    const infoPopper = screen.getByTestId("workspace-info-popper");
    act(() => {
      vi.advanceTimersByTime(60);
    });
    fireEvent.mouseEnter(infoPopper);

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(infoPopper.textContent).toContain("workspace.info.sourceBranch: main");

    fireEvent.mouseLeave(infoPopper);
    act(() => {
      vi.advanceTimersByTime(121);
    });
    expect(screen.queryByTestId("workspace-info-popper")).toBeNull();
    vi.useRealTimers();
  });
});
