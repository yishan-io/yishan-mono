// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LOCAL_FOLDER_PROJECT_ID } from "../../store/types";
import type { WorkspaceItem, WorkspaceProjectRecord } from "../../store/types";
import { MainPaneTitleBarView } from "./MainPaneTitleBarView";
import { renderWorkspaceKindIcon } from "./mainPaneTitleBarHelpers";
import { RepoSelectorMenu } from "./mainPaneTitleBarMenus";

const t = (key: string) => key;

const remoteProject: WorkspaceProjectRecord = {
  id: "repo-1",
  name: "Repo 1",
  sourceType: "git",
  repoKey: "repo-1",
  icon: "folder",
  color: "#111111",
} as WorkspaceProjectRecord;

const folderWorkspace: WorkspaceItem = {
  id: "folder-1",
  projectId: LOCAL_FOLDER_PROJECT_ID,
  repoId: "folder-1",
  nodeId: "node-1",
  name: "My Folder",
  title: "My Folder",
  sourceBranch: "",
  branch: "",
  summaryId: "folder-1",
  worktreePath: "/tmp/my-folder",
  kind: "folder",
  status: "active",
};

const mocked = vi.hoisted(() => {
  const stateRef: {
    current: {
      projects: WorkspaceProjectRecord[];
      workspaces: WorkspaceItem[];
      selectedProjectId: string;
      selectedWorkspaceId: string;
      displayProjectIds: string[];
      workspaceListHierarchyMode: "by_project" | "by_node";
    };
  } = {
    current: {
      projects: [
        {
          id: "repo-1",
          name: "Repo 1",
          sourceType: "git",
          repoKey: "repo-1",
          icon: "folder",
          color: "#111111",
        } as WorkspaceProjectRecord,
      ],
      workspaces: [
        {
          id: "folder-1",
          projectId: "local-folder",
          repoId: "folder-1",
          nodeId: "node-1",
          name: "My Folder",
          title: "My Folder",
          sourceBranch: "",
          branch: "",
          summaryId: "folder-1",
          worktreePath: "/tmp/my-folder",
          kind: "folder",
          status: "active",
        } as WorkspaceItem,
      ],
      selectedProjectId: "local-folder",
      selectedWorkspaceId: "folder-1",
      displayProjectIds: ["repo-1"],
      workspaceListHierarchyMode: "by_project",
    },
  };
  return { stateRef };
});

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("./DaemonVersionWarningControl", () => ({
  DaemonVersionWarningControl: () => null,
}));

