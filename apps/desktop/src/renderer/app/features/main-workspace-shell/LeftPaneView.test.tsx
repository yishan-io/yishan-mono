// @vitest-environment jsdom

import { localTaskStore } from "@renderer/domains/local-task";
import { sessionStore } from "@renderer/domains/session";
import { workbenchNavigationStore } from "@renderer/domains/workbench";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LeftPaneView } from "./LeftPaneView";

const snapshotMock = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../../../app/commands/workspaceSnapshotFlow", () => ({ loadWorkspaceSnapshot: snapshotMock }));

const mocked = vi.hoisted(() => {
  const setDisplayProjectIds = vi.fn((repoIds: string[]) => {
    stateRef.current.displayProjectIds = repoIds;
  });
  const setOrganizationDisplayProjectIds = vi.fn((_organizationId: string, repoIds: string[]) => {
    stateRef.current.displayProjectIds = repoIds;
  });

  const stateRef: {
    current: {
      projects: Array<{ id: string; name: string; path: string }>;
      workspaces: Array<{ id: string; repoId: string; name: string; branch: string }>;
      displayProjectIds: string[];
      setDisplayProjectIds: (repoIds: string[]) => void;
      setOrganizationDisplayProjectIds: (organizationId: string, repoIds: string[]) => void;
      setOrderedWorkspaceIds: (ids: string[]) => void;
    };
  } = {
    current: {
      projects: [],
      workspaces: [],
      displayProjectIds: [],
      setDisplayProjectIds,
      setOrganizationDisplayProjectIds,
      setOrderedWorkspaceIds: () => {},
    },
  };

  const workspaceStore = vi.fn((selector: (state: typeof stateRef.current) => unknown) => selector(stateRef.current));
  Object.assign(workspaceStore, {
    getState: () => stateRef.current,
  });

  return {
    setDisplayProjectIds,
    setOrganizationDisplayProjectIds,
    stateRef,
    workspaceStore,
  };
});

// Keep filter commands real; only daemon IO is replaced.
vi.mock("@renderer/rpc/client", () => ({
  subscribeConnectionStatus: vi.fn(() => () => {}),
  request: vi.fn(async (method: string, params?: { value?: unknown }) => {
    if (method === "preferences.get") {
      return {
        found: true,
        value: { isInitialized: true, displayProjectIds: [...mocked.stateRef.current.displayProjectIds] },
      };
    }
    if (method === "preferences.set") {
      return { found: true, value: params?.value };
    }
    if (method === "workspace.closeProject" || method === "workspace.openProject") return {};
    throw new Error(`Unexpected daemon RPC: ${method}`);
  }),
}));

vi.mock("react-i18next", () => ({
  initReactI18next: {
    type: "3rdParty",
    init: () => undefined,
  },
  useTranslation: () => ({
    t: (key: string, params?: { name?: string; count?: number; message?: string }) => {
      const translations: Record<string, string> = {
        "workspace.actions.delete": "Delete workspace",
        "workspace.delete.confirm": `Delete workspace '${params?.name ?? ""}'?`,
        "project.refreshFailed": `Could not refresh projects: ${params?.message ?? ""}`,
        "project.actions.delete": "Delete project",
        "project.delete.confirm": `Delete project '${params?.name ?? ""}' and all child workspaces?`,
        "project.filter.placeholder": "Filter by project, path, workspace, or branch",
        "project.filter.empty": "No projects match the current filter.",
        "project.filter.searchPlaceholder": "Quick search projects",
        "project.filter.searchAriaLabel": "Quick search projects",
        "project.filter.actions.all": "Select all",
        "project.pin.actions.all": "All",
        "project.pin.searchPlaceholder": "Search projects",
        "project.pin.searchAriaLabel": "Search projects",
        "project.pin.sections.hirarchy": "Hierarchy",
        "project.pin.sections.projects": "Projects",
        "project.pin.hierarchy.byProject": "By project",
        "project.pin.hierarchy.byNode": "By node",
        "common.actions.cancel": "Cancel",
        "common.actions.close": "Close",
        "org.settings.title": "Organization settings",
        "project.list.title": "Projects",
        "project.actions.filter": "Filter",
        "project.actions.pin": "Pin projects",
        "project.actions.addRepository": "Add project",
        "localTask.progressingCount": `Tasks, ${params?.count ?? 0} active`,
      };

      return translations[key] ?? key;
    },
  }),
}));

