// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_LOCAL_TASK_TAGS, MAX_LOCAL_TASK_TAG_CODE_POINTS } from "../../localTaskTags";
import { localTaskStore } from "../../state/localTaskStore";
import { TaskHubView } from "./TaskHubView";

const commands = vi.hoisted(() => ({
  createLocalTask: vi.fn(async () => undefined),
  createLocalTaskTag: vi.fn(async (name: string) => ({
    id: `tag-${name}`,
    key: name,
    name,
    aliases: [name],
    color: null,
  })),
  createAndLinkLocalTask: vi.fn(async () => undefined),
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
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { page?: number }) => (options?.page ? `${key} ${options.page}` : key),
    i18n: { language: "en-US" },
  }),
}));
vi.mock("@renderer/domains/project", () => ({
  projectStore: (
    selector: (state: { projects: Array<{ id: string; name: string; icon: string; color: string }> }) => unknown,
  ) => selector({ projects: [{ id: "project-1", name: "Renderer Project", icon: "bug", color: "error.main" }] }),
  renderProjectIcon: (iconId: string | undefined) => `project-icon-${iconId}`,
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
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 88,
    getVirtualItems: () =>
      Array.from({ length: Math.min(count, 8) }, (_, index) => ({ index, key: index, start: index * 88, size: 88 })),
  }),
}));

const task = {
  id: "task-1",
  projectId: "project-1",
  title: "Ship Task Hub",
  description: "Desktop UX",
  status: "active" as const,
  priority: "high" as const,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  completedAt: null,
  tags: [],
  tagRefs: [],
};

const initialState = localTaskStore.getState();

