// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LeftPaneView } from "./LeftPaneView";

const mocked = vi.hoisted(() => {
  const setDisplayRepoIds = vi.fn((repoIds: string[]) => {
    stateRef.current.displayRepoIds = repoIds;
  });

  const stateRef: {
    current: {
      repos: Array<{ id: string; name: string; path: string }>;
      workspaces: Array<{ id: string; repoId: string; name: string; branch: string }>;
      displayRepoIds: string[];
      setDisplayRepoIds: (repoIds: string[]) => void;
    };
  } = {
    current: {
      repos: [],
      workspaces: [],
      displayRepoIds: [],
      setDisplayRepoIds,
    },
  };

  const workspaceStore = vi.fn((selector: (state: typeof stateRef.current) => unknown) => selector(stateRef.current));

  return {
    setDisplayRepoIds,
    stateRef,
    workspaceStore,
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: { name?: string }) => {
      const translations: Record<string, string> = {
        "workspace.actions.delete": "Delete workspace",
        "workspace.delete.confirm": `Delete workspace '${params?.name ?? ""}'?`,
        "repo.actions.delete": "Delete repository",
        "repo.delete.confirm": `Delete repository '${params?.name ?? ""}' and all child workspaces?`,
        "repo.filter.placeholder": "Filter by repository, path, workspace, or branch",
        "repo.filter.clear": "Clear repository filter",
        "repo.filter.empty": "No repositories match the current filter.",
        "repo.filter.searchPlaceholder": "Quick search repositories",
        "repo.filter.searchAriaLabel": "Quick search repositories",
        "repo.filter.actions.all": "All",
        "repo.filter.actions.clear": "Clear",
        "common.actions.cancel": "Cancel",
        "org.settings.title": "Organization settings",
        "repo.list.title": "Repositories",
        "repo.actions.filter": "Filter",
        "repo.actions.addRepository": "Add repository",
      };

      return translations[key] ?? key;
    },
  }),
}));

vi.mock("../../../store/workspaceStore", () => ({
  workspaceStore: mocked.workspaceStore,
}));

vi.mock("../../../helpers/platform", () => ({
  getRendererPlatform: () => "darwin",
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("../../layout/AppMenuView", () => ({
  AppMenuView: () => <div data-testid="app-menu-view" />,
}));

vi.mock("./CreateProjectDialogView", () => ({
  CreateProjectDialogView: () => null,
}));

vi.mock("./CreateWorkspaceDialogView", () => ({
  CreateWorkspaceDialogView: () => null,
}));

vi.mock("./ProjectConfigDialogView", () => ({
  ProjectConfigDialogView: () => null,
}));

vi.mock("./ProjectListView", () => ({
  ProjectListView: () => (
    <>
      {mocked.stateRef.current.repos
        .filter((repo) => mocked.stateRef.current.displayRepoIds.includes(repo.id))
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
    mocked.stateRef.current = {
      repos: [{ id: "repo-1", name: "Repo 1", path: "/tmp/repo-1" }],
      workspaces: [{ id: "workspace-1", repoId: "repo-1", name: "Feature A", branch: "feature-a" }],
      displayRepoIds: ["repo-1"],
      setDisplayRepoIds: mocked.setDisplayRepoIds,
    };
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("supports clear and all actions in the repo filter popover", () => {
    mocked.stateRef.current = {
      ...mocked.stateRef.current,
      repos: [
        { id: "repo-1", name: "Repo 1", path: "/tmp/repo-1" },
        { id: "repo-2", name: "Client Portal", path: "/tmp/client-portal" },
      ],
      displayRepoIds: ["repo-1", "repo-2"],
      workspaces: [
        { id: "workspace-1", repoId: "repo-1", name: "Feature A", branch: "feature-a" },
        { id: "workspace-2", repoId: "repo-2", name: "Billing Queue", branch: "feature-billing" },
      ],
    };

    const { rerender } = render(<LeftPaneView />);

    expect(screen.getByTestId("visible-repo-repo-1")).toBeTruthy();
    expect(screen.getByTestId("visible-repo-repo-2")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Filter" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    rerender(<LeftPaneView />);

    expect(screen.queryByTestId("visible-repo-repo-1")).toBeNull();
    expect(screen.queryByTestId("visible-repo-repo-2")).toBeNull();
    expect(screen.getByText("No repositories match the current filter.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "All" }));
    rerender(<LeftPaneView />);

    expect(screen.getByTestId("visible-repo-repo-1")).toBeTruthy();
    expect(screen.getByTestId("visible-repo-repo-2")).toBeTruthy();
  });

  it("filters popover repository options with quick search and supports selection", () => {
    mocked.stateRef.current = {
      ...mocked.stateRef.current,
      repos: [
        { id: "repo-1", name: "Repo 1", path: "/tmp/repo-1" },
        { id: "repo-2", name: "Client Portal", path: "/tmp/client-portal" },
      ],
      displayRepoIds: ["repo-1", "repo-2"],
    };

    const { rerender } = render(<LeftPaneView />);

    fireEvent.click(screen.getByRole("button", { name: "Filter" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Quick search repositories" }), {
      target: { value: "client" },
    });
    const popoverRepoOption = screen.getAllByText("Client Portal").at(-1);
    expect(popoverRepoOption).toBeTruthy();
    if (!popoverRepoOption) {
      throw new Error("Missing popover repo option");
    }
    fireEvent.click(popoverRepoOption);
    rerender(<LeftPaneView />);

    expect(screen.queryByTestId("visible-repo-repo-1")).toBeNull();
    expect(screen.getByTestId("visible-repo-repo-2")).toBeTruthy();
  });

  it("shows left pane toggle button after filter in header", () => {
    const onToggleLeftPane = vi.fn();

    render(<LeftPaneView onToggleLeftPane={onToggleLeftPane} />);

    const filterButton = screen.getByRole("button", { name: "Filter" });
    const toggleButton = screen.getByRole("button", { name: "layout.toggleLeftSidebar" });
    const header = toggleButton.closest("header");
    const headerButtons = Array.from<HTMLElement>(header?.querySelectorAll("button") ?? []);
    const filterButtonIndex = headerButtons.indexOf(filterButton);
    const toggleButtonIndex = headerButtons.indexOf(toggleButton);

    expect(filterButtonIndex).toBeGreaterThanOrEqual(0);
    expect(toggleButtonIndex).toBeGreaterThan(filterButtonIndex);

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

    fireEvent.click(screen.getByRole("button", { name: "Add repository" }));

    expect(onCreateRepository).toHaveBeenCalledTimes(1);
  });
});