vi.mock("../../../domains/project/state/projectStore", () => {
  const projectStore = (
    selector: (state: {
      projects: unknown[];
      displayProjectIds: string[];
      setDisplayProjectIds: (ids: string[]) => void;
      setOrganizationDisplayProjectIds: (organizationId: string, ids: string[]) => void;
      hydrateOrganizationProjectFilter: (organizationId: string, ids: string[]) => void;
    }) => unknown,
  ) =>
    selector({
      projects: mocked.stateRef.current.projects ?? [],
      displayProjectIds: mocked.stateRef.current.displayProjectIds ?? [],
      setDisplayProjectIds: mocked.stateRef.current.setDisplayProjectIds,
      setOrganizationDisplayProjectIds: mocked.stateRef.current.setOrganizationDisplayProjectIds,
      hydrateOrganizationProjectFilter: mocked.setOrganizationDisplayProjectIds,
    });
  (
    projectStore as unknown as {
      getState: () => {
        projects: unknown[];
        displayProjectIds: string[];
        setDisplayProjectIds: (ids: string[]) => void;
        setOrganizationDisplayProjectIds: (organizationId: string, ids: string[]) => void;
        hydrateOrganizationProjectFilter: (organizationId: string, ids: string[]) => void;
      };
    }
  ).getState = () => ({
    projects: mocked.stateRef.current.projects ?? [],
    displayProjectIds: mocked.stateRef.current.displayProjectIds ?? [],
    setDisplayProjectIds: mocked.stateRef.current.setDisplayProjectIds,
    setOrganizationDisplayProjectIds: mocked.stateRef.current.setOrganizationDisplayProjectIds,
    hydrateOrganizationProjectFilter: mocked.setOrganizationDisplayProjectIds,
  });
  return { projectStore };
});

vi.mock("../../../domains/workspace/state/workspaceStore", () => ({
  workspaceStore: mocked.workspaceStore,
}));

vi.mock("@renderer/platform/platform", () => ({
  getRendererPlatform: () => "darwin",
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
  useInRouterContext: () => true,
}));

vi.mock("../app-menu/AppMenuView", () => ({
  AppMenuView: () => <div data-testid="app-menu-view" />,
}));

vi.mock("@renderer/domains/project", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@renderer/domains/project")>();
  return {
    ...actual,
    CreateProjectDialogView: () => null,
    ProjectConfigDialogView: () => null,
  };
});

vi.mock("@renderer/app/features/project-workspace-navigator/WorkspaceNavigatorView", () => ({
  WorkspaceNavigatorView: () => (
    <>
      {mocked.stateRef.current.projects
        .filter((repo) => mocked.stateRef.current.displayProjectIds.includes(repo.id))
        .map((repo) => (
          <div key={repo.id} data-testid={`visible-repo-${repo.id}`}>
            {repo.name}
          </div>
        ))}
    </>
  ),
}));

vi.mock("./LeftPaneResourceUsageControl", () => ({
  LeftPaneResourceUsageControl: () => <div data-testid="left-pane-resource-usage-control" />,
}));

