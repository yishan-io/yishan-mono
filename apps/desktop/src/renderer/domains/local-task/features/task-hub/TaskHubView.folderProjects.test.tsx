// @vitest-environment jsdom

import { workspaceStore } from "@renderer/domains/workspace";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localTaskStore } from "../../state/localTaskStore";
import { TaskHubView, resolveTaskHubProjectDisplays } from "./TaskHubView";
const projectMocks = vi.hoisted(() => ({
  projects: Array.from({ length: 100 }, (_, index) => ({
    id: `project-${index + 1}`,
    name: index === 0 ? "Renderer Project" : `Renderer Project ${index + 1}`,
    icon: "bug",
    color: "error.main",
    sourceType: "git",
    repoKey: "renderer-project",
    localPath: "/projects/renderer-project",
  })),
}));
const commands = vi.hoisted(() => ({
  createLocalTaskTag: vi.fn(),
  loadLocalTaskContext: vi.fn(async () => undefined),
  loadLocalTaskDetails: vi.fn(async () => undefined),
  loadLocalTaskTagSuggestions: vi.fn(async () => undefined),
  navigateToLocalTaskProject: vi.fn(),
  navigateToLocalTaskWorkspace: vi.fn(),
  openLocalTaskContextInFileTree: vi.fn(),
  refreshLocalTaskHub: vi.fn(async () => undefined),
  setLocalTaskHubFilters: vi.fn(async () => undefined),
  setLocalTaskHubSearchQuery: vi.fn(async () => undefined),
  updateLocalTask: vi.fn(async () => undefined),
  updateLocalTaskTagColor: vi.fn(async () => undefined),
}));
vi.mock("../../commands/localTaskCommands", () => commands);
const workspaceCommands = vi.hoisted(() => ({
  createWorkspaceForLocalTask: vi.fn((): Promise<string> => Promise.resolve("workspace-1")),
}));
vi.mock("../../commands/localTaskWorkspaceCommands", () => workspaceCommands);
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { field?: string; page?: number; title?: string; taskId?: string }) =>
      options?.page
        ? `${key} ${options.page}`
        : options?.field
          ? `${key} ${options.field}`
          : options?.title
            ? `${key}: ${options.title}`
            : options?.taskId
              ? `${key}: ${options.taskId}`
              : key,
    i18n: { language: "en-US" },
  }),
}));
vi.mock("@renderer/domains/project", () => ({
  projectStore: (
    selector: (state: { projects: Array<{ id: string; name: string; icon: string; color: string }> }) => unknown,
  ) => selector({ projects: projectMocks.projects }),
  renderProjectIcon: (iconId: string | undefined) => `project-icon-${iconId}`,
  supportsGitFeatures: (sourceType?: string) => sourceType !== "unknown",
}));
vi.mock("@renderer/domains/workbench", () => ({
  PaneHeader: ({ children }: { children: React.ReactNode }) => children,
  PaneToggleButton: () => null,
  useWorkspacePaneVisibilityContext: () => ({ leftCollapsed: false, onToggleLeftPane: vi.fn() }),
  createFixedRuntimeLayer: () => ({
    register: vi.fn(),
    attach: vi.fn(),
    detach: vi.fn(),
    remove: vi.fn(),
    refresh: vi.fn(),
  }),
}));
vi.mock("../tags/LocalTaskTagsInlineEditor", () => ({
  LocalTaskTagsInlineEditor: () => null,
}));
vi.mock("./CreateLocalTaskDialog", () => ({
  CreateLocalTaskDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="create-local-task-dialog" /> : null,
}));
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 88,
    getVirtualItems: () =>
      Array.from({ length: Math.min(count, 8) }, (_, index) => ({ index, key: index, start: index * 88, size: 88 })),
  }),
}));
const task = {
  id: "task-1",
  key: "TASK-1",
  projectId: "project-1",
  title: "Ship Task Hub",
  description: "Desktop UX",
  status: "progressing" as const,
  priority: "high" as const,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  completedAt: null,
  hasActiveWorkspace: false,
  tags: [],
  tagRefs: [],
};
const initialState = localTaskStore.getState();
const defaultProjects = projectMocks.projects;
describe("resolveTaskHubProjectDisplays", () => {
  it("maps folder workspaces by their synthetic project ID without changing daemon project displays", () => {
    const resolvedDisplays = resolveTaskHubProjectDisplays(
      { "project-1": { id: "project-1", name: "Daemon Project", icon: "rocket", color: "primary.main" } },
      [],
      [
        {
          id: "folder-workspace-1",
          repoId: "folder-repo-1",
          projectId: "local-folder",
          name: "My Folder",
          title: "My Folder",
          sourceBranch: "",
          branch: "",
          summaryId: "folder-workspace-1",
          kind: "folder",
        },
      ],
    );

    expect(resolvedDisplays.projectDisplayById).toEqual({
      "folder-workspace-1": {
        id: "folder-workspace-1",
        name: "My Folder",
        icon: "folder",
        color: "text.secondary",
      },
      "project-1": { id: "project-1", name: "Daemon Project", icon: "rocket", color: "primary.main" },
    });
    expect(resolvedDisplays.folderProjectIds).toEqual(new Set(["folder-workspace-1"]));
  });
});
describe("TaskHubView folder projects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectMocks.projects = defaultProjects;
    localTaskStore.setState({
      ...initialState,
      hubTasks: [task],
      hubLoadState: "loaded",
      hubError: null,
      hubProjectDisplayById: {
        "project-1": { id: "project-1", name: "Daemon Project", icon: "rocket", color: "#3B82F6" },
      },
      detailsByTaskId: {
        [task.id]: {
          task,
          project: { id: "project-1", name: "Project One", icon: "rocket", color: "#3B82F6" },
          workspaces: [],
        },
      },
      detailsLoadStateByTaskId: { [task.id]: "loaded" },
    });
  });
  afterEach(() => {
    cleanup();
    localTaskStore.setState(initialState, true);
    workspaceStore.setState({ workspaces: [] });
  });
  it("keeps Start disabled after create acceptance until the Hub projection reports an active workspace", async () => {
    render(<TaskHubView />);
    const startButton = screen.getByRole("button", { name: "localTask.actions.startWorkspaceForTask: Ship Task Hub" });

    await userEvent.setup().click(startButton);
    await waitFor(() => expect(startButton.getAttribute("disabled")).not.toBeNull());
    fireEvent.click(startButton);

    expect(workspaceCommands.createWorkspaceForLocalTask).toHaveBeenCalledOnce();
    expect(screen.queryByText("localTask.workspace.details")).toBeNull();
  });
  it("keeps each task's create action busy while concurrent launches are in progress", async () => {
    const secondTask = { ...task, id: "task-2", title: "Ship Workspace" };
    const resolveLaunches: Array<() => void> = [];
    workspaceCommands.createWorkspaceForLocalTask.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveLaunches.push(() => resolve("workspace-created"));
        }),
    );
    localTaskStore.setState({ hubTasks: [task, secondTask] });
    render(<TaskHubView />);

    fireEvent.click(screen.getByRole("button", { name: "localTask.actions.startWorkspaceForTask: Ship Task Hub" }));
    fireEvent.click(screen.getByRole("button", { name: "localTask.actions.startWorkspaceForTask: Ship Workspace" }));

    await waitFor(() => {
      expect(
        screen
          .getByRole("button", { name: "localTask.actions.startWorkspaceForTask: Ship Task Hub" })
          .getAttribute("disabled"),
      ).not.toBeNull();
      expect(
        screen
          .getByRole("button", { name: "localTask.actions.startWorkspaceForTask: Ship Workspace" })
          .getAttribute("disabled"),
      ).not.toBeNull();
    });
    for (const resolveLaunch of resolveLaunches) resolveLaunch();
  });
  it("keeps a folder task resolved through a normal workspace reload, then removes it after the authoritative folder snapshot", () => {
    const folderWorkspace = {
      id: "folder-workspace-1",
      repoId: "folder-repo-1",
      projectId: "local-folder",
      name: "My Folder",
      title: "My Folder",
      sourceBranch: "",
      branch: "",
      summaryId: "folder-workspace-1",
      kind: "folder" as const,
    };
    localTaskStore.setState({
      hubTasks: [{ ...task, projectId: "folder-workspace-1", projectKind: "folder", projectName: "My Folder" }],
      hubProjectDisplayById: {},
    });
    workspaceStore.setState({ workspaces: [folderWorkspace] });
    render(<TaskHubView />);

    expect(screen.getByText("My Folder")).toBeTruthy();
    act(() => workspaceStore.getState().load("org-1", []));

    expect(screen.getByText("My Folder")).toBeTruthy();
    expect(screen.queryByText("folder-workspace-1")).toBeNull();
    expect(screen.queryByRole("button", { name: "localTask.actions.startWorkspaceForTask: Ship Task Hub" })).toBeNull();

    act(() => workspaceStore.getState().loadLocalFolders([]));

    expect(screen.getByText("My Folder")).toBeTruthy();
    expect(screen.queryByText("folder-workspace-1")).toBeNull();
    expect(screen.queryByRole("button", { name: "localTask.actions.startWorkspaceForTask: Ship Task Hub" })).toBeNull();
  });
  it("renders the persisted folder name in the selected task sidebar when daemon details has no project", () => {
    const folderTask = { ...task, projectId: "folder-1", projectKind: "folder" as const, projectName: "My Folder" };
    localTaskStore.setState({
      hubTasks: [folderTask],
      hubProjectDisplayById: {},
      detailsByTaskId: { [folderTask.id]: { task: folderTask, project: null, workspaces: [] } },
      detailsLoadStateByTaskId: { [folderTask.id]: "loaded" },
    });
    render(<TaskHubView />);

    const taskRow = screen.getByText(folderTask.title).closest("button");
    if (!taskRow) throw new Error("Expected a folder task row button");
    fireEvent.click(taskRow);

    expect(screen.getByText("My Folder")).toBeTruthy();
  });
  it("renders daemon project metadata when renderer project state differs and omits global task chips", () => {
    localTaskStore.setState({
      hubTasks: [task, { ...task, id: "global-task", projectId: null, title: "Global task" }],
      hubProjectDisplayById: {
        "project-1": { id: "project-1", name: "Daemon Project", icon: "rocket", color: "#3B82F6" },
      },
    });
    render(<TaskHubView />);
    const daemonProjectChip = screen.getByText("Daemon Project").closest(".MuiChip-root");
    expect(daemonProjectChip).toBeTruthy();
    expect(screen.queryByText("Renderer Project")).toBeNull();
    expect(daemonProjectChip?.querySelector(".MuiChip-icon")?.textContent).toBe("project-icon-rocket");
    expect(daemonProjectChip?.querySelector("[style*='background']")).toBeNull();
    expect(screen.getByText("Global task").closest("button")?.querySelector(".MuiChip-root")).toBeNull();
  });
  it("falls back to the project ID when legacy task project metadata is unresolved", () => {
    localTaskStore.setState({
      hubTasks: [{ ...task, id: "legacy-task", projectId: "legacy-project", title: "Historical task" }],
      hubProjectDisplayById: {},
    });
    render(<TaskHubView />);
    const projectChip = screen.getByText("legacy-project").closest(".MuiChip-root");
    expect(projectChip).toBeTruthy();
    expect(projectChip?.querySelector(".MuiChip-icon")).toBeNull();
    expect(screen.queryByText("localTask.states.noValue")).toBeNull();
  });
  it("propagates catalog color tokens to Task Hub row tag chips", () => {
    localTaskStore.setState({
      hubTasks: [{ ...task, tagRefs: [{ id: "tag-backend", name: "backend" }] }],
      tagCatalog: [{ id: "tag-backend", key: "backend", name: "backend", aliases: ["backend"], color: "#3B82F6" }],
    });
    render(<TaskHubView />);
    const chip = screen.getByText("backend").closest(".MuiChip-root");
    expect(chip?.querySelector("[data-tag-chip-dot]")).toBeTruthy();
    expect(chip?.querySelector(".MuiChip-icon")).toBeNull();
  });
  it("hides pagination when the Task Hub has one page", () => {
    render(<TaskHubView />);
    expect(screen.queryByRole("navigation", { name: "localTask.pagination.label" })).toBeNull();
  });
});