describe("TaskHubView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("searches, filters, and creates through Local Task commands", async () => {
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
    expect(screen.queryByRole("combobox", { name: "localTask.fields.status" })).toBeNull();
    fireEvent.click(filterButton);
    expect(filterButton.getAttribute("aria-expanded")).toBe("true");

    const projectSelect = screen.getByPlaceholderText("localTask.fields.project") as HTMLInputElement;
    expect(projectSelect.getAttribute("role")).toBe("combobox");
    for (const field of ["project", "status", "priority"]) {
      expect(screen.queryByText(`localTask.fields.${field}`, { selector: "label" })).toBeNull();
    }

    fireEvent.mouseDown(screen.getByRole("combobox", { name: "localTask.fields.status" }));
    fireEvent.click(await screen.findByRole("option", { name: "localTask.status.paused" }));
    expect(commands.setLocalTaskHubFilters).toHaveBeenCalledWith({ status: "paused" });
    expect(screen.queryByRole("combobox", { name: "localTask.fields.workspace" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "localTask.actions.refresh" }));
    expect(commands.refreshLocalTaskHub).toHaveBeenCalledTimes(2);
    fireEvent.click(filterButton);
    expect(filterButton.getAttribute("aria-expanded")).toBe("false");
    await waitFor(() => expect(screen.queryByRole("combobox", { name: "localTask.fields.status" })).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "localTask.actions.create" }));
    const titleInput = screen.getByRole("textbox", { name: "localTask.fields.title" });
    expect(titleInput.closest(".MuiInputBase-root")?.classList.contains("MuiInputBase-sizeSmall")).toBe(true);
    fireEvent.change(titleInput, { target: { value: "New task" } });
    const createButtons = screen.getAllByRole("button", { name: "localTask.actions.create" });
    const submitButton = createButtons.at(-1);
    expect(submitButton).toBeTruthy();
    if (submitButton) fireEvent.click(submitButton);
    expect(commands.createLocalTask).toHaveBeenCalledWith({
      projectId: undefined,
      organizationId: undefined,
      title: "New task",
      description: "",
      priority: "medium",
      tagIds: [],
    });
  });

  it("uses catalog IDs for filters and task creation", async () => {
    localTaskStore.setState({
      tagCatalog: [{ id: "tag-alpha", key: "alpha", name: "alpha", aliases: ["alpha"], color: null }],
    });
    render(<TaskHubView />);

    fireEvent.click(screen.getByRole("button", { name: "localTask.actions.filter" }));
    const filterInput = screen.getByRole("combobox", { name: "localTask.fields.tags" });
    fireEvent.mouseDown(filterInput);
    fireEvent.click(await screen.findByRole("option", { name: "alpha" }));
    await waitFor(() => expect(commands.setLocalTaskHubFilters).toHaveBeenCalledWith({ tagIds: ["tag-alpha"] }));

    fireEvent.click(screen.getByRole("button", { name: "localTask.actions.create" }));
    const createTagsInput = screen.getAllByRole("combobox", { name: "localTask.fields.tags" }).at(-1);
    if (!createTagsInput) throw new Error("Expected tag input");
    fireEvent.change(createTagsInput, { target: { value: "Café" } });
    fireEvent.keyDown(createTagsInput, { key: "Enter" });
    await waitFor(() => expect(commands.createLocalTaskTag).toHaveBeenCalledWith("Café"));
    fireEvent.change(screen.getByRole("textbox", { name: "localTask.fields.title" }), { target: { value: "Tagged" } });
    fireEvent.click(screen.getAllByRole("button", { name: "localTask.actions.create" }).at(-1) as HTMLButtonElement);
    expect(commands.createLocalTask).toHaveBeenCalledWith({
      projectId: undefined,
      organizationId: undefined,
      title: "Tagged",
      description: "",
      priority: "medium",
      tagIds: ["tag-Café"],
    });
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

    const taskRow = screen.getByRole("button", { name: /Ship Task Hub/ });
    expect(getComputedStyle(taskRow).height).not.toBe("100%");
    expect(getComputedStyle(taskRow).minHeight).not.toBe("0px");
  });

  it("opens a task detail view and returns to the task list", () => {
    render(<TaskHubView />);

    expect(screen.getByText("Daemon Project")).toBeTruthy();
    expect(screen.queryByText("Renderer Project")).toBeNull();
    expect(screen.queryByText("Desktop UX")).toBeNull();
    const taskTitle = screen.getByText("Ship Task Hub");
    const statusIcon = screen.getByLabelText("localTask.status.active");
    const priorityIcon = screen.getByLabelText("localTask.fields.priority: localTask.priority.high");
    expect(statusIcon.compareDocumentPosition(taskTitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(statusIcon.compareDocumentPosition(priorityIcon) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText("localTask.status.active")).toBeNull();
    expect(screen.queryByText("localTask.priority.high")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Ship Task Hub/ }));
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

    fireEvent.click(screen.getByRole("button", { name: /Ship Task Hub/ }));

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

  it("submits with Enter and shows a dialog-local create error", async () => {
    commands.createLocalTask.mockRejectedValueOnce(new Error("create failed"));
    render(<TaskHubView />);
    fireEvent.click(screen.getByRole("button", { name: "localTask.actions.create" }));
    const titleInput = screen.getByRole("textbox", { name: "localTask.fields.title" });
    fireEvent.change(titleInput, { target: { value: "Broken task" } });
    const form = titleInput.closest("form");
    expect(form).toBeTruthy();
    if (!form) return;
    fireEvent.submit(form);
    expect((await screen.findByRole("alert")).textContent).toContain("create failed");
  });

  it("disables create dialog actions while the mutation is loading", () => {
    render(<TaskHubView />);
    fireEvent.click(screen.getByRole("button", { name: "localTask.actions.create" }));
    act(() => localTaskStore.setState({ isMutationLoading: true }));
    expect((screen.getByRole("textbox", { name: "localTask.fields.title" }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "common.actions.cancel" }) as HTMLButtonElement).disabled).toBe(true);
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

    act(() => localTaskStore.setState({ hubFilters: { status: "active" } }));
    await waitFor(() => expect(screen.getByText("Task 0")).toBeTruthy());
    expect(screen.queryByText("Task 40")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "localTask.pagination.page 2" }));
    expect(screen.getByText("Task 20")).toBeTruthy();
    act(() => localTaskStore.setState({ hubTasks: tasks.slice(0, 1) }));
    await waitFor(() => expect(screen.getByText("Task 0")).toBeTruthy());
    expect(screen.queryByRole("navigation", { name: "localTask.pagination.label" })).toBeNull();
  });

  it("hides pagination when the Task Hub has one page", () => {
    render(<TaskHubView />);

    expect(screen.queryByRole("navigation", { name: "localTask.pagination.label" })).toBeNull();
  });
});