describe("LeftPaneView deletion", () => {
  beforeEach(() => {
    sessionStore.setState({ selectedOrganizationId: "org-1" });
    mocked.stateRef.current = {
      projects: [{ id: "repo-1", name: "Repo 1", path: "/tmp/repo-1" }],
      workspaces: [{ id: "workspace-1", repoId: "repo-1", name: "Feature A", branch: "feature-a" }],
      displayProjectIds: ["repo-1"],
      setDisplayProjectIds: mocked.stateRef.current.setDisplayProjectIds,
      setOrganizationDisplayProjectIds: mocked.stateRef.current.setOrganizationDisplayProjectIds,
      setOrderedWorkspaceIds: () => {},
    };
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("opts into diagnostics only when manual refresh is clicked", async () => {
    render(<LeftPaneView />);
    expect(snapshotMock).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "project.actions.refresh" }));
    });
    expect(snapshotMock).toHaveBeenCalledExactlyOnceWith({ diagnostics: true, throwOnError: true });
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("shows refresh error details, recovers the spinner, supports dismissal and clears errors on retry", async () => {
    snapshotMock.mockRejectedValueOnce(new Error("Daemon is offline"));
    render(<LeftPaneView />);
    const refresh = screen.getByRole("button", { name: "project.actions.refresh" });
    await act(async () => {
      fireEvent.click(refresh);
    });
    expect(screen.getByRole("alert").textContent).toContain("Could not refresh projects: Daemon is offline");
    expect(refresh.hasAttribute("disabled")).toBe(false);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
    });
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());

    snapshotMock.mockRejectedValueOnce("Connection refused");
    await act(async () => {
      fireEvent.click(refresh);
    });
    expect(screen.getByRole("alert").textContent).toContain("Connection refused");
    let resolve!: () => void;
    snapshotMock.mockImplementationOnce(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    await act(async () => {
      fireEvent.click(refresh);
    });
    expect(refresh.hasAttribute("disabled")).toBe(true);
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    await act(async () => {
      resolve();
    });
    expect(refresh.hasAttribute("disabled")).toBe(false);
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("supports toggling individual projects and select-all in the filter popover", async () => {
    mocked.stateRef.current = {
      ...mocked.stateRef.current,
      projects: [
        { id: "repo-1", name: "Repo 1", path: "/tmp/repo-1" },
        { id: "repo-2", name: "Client Portal", path: "/tmp/client-portal" },
      ],
      displayProjectIds: ["repo-1", "repo-2"],
      workspaces: [
        { id: "workspace-1", repoId: "repo-1", name: "Feature A", branch: "feature-a" },
        { id: "workspace-2", repoId: "repo-2", name: "Billing Queue", branch: "feature-billing" },
      ],
    };

    const { rerender } = render(<LeftPaneView />);

    expect(screen.getByTestId("visible-repo-repo-1")).toBeTruthy();
    expect(screen.getByTestId("visible-repo-repo-2")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Pin projects" }));

    // Uncheck one project
    const repo1Option = screen.getAllByText("Repo 1").at(-1);
    expect(repo1Option).toBeTruthy();
    if (!repo1Option) {
      throw new Error("Expected Repo 1 option");
    }
    await act(async () => {
      fireEvent.click(repo1Option);
    });
    rerender(<LeftPaneView />);

    expect(screen.queryByTestId("visible-repo-repo-1")).toBeNull();
    expect(screen.getByTestId("visible-repo-repo-2")).toBeTruthy();

    // Select all restores everything
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "All" }));
    });
    rerender(<LeftPaneView />);

    expect(screen.getByTestId("visible-repo-repo-1")).toBeTruthy();
    expect(screen.getByTestId("visible-repo-repo-2")).toBeTruthy();
  });

  it("filters popover repository options with quick search and supports selection", async () => {
    mocked.stateRef.current = {
      ...mocked.stateRef.current,
      projects: [
        { id: "repo-1", name: "Repo 1", path: "/tmp/repo-1" },
        { id: "repo-2", name: "Client Portal", path: "/tmp/client-portal" },
      ],
      displayProjectIds: ["repo-1"],
    };

    const { rerender } = render(<LeftPaneView />);

    expect(screen.getByTestId("visible-repo-repo-1")).toBeTruthy();
    expect(screen.queryByTestId("visible-repo-repo-2")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Pin projects" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search projects" }), {
      target: { value: "client" },
    });
    const popoverRepoOption = screen.getAllByText("Client Portal").at(-1);
    expect(popoverRepoOption).toBeTruthy();
    if (!popoverRepoOption) {
      throw new Error("Missing popover repo option");
    }
    await act(async () => {
      fireEvent.click(popoverRepoOption);
    });
    rerender(<LeftPaneView />);

    expect(screen.getByTestId("visible-repo-repo-1")).toBeTruthy();
    expect(screen.getByTestId("visible-repo-repo-2")).toBeTruthy();
  });

  it("shows the progressing-task badge immediately under Overview and opens only the Task Hub", () => {
    localTaskStore.setState({ progressingTaskCount: 7 });
    workbenchNavigationStore.getState().setOverlayPanel(null);
    render(<LeftPaneView />);

    const overviewButton = screen.getByRole("button", { name: "overview.title" });
    const tasksButton = screen.getByRole("button", { name: "Tasks, 7 active" });
    expect(overviewButton.nextElementSibling).toBe(tasksButton);
    const taskCount = screen.getByTestId("local-task-active-count");
    expect(taskCount.textContent).toBe("7");
    expect(tasksButton.lastElementChild).toBe(taskCount);
    expect(taskCount.classList.contains("MuiBadge-colorPrimary")).toBe(false);

    fireEvent.click(tasksButton);
    expect(workbenchNavigationStore.getState().overlayPanel).toBe("tasks");
    expect(screen.queryByRole("list", { name: "localTask.title" })).toBeNull();
  });

  it("shows left pane toggle button in header", () => {
    const onToggleLeftPane = vi.fn();

    render(<LeftPaneView onToggleLeftPane={onToggleLeftPane} />);

    const toggleButton = screen.getByRole("button", { name: "layout.toggleLeftSidebar" });
    expect(toggleButton).toBeTruthy();

    fireEvent.click(toggleButton);

    expect(onToggleLeftPane).toHaveBeenCalledTimes(1);
  });

  it("marks the left pane header as draggable", () => {
    render(<LeftPaneView />);

    const header = screen.getByRole("button", { name: "layout.toggleLeftSidebar" }).closest("header");
    expect(header?.classList.contains("electron-webkit-app-region-drag")).toBe(true);
  });

  it("renders organization menu in the bottom footer", () => {
    render(<LeftPaneView />);

    expect(screen.getByTestId("app-menu-view")).toBeTruthy();
  });

  it("renders a footer create repository button and triggers callback", () => {
    const onCreateRepository = vi.fn();

    render(<LeftPaneView onCreateRepository={onCreateRepository} />);

    fireEvent.click(screen.getByRole("button", { name: "Add project" }));

    expect(onCreateRepository).toHaveBeenCalledTimes(1);
  });
});