vi.mock("./WorkspacePortsMenuControl", () => ({
  WorkspacePortsMenuControl: () => null,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("../../features/session/model/sessionStore", () => ({
  sessionStore: (selector: (state: { daemonVersion?: string; appVersion?: string }) => unknown) =>
    selector({ daemonVersion: "1.0.0", appVersion: "1.0.0" }),
}));

vi.mock("../../store/workspaceStore", () => ({
  workspaceStore: (selector: (state: (typeof mocked.stateRef)["current"]) => unknown) =>
    selector(mocked.stateRef.current),
}));

vi.mock("../../features/project/model/projectStore", () => {
  const projectStore = (selector: (state: { projects: unknown[] }) => unknown) =>
    selector({ projects: mocked.stateRef.current.projects ?? [] });
  (projectStore as unknown as { getState: () => { projects: unknown[] } }).getState = () => ({
    projects: mocked.stateRef.current.projects ?? [],
  });
  return { projectStore };
});

vi.mock("../../store/chatStore", () => ({
  chatStore: (
    selector: (state: {
      workspaceAgentStatusByWorkspaceId: Record<string, unknown>;
      workspaceUnreadToneByWorkspaceId: Record<string, unknown>;
    }) => unknown,
  ) => selector({ workspaceAgentStatusByWorkspaceId: {}, workspaceUnreadToneByWorkspaceId: {} }),
}));

vi.mock("../../hooks/useCommands", () => {
  const commandSurface = () => ({

    setSelectedRepoId: (projectId: string) => {
      mocked.stateRef.current.selectedProjectId = projectId;
    },
    setSelectedWorkspaceId: (workspaceId: string) => {
      mocked.stateRef.current.selectedWorkspaceId = workspaceId;
    },
    openTab: vi.fn(),
    updateProjectConfig: vi.fn(),
  });
  return {
    useAppCommands: commandSurface,
    useSessionCommands: commandSurface,
    useWorkspaceCommands: commandSurface,
    useAgentCommands: commandSurface,
    useGitCommands: commandSurface,
    useNodeCommands: commandSurface,
    useNotificationCommands: commandSurface,
    useOrganizationCommands: commandSurface,
    useOverviewCommands: commandSurface,
    useScheduledJobCommands: commandSurface,
    useFileCommands: commandSurface,
    useProjectCommands: commandSurface,
    useWorkbenchCommands: commandSurface,
    useTerminalCommands: commandSurface,
    useSettingsCommands: commandSurface,
  };
});


vi.mock("../../app/commands/appCommands", () => ({
  getMainWindowFullscreenState: () => Promise.resolve({ isFullscreen: false }),
}));

vi.mock("../../helpers/platform", () => ({
  getRendererPlatform: () => "darwin",
}));

vi.mock("../../hooks/useWorkspacePaneVisibility", () => ({
  useWorkspacePaneVisibilityContext: () => ({ leftCollapsed: false, onToggleLeftPane: vi.fn() }),
}));

vi.mock("../../components/PaneToggleButton", () => ({
  PaneToggleButton: () => null,
}));

vi.mock("../../components/projectIcons", () => ({
  renderProjectIcon: (iconId: string | undefined, size: number) => {
    const { LuFolder } = require("react-icons/lu") as typeof import("react-icons/lu");
    return <LuFolder size={size} data-testid={iconId ? `project-icon-${iconId}` : "project-icon-default"} />;
  },
}));

beforeEach(() => {
  mocked.stateRef.current = {
    projects: [remoteProject],
    workspaces: [folderWorkspace],
    selectedProjectId: LOCAL_FOLDER_PROJECT_ID,
    selectedWorkspaceId: "folder-1",
    displayProjectIds: ["repo-1"],
    workspaceListHierarchyMode: "by_project",
  };
});

describe("MainPaneTitleBarView", () => {
  it("renders the Local Folders label instead of unknown project when a folder is selected", () => {
    render(<MainPaneTitleBarView />);
    expect(screen.getByText("project.list.localFolders")).toBeTruthy();
    expect(screen.queryByText("project.unknown")).toBeNull();
  });

  it("renders the folder workspace name in the workspace selector", () => {
    render(<MainPaneTitleBarView />);
    // The workspace selector shows the folder name (may also appear in the
    // filtered workspace dropdown data).
    expect(screen.getAllByText("My Folder").length).toBeGreaterThan(0);
  });

  it("renders a project name when a regular project is selected", () => {
    mocked.stateRef.current.selectedProjectId = "repo-1";
    mocked.stateRef.current.selectedWorkspaceId = "";
    render(<MainPaneTitleBarView />);
    expect(screen.getByText("Repo 1")).toBeTruthy();
    expect(screen.queryByText("project.unknown")).toBeNull();
  });
});

describe("mainPaneTitleBarMenus RepoSelectorMenu", () => {
  it("renders the Local Folders entry when folder workspaces exist", () => {
    const setSelectedRepoId = vi.fn();
    render(
      <RepoSelectorMenu
        open
        anchorEl={document.createElement("button")}
        repoSearchValue=""
        setRepoSearchValue={vi.fn()}
        filteredRepoOptions={[remoteProject]}
        localFolderWorkspaces={[folderWorkspace]}
        isLocalFolderSelected
        selectedProjectId={LOCAL_FOLDER_PROJECT_ID}
        setSelectedRepoId={setSelectedRepoId}
        setRepoMenuAnchorEl={vi.fn()}
        setWorkspaceMenuAnchorEl={vi.fn()}
        setWorkspaceSearchValue={vi.fn()}
        t={t}
      />,
    );

    const entry = screen.getByRole("menuitem", { name: "project.list.localFolders" });
    expect(entry).toBeTruthy();
    fireEvent.click(entry);
    expect(setSelectedRepoId).toHaveBeenCalledWith(LOCAL_FOLDER_PROJECT_ID);
  });

  it("does not render the Local Folders entry when there are no folder workspaces", () => {
    render(
      <RepoSelectorMenu
        open
        anchorEl={document.createElement("button")}
        repoSearchValue=""
        setRepoSearchValue={vi.fn()}
        filteredRepoOptions={[remoteProject]}
        localFolderWorkspaces={[]}
        isLocalFolderSelected={false}
        selectedProjectId=""
        setSelectedRepoId={vi.fn()}
        setRepoMenuAnchorEl={vi.fn()}
        setWorkspaceMenuAnchorEl={vi.fn()}
        setWorkspaceSearchValue={vi.fn()}
        t={t}
      />,
    );

    expect(screen.queryByRole("menuitem", { name: "project.list.localFolders" })).toBeNull();
  });
});

describe("mainPaneTitleBarHelpers renderWorkspaceKindIcon", () => {
  it("renders a folder icon for a folder workspace", () => {
    const { container } = render(<>{renderWorkspaceKindIcon(folderWorkspace, false, 14)}</>);
    expect(container.querySelector("svg")).toBeTruthy();
  });
});
