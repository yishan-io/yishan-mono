// @vitest-environment jsdom

import { LOCAL_FOLDER_PROJECT_ID } from "@shared/workspace/localFolderProjectId";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceProjectRecord } from "../../../domains/project/projectTypes";
import type { WorkspaceItem } from "../../../domains/workspace/workspaceTypes";
import { MainPaneTitleBarView } from "./MainPaneTitleBarView";
import { renderWorkspaceKindIcon } from "./mainPaneTitleBar";
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
  useInRouterContext: () => true,
}));

vi.mock("../launch/DaemonVersionWarningControl", () => ({
  DaemonVersionWarningControl: () => null,
}));

vi.mock("../main-workspace-shell/WorkspacePortsMenuControl", () => ({
  WorkspacePortsMenuControl: () => null,
}));

vi.mock("react-i18next", () => ({
  initReactI18next: {
    type: "3rdParty",
    init: () => undefined,
  },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../../../domains/session/state/sessionStore", () => ({
  sessionStore: (selector: (state: { daemonVersion?: string; appVersion?: string }) => unknown) =>
    selector({ daemonVersion: "1.0.0", appVersion: "1.0.0" }),
}));

vi.mock("../../../domains/workspace/state/workspaceStore", () => ({
  workspaceStore: (selector: (state: (typeof mocked.stateRef)["current"]) => unknown) =>
    selector(mocked.stateRef.current),
}));

vi.mock("@renderer/domains/workbench", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@renderer/domains/workbench")>();
  return {
    ...actual,
    workbenchNavigationStore: (
      selector: (state: {
        activeProjectId: string;
        activeWorkspaceId: string;
        overlayPanel: unknown;
      }) => unknown,
    ) =>
      selector({
        activeProjectId: mocked.stateRef.current.selectedProjectId,
        activeWorkspaceId: mocked.stateRef.current.selectedWorkspaceId,
        overlayPanel: null,
      }),
    useWorkspacePaneVisibilityContext: () => ({ leftCollapsed: false, onToggleLeftPane: vi.fn() }),
  };
});

vi.mock("../../../domains/project/state/projectStore", () => {
  const projectStore = (selector: (state: { projects: unknown[] }) => unknown) =>
    selector({ projects: mocked.stateRef.current.projects ?? [] });
  (projectStore as unknown as { getState: () => { projects: unknown[] } }).getState = () => ({
    projects: mocked.stateRef.current.projects ?? [],
  });
  return { projectStore };
});

vi.mock("../../../domains/agent/state/chatStore", () => ({
  chatStore: (
    selector: (state: {
      workspaceAgentStatusByWorkspaceId: Record<string, unknown>;
      workspaceUnreadToneByWorkspaceId: Record<string, unknown>;
    }) => unknown,
  ) => selector({ workspaceAgentStatusByWorkspaceId: {}, workspaceUnreadToneByWorkspaceId: {} }),
}));

vi.mock("../../../app/commands/useCommands", () => {
  const commandSurface = () => ({
    activateProject: ({ projectId }: { projectId: string }) => {
      mocked.stateRef.current.selectedProjectId = projectId;
    },
    activateWorkspace: ({ workspaceId, projectId }: { workspaceId: string; projectId?: string }) => {
      mocked.stateRef.current.selectedWorkspaceId = workspaceId;
      if (projectId) {
        mocked.stateRef.current.selectedProjectId = projectId;
      }
    },
    openTab: vi.fn(),
    updateProjectConfig: vi.fn(),
  });
  return {
    useAppCommands: commandSurface,
    useWorkspaceCommands: commandSurface,
    useAgentCommands: commandSurface,
    useGitCommands: commandSurface,
    useWorkbenchCommands: commandSurface,
  };
});

vi.mock("../../../app/commands/appCommands", () => ({
  getMainWindowFullscreenState: () => Promise.resolve({ isFullscreen: false }),
}));

vi.mock("@renderer/platform/platform", () => ({
  getRendererPlatform: () => "darwin",
}));

vi.mock("../../../components/PaneToggleButton", () => ({
  PaneToggleButton: () => null,
}));

vi.mock("@renderer/domains/project", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@renderer/domains/project")>();
  return {
    ...actual,
    renderProjectIcon: (iconId: string | undefined, size: number) => {
      const { LuFolder } = require("react-icons/lu") as typeof import("react-icons/lu");
      return <LuFolder size={size} data-testid={iconId ? `project-icon-${iconId}` : "project-icon-default"} />;
    },
  };
});

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
    const activateProject = vi.fn();
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
        activateProject={activateProject}
        setRepoMenuAnchorEl={vi.fn()}
        setWorkspaceMenuAnchorEl={vi.fn()}
        setWorkspaceSearchValue={vi.fn()}
        t={t}
      />,
    );

    const entry = screen.getByRole("menuitem", { name: "project.list.localFolders" });
    expect(entry).toBeTruthy();
    fireEvent.click(entry);
    expect(activateProject).toHaveBeenCalledWith(LOCAL_FOLDER_PROJECT_ID);
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
        activateProject={vi.fn()}
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
    const { container } = render(renderWorkspaceKindIcon(folderWorkspace, false, 14));
    expect(container.querySelector("svg")).toBeTruthy();
  });
});
