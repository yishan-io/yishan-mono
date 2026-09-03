// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_LOCAL_TASK_TAGS, MAX_LOCAL_TASK_TAG_CODE_POINTS } from "../../localTaskTags";
import { localTaskStore } from "../../state/localTaskStore";
import { TaskHubView, getTaskHubProjectFilterOptions } from "./TaskHubView";
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
const defaultProject = defaultProjects[0];
if (!defaultProject) throw new Error("Expected a default project fixture");
describe("getTaskHubProjectFilterOptions", () => {
  it("merges the complete renderer catalog with daemon Hub displays and deduplicates IDs", () => {
    expect(
      getTaskHubProjectFilterOptions(
        [
          { id: "project-renderer", name: "Renderer Project" },
          { id: "project-shared", name: "Stale Project" },
        ],
        {
          "project-daemon": { id: "project-daemon", name: "Daemon-only Project" },
          "project-shared": { id: "project-shared", name: "Daemon Project" },
        },
      ),
    ).toEqual([
      { id: "project-shared", name: "Daemon Project" },
      { id: "project-daemon", name: "Daemon-only Project" },
      { id: "project-renderer", name: "Renderer Project" },
    ]);
  });
});
describe("TaskHubView", () => {
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
          workspaces: [
            { id: "workspace-1", projectId: "project-1", name: "Workspace One", kind: "local", status: "active" },
            { id: "workspace-2", projectId: "project-1", name: "Workspace Two", kind: "managed", status: "closed" },
          ],
        },
      },
      detailsLoadStateByTaskId: { [task.id]: "loaded" },
    });
  });
  afterEach(() => {
    cleanup();
    localTaskStore.setState(initialState, true);
  });
  it("renders and retries a detail projection error", () => {
    localTaskStore.setState({
      detailsByTaskId: {},
      detailsLoadStateByTaskId: { [task.id]: "error" },
      detailsErrorByTaskId: { [task.id]: "detail projection unavailable" },
    });
    render(<TaskHubView />);
    const taskRow = screen.getByText(task.title).closest("button");
    if (!taskRow) throw new Error("Expected a task row button");
    fireEvent.click(taskRow);
    expect(screen.getByRole("alert").textContent).toContain("detail projection unavailable");
    fireEvent.click(screen.getByRole("button", { name: "localTask.actions.retry" }));
    expect(commands.loadLocalTaskDetails).toHaveBeenCalledWith(task.id);
  });
  it("displays the daemon key and an explicit UUID backfill state", () => {
    render(<TaskHubView />);
    expect(screen.getByText("TASK-1")).toBeTruthy();

    cleanup();
    localTaskStore.setState({ hubTasks: [{ ...task, key: null }] });
    render(<TaskHubView />);
    expect(screen.getByText("localTask.states.uuidKeyPending: task-1")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "localTask.actions.startWorkspaceForTask: Ship Task Hub" })
        .getAttribute("disabled"),
    ).not.toBeNull();
  });

  it.each([
    ["global", { projectId: null }],
    ["completed", { status: "done" as const }],
    ["cancelled", { status: "cancelled" as const }],
    ["an active workspace", { hasActiveWorkspace: true }],
  ])("omits workspace creation for %s tasks", (_state, taskOverrides) => {
    localTaskStore.setState({ hubTasks: [{ ...task, ...taskOverrides }] });
    render(<TaskHubView />);

    expect(screen.queryByRole("button", { name: "localTask.actions.startWorkspaceForTask: Ship Task Hub" })).toBeNull();
  });
  it.each([
    ["repository key", "repoKey"],
    ["local path", "localPath"],
  ] as const)("disables workspace creation when the project is missing its %s", (_prerequisite, field) => {
    projectMocks.projects = [{ ...defaultProject, [field]: "" }];
    render(<TaskHubView />);

    const createButton = screen.getByRole("button", { name: "localTask.actions.startWorkspaceForTask: Ship Task Hub" });
    expect(createButton.getAttribute("disabled")).not.toBeNull();
  });
  it("searches and filters through Local Task commands", async () => {
    render(<TaskHubView />);
    const searchInput = screen.getByRole("textbox", { name: "localTask.search.label" }) as HTMLInputElement;
    expect(searchInput.placeholder).toBe("localTask.search.label");
    expect(
      searchInput.closest(".MuiOutlinedInput-root")?.querySelector(".MuiInputAdornment-positionStart svg"),
    ).toBeTruthy();
    fireEvent.change(searchInput, { target: { value: "ship" } });
    expect(commands.setLocalTaskHubSearchQuery).toHaveBeenCalledWith("ship");
    const filterButton = screen.getByRole("button", { name: "localTask.actions.filter" });
    expect(filterButton.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(filterButton);
    expect(filterButton.getAttribute("aria-expanded")).toBe("true");
    expect(screen.queryByRole("textbox", { name: "localTask.filters.addFilter" })).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: "localTask.fields.status" }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "localTask.status.new" }));
    expect(commands.setLocalTaskHubFilters).toHaveBeenCalledWith({ status: ["new"] });
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "localTask.actions.refresh" }));
    expect(commands.refreshLocalTaskHub).toHaveBeenCalledTimes(2);
    expect(filterButton.getAttribute("aria-expanded")).toBe("false");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });
  it("opens the filter menu and lets users select a filter type", () => {
    render(<TaskHubView />);
    fireEvent.click(screen.getByRole("button", { name: "localTask.actions.filter" }));
    expect(screen.queryByRole("textbox", { name: "localTask.filters.addFilter" })).toBeNull();
    const filterFieldMenuItems = [
      screen.getByRole("menuitem", { name: "localTask.fields.project" }),
      screen.getByRole("menuitem", { name: "localTask.fields.status" }),
      screen.getByRole("menuitem", { name: "localTask.fields.priority" }),
      screen.getByRole("menuitem", { name: "localTask.fields.tags" }),
    ];
    for (const filterFieldMenuItem of filterFieldMenuItems) {
      expect(filterFieldMenuItem.querySelector("svg")).toBeTruthy();
    }
    fireEvent.click(screen.getByRole("menuitem", { name: "localTask.fields.status" }));
    for (const status of ["new", "progressing", "done", "cancelled"] as const) {
      expect(screen.getByRole("menuitemcheckbox", { name: `localTask.status.${status}` })).toBeTruthy();
    }
  });
  it("exposes status choices as keyboard-toggleable menu item checkboxes", async () => {
    localTaskStore.setState({ hubFilters: { status: ["new"] } });
    const user = userEvent.setup();
    render(<TaskHubView />);

    await user.click(screen.getByRole("button", { name: "localTask.actions.filter" }));
    await user.click(screen.getByRole("menuitem", { name: "localTask.fields.status" }));

    const selectedStatus = screen.getByRole("menuitemcheckbox", { name: "localTask.status.new" });
    const unselectedStatus = screen.getByRole("menuitemcheckbox", { name: "localTask.status.progressing" });
    expect(selectedStatus.getAttribute("aria-checked")).toBe("true");
    expect(unselectedStatus.getAttribute("aria-checked")).toBe("false");
    expect(screen.queryByRole("checkbox")).toBeNull();

    unselectedStatus.focus();
    await user.keyboard("{Enter}");

    expect(commands.setLocalTaskHubFilters).toHaveBeenCalledWith({ status: ["new", "progressing"] });
  });
  it("renders value icons and searches only the Tag filter menu", () => {
    localTaskStore.setState({
      tagCatalog: [
        { id: "tag-backend", key: "backend", name: "Backend", aliases: [], color: "#3B82F6" },
        { id: "tag-frontend", key: "frontend", name: "Frontend", aliases: [], color: null },
      ],
    });
    render(<TaskHubView />);
    fireEvent.click(screen.getByRole("button", { name: "localTask.actions.filter" }));
    expect(screen.queryByRole("textbox", { name: "localTask.filters.searchTags" })).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: "localTask.fields.project" }));
    expect(screen.getByRole("menuitem", { name: "Daemon Project" }).textContent).toContain("project-icon-rocket");
    fireEvent.click(screen.getByRole("button", { name: "common.actions.back" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "localTask.fields.status" }));
    expect(
      screen
        .getByRole("menuitemcheckbox", { name: "localTask.status.progressing" })
        .querySelector("[data-testid='local-task-status-icon']"),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "common.actions.back" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "localTask.fields.priority" }));
    expect(
      screen
        .getByRole("menuitem", { name: "localTask.priority.high" })
        .querySelector("[data-testid='local-task-priority-icon']"),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "common.actions.back" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "localTask.fields.tags" }));
    const tagSearch = screen.getByRole("textbox", { name: "localTask.filters.searchTags" });
    expect(document.activeElement).toBe(tagSearch);
    fireEvent.change(tagSearch, { target: { value: "backend" } });
    expect(screen.getByRole("menuitem", { name: "Backend" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Frontend" })).toBeNull();
    const tagDot = screen.getByRole("menuitem", { name: "Backend" }).querySelector("[data-tag-filter-dot]");
    expect(getComputedStyle(tagDot as Element).marginRight).not.toBe("0px");
  });
  it("virtualizes large Project and Tag filter catalogs", () => {
    localTaskStore.setState({
      tagCatalog: Array.from({ length: 100 }, (_, index) => ({
        id: `tag-${index}`,
        key: `tag-${index}`,
        name: `Tag ${index}`,
        aliases: [],
        color: null,
      })),
    });
    render(<TaskHubView />);
    fireEvent.click(screen.getByRole("button", { name: "localTask.actions.filter" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "localTask.fields.project" }));
    expect(screen.getAllByRole("menuitem").length).toBeLessThan(20);
    fireEvent.click(screen.getByRole("button", { name: "common.actions.back" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "localTask.fields.tags" }));
    expect(screen.getAllByRole("menuitem").length).toBeLessThan(20);
  });
  it("toggles multiple status filters through the Local Task command", () => {
    render(<TaskHubView />);
    fireEvent.click(screen.getByRole("button", { name: "localTask.actions.filter" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "localTask.fields.status" }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "localTask.status.new" }));
    act(() => localTaskStore.setState({ hubFilters: { status: ["new"] } }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "localTask.status.progressing" }));
    expect(commands.setLocalTaskHubFilters).toHaveBeenLastCalledWith({ status: ["new", "progressing"] });
    act(() => localTaskStore.setState({ hubFilters: { status: ["new", "progressing"] } }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "localTask.status.new" }));
    expect(commands.setLocalTaskHubFilters).toHaveBeenLastCalledWith({ status: ["progressing"] });
    act(() => localTaskStore.setState({ hubFilters: { status: ["progressing"] } }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "localTask.status.progressing" }));
    expect(commands.setLocalTaskHubFilters).toHaveBeenLastCalledWith({});
  });
  it("renders active multi-status filters as removable grouped chips", () => {
    localTaskStore.setState({ hubFilters: { status: ["new", "progressing"] } });
    render(<TaskHubView />);
    expect(
      screen.getByLabelText("localTask.fields.status localTask.status.new, localTask.status.progressing"),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "localTask.filters.addFilter" })).toBeNull();
    expect(screen.getByRole("button", { name: "localTask.filters.clearAll" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "localTask.filters.remove localTask.fields.status" }));
    expect(commands.setLocalTaskHubFilters).toHaveBeenCalledWith({});
  });
  it("removes an active filter with its keyboard-accessible button", async () => {
    localTaskStore.setState({ hubFilters: { priority: "high" } });
    render(<TaskHubView />);
    const removeFilterButton = screen.getByRole("button", {
      name: "localTask.filters.remove localTask.fields.priority",
    });
    removeFilterButton.focus();
    await userEvent.keyboard("{Enter}");
    expect(commands.setLocalTaskHubFilters).toHaveBeenCalledWith({});
  });
  it("uses catalog IDs for tag filters", async () => {
    localTaskStore.setState({
      tagCatalog: [{ id: "tag-alpha", key: "alpha", name: "alpha", aliases: ["alpha"], color: "#3B82F6" }],
    });
    render(<TaskHubView />);
    fireEvent.click(screen.getByRole("button", { name: "localTask.actions.filter" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "localTask.fields.tags" }));
    const tagFilterDot = screen.getByRole("menuitem", { name: "alpha" }).querySelector("[data-tag-filter-dot]");
    expect(tagFilterDot).toBeTruthy();
    expect(getComputedStyle(tagFilterDot as Element).backgroundColor).toBe("rgb(59, 130, 246)");
    fireEvent.click(screen.getByRole("menuitem", { name: "alpha" }));
    await waitFor(() => expect(commands.setLocalTaskHubFilters).toHaveBeenCalledWith({ tagIds: ["tag-alpha"] }));
    expect(screen.getByRole("textbox", { name: "localTask.filters.searchTags" })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("textbox", { name: "localTask.filters.searchTags" }), { key: "Escape" });
  });
  it("shows full Task Hub tag labels without clipping and keeps the overflow count unadorned", () => {
    const longTag = "a".repeat(MAX_LOCAL_TASK_TAG_CODE_POINTS);
    localTaskStore.setState({
      hubTasks: [
        {
          ...task,
          tagRefs: [
            { id: "tag-long", name: longTag },
            { id: "tag-second", name: "second" },
            { id: "tag-third", name: "third" },
          ],
        },
      ],
    });
    render(<TaskHubView />);
    const visibleChip = screen.getByText(longTag).closest(".MuiChip-root");
    const overflowChip = screen.getByText("+1").closest(".MuiChip-root");
    expect(getComputedStyle(visibleChip as Element).maxWidth).not.toBe("120px");
    expect(visibleChip?.querySelector("[data-tag-chip-dot]")).toBeTruthy();
    expect(overflowChip?.querySelector("svg")).toBeNull();
  });
  it("allows a maximum tag row to grow instead of overlapping the next virtual row", () => {
    const maximumTags = Array.from(
      { length: MAX_LOCAL_TASK_TAGS },
      (_, index) => `${index}-${"a".repeat(MAX_LOCAL_TASK_TAG_CODE_POINTS)}`,
    );
    localTaskStore.setState({
      hubTasks: [{ ...task, tagRefs: maximumTags.map((name, index) => ({ id: `tag-${index}`, name })) }],
    });
    render(<TaskHubView />);
    const taskRow = screen.getByRole("button", { name: "Ship Task Hub" });
    expect(getComputedStyle(taskRow).height).not.toBe("100%");
    expect(getComputedStyle(taskRow).minHeight).not.toBe("0px");
  });
  it("opens a task detail view and returns to the task list", () => {
    render(<TaskHubView />);
    expect(screen.getByText("Daemon Project")).toBeTruthy();
    expect(screen.queryByText("Renderer Project")).toBeNull();
    expect(screen.queryByText("Desktop UX")).toBeNull();
    const taskTitle = screen.getByText("Ship Task Hub");
    const statusIcon = screen.getByLabelText("localTask.status.progressing");
    const priorityIcon = screen.getByLabelText("localTask.fields.priority: localTask.priority.high");
    expect(statusIcon.compareDocumentPosition(taskTitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(priorityIcon.compareDocumentPosition(statusIcon) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText("localTask.status.progressing")).toBeNull();
    expect(screen.queryByText("localTask.priority.high")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ship Task Hub" }));
    expect(screen.getByText("Desktop UX")).toBeTruthy();
    expect(screen.getAllByText("Ship Task Hub")).toHaveLength(2);
    expect(screen.queryByRole("textbox", { name: "localTask.search.label" })).toBeNull();
    expect(screen.queryByRole("button", { name: "localTask.actions.create" })).toBeNull();
    const detailTitleBar = screen.getByTestId("local-task-hub-title");
    expect(screen.getByRole("button", { name: "common.actions.back" }).closest("[data-testid]")).toBe(detailTitleBar);
    expect(screen.queryByRole("button", { name: "localTask.context.openFolder" })).toBeNull();
    expect(screen.queryByRole("button", { name: "localTask.actions.pauseTask" })).toBeNull();
    expect(screen.queryByRole("button", { name: "localTask.actions.completeTask" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "common.actions.back" }));
    expect(screen.getByRole("textbox", { name: "localTask.search.label" })).toBeTruthy();
  });
  it("renders daemon projection display metadata without renderer workspace state", () => {
    render(<TaskHubView />);
    fireEvent.click(screen.getByRole("button", { name: "Ship Task Hub" }));
    expect(commands.loadLocalTaskDetails).not.toHaveBeenCalled();
    expect(screen.getByText("Project One")).toBeTruthy();
    expect(screen.getByTestId("local-task-project-icon").textContent).toBe("project-icon-rocket");
    expect(screen.getByText("Workspace One")).toBeTruthy();
    expect(screen.getByText("Workspace Two")).toBeTruthy();
  });
  it("groups the header icon and title, keeps create in the header, and puts filter and refresh after search", () => {
    render(<TaskHubView />);
    const titleGroup = screen.getByTestId("local-task-hub-title");
    expect(titleGroup.querySelector("svg")).toBeTruthy();
    expect(screen.getByText("localTask.title").parentElement).toBe(titleGroup);
    const createButton = screen.getByRole("button", { name: "localTask.actions.create" });
    expect(createButton.closest(".electron-webkit-app-region-no-drag")).toBeTruthy();
    expect(createButton.classList.contains("MuiButton-text")).toBe(true);
    const searchInput = screen.getByRole("textbox", { name: "localTask.search.label" });
    const searchRow = searchInput.parentElement?.parentElement?.parentElement;
    expect(searchRow).toBeTruthy();
    if (searchRow) {
      expect(
        searchInput.compareDocumentPosition(screen.getByRole("button", { name: "localTask.actions.filter" })) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        searchInput.compareDocumentPosition(screen.getByRole("button", { name: "localTask.actions.refresh" })) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    expect(screen.queryByRole("button", { name: "common.actions.close" })).toBeNull();
  });
  it.each([
    ["loading", "progressbar", "localTask.states.loading"],
    ["loaded", "text", "localTask.states.empty"],
    ["error", "alert", "daemon unavailable"],
  ] as const)("renders the %s state", (hubLoadState, role, expectedText) => {
    localTaskStore.setState({ hubLoadState, hubTasks: [], hubError: hubLoadState === "error" ? expectedText : null });
    render(<TaskHubView />);
    if (role === "progressbar") expect(screen.getByRole("progressbar", { name: expectedText })).toBeTruthy();
    else if (role === "alert") expect(screen.getByRole("alert").textContent).toContain(expectedText);
    else expect(screen.getByText(expectedText)).toBeTruthy();
  });
  it("opens the create dialog from the Task Hub header", () => {
    render(<TaskHubView />);
    expect(screen.queryByTestId("create-local-task-dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "localTask.actions.create" }));
    expect(screen.getByTestId("create-local-task-dialog")).toBeTruthy();
  });
  it("paginates task lists and resets or clamps the page when results change", async () => {
    const tasks = Array.from({ length: 60 }, (_, index) => ({ ...task, id: `task-${index}`, title: `Task ${index}` }));
    localTaskStore.setState({ hubTasks: tasks });
    render(<TaskHubView />);
    expect(screen.getByRole("navigation", { name: "localTask.pagination.label" })).toBeTruthy();
    expect(screen.getByText("Task 0")).toBeTruthy();
    expect(screen.queryByText("Task 20")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "localTask.pagination.page 3" }));
    expect(screen.getByText("Task 40")).toBeTruthy();
    act(() => localTaskStore.setState({ hubFilters: { status: ["progressing"] } }));
    await waitFor(() => expect(screen.getByText("Task 0")).toBeTruthy());
    expect(screen.queryByText("Task 40")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "localTask.pagination.page 2" }));
    expect(screen.getByText("Task 20")).toBeTruthy();
    act(() => localTaskStore.setState({ hubTasks: tasks.slice(0, 1) }));
    await waitFor(() => expect(screen.getByText("Task 0")).toBeTruthy());
    expect(screen.queryByRole("navigation", { name: "localTask.pagination.label" })).toBeNull();
  });
});
