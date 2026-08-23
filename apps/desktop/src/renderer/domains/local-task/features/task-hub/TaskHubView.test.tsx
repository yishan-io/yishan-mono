// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_LOCAL_TASK_TAGS, MAX_LOCAL_TASK_TAG_CODE_POINTS } from "../../localTaskTags";
import { localTaskStore } from "../../state/localTaskStore";
import { TaskHubView } from "./TaskHubView";

const commands = vi.hoisted(() => ({
  createLocalTask: vi.fn(async () => undefined),
  createAndLinkLocalTask: vi.fn(async () => undefined),
  loadLocalTaskContext: vi.fn(async () => undefined),
  loadLocalTaskTagSuggestions: vi.fn(async () => undefined),
  openLocalTaskContextInFileTree: vi.fn(),
  refreshLocalTaskHub: vi.fn(async () => undefined),
  setLocalTaskHubFilters: vi.fn(async () => undefined),
  setLocalTaskHubSearchQuery: vi.fn(async () => undefined),
  updateLocalTask: vi.fn(async () => undefined),
}));

vi.mock("../../commands/localTaskCommands", () => commands);
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, options?: { page?: number }) => (options?.page ? `${key} ${options.page}` : key) }),
}));
vi.mock("@renderer/domains/project", () => ({
  projectStore: (selector: (state: { projects: Array<{ id: string; name: string }> }) => unknown) =>
    selector({ projects: [{ id: "project-1", name: "Project One" }] }),
}));
vi.mock("@renderer/domains/workbench", () => ({
  PaneHeader: ({ children }: { children: React.ReactNode }) => children,
  PaneToggleButton: () => null,
  useWorkspacePaneVisibilityContext: () => ({ leftCollapsed: false, onToggleLeftPane: vi.fn() }),
}));
vi.mock("../workspace-tasks/WorkspaceTaskDetails", () => ({
  WorkspaceTaskDetails: ({
    task,
    showTitle,
  }: {
    task: { title: string; description: string };
    showTitle?: boolean;
  }) => (
    <div>
      {showTitle === false ? null : <div>{task.title}</div>}
      <div>{task.description}</div>
    </div>
  ),
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
};

const initialState = localTaskStore.getState();

describe("TaskHubView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localTaskStore.setState({ ...initialState, hubTasks: [task], hubLoadState: "loaded", hubError: null });
  });

  afterEach(() => {
    cleanup();
    localTaskStore.setState(initialState, true);
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
      title: "New task",
      description: "",
      priority: "medium",
      tags: [],
    });
  });

  it("creates tags and applies an AND tag filter through commands", () => {
    localTaskStore.setState({ tagSuggestions: Array.from({ length: 60 }, (_, index) => `Tag ${index}`) });
    render(<TaskHubView />);

    fireEvent.click(screen.getByRole("button", { name: "localTask.actions.filter" }));
    const filterInput = screen.getByRole("combobox", { name: "localTask.fields.tags" });
    fireEvent.change(filterInput, { target: { value: "alpha" } });
    fireEvent.keyDown(filterInput, { key: "Enter" });
    expect(commands.setLocalTaskHubFilters).toHaveBeenCalledWith({ tags: ["alpha"] });

    fireEvent.click(screen.getByRole("button", { name: "localTask.actions.create" }));
    const createTagsInput = screen.getAllByRole("combobox", { name: "localTask.fields.tags" }).at(-1);
    expect(createTagsInput).toBeTruthy();
    if (!createTagsInput) return;
    fireEvent.change(createTagsInput, { target: { value: "  Cafe\u0301  " } });
    fireEvent.keyDown(createTagsInput, { key: "Enter" });
    fireEvent.change(screen.getByRole("textbox", { name: "localTask.fields.title" }), { target: { value: "Tagged" } });
    const createButton = screen.getAllByRole("button", { name: "localTask.actions.create" }).at(-1);
    expect(createButton).toBeTruthy();
    if (!createButton) return;
    fireEvent.click(createButton);
    expect(commands.createLocalTask).toHaveBeenCalledWith({
      projectId: undefined,
      title: "Tagged",
      description: "",
      priority: "medium",
      tags: ["Café"],
    });
  });

  it.each([
    ["duplicate", ["existing"], "EXISTING", "Tags must be unique."],
    [
      "thirteenth tag",
      Array.from({ length: MAX_LOCAL_TASK_TAGS }, (_, index) => `tag-${index}`),
      "extra",
      `A task can have at most ${MAX_LOCAL_TASK_TAGS} tags.`,
    ],
    [
      "overlength tag",
      [],
      "a".repeat(MAX_LOCAL_TASK_TAG_CODE_POINTS + 1),
      `Tags can contain at most ${MAX_LOCAL_TASK_TAG_CODE_POINTS} characters.`,
    ],
  ])("does not call the filter command for an invalid %s draft", (_name, tags, invalidTag, expectedError) => {
    localTaskStore.setState({ hubFilters: { tags } });
    render(<TaskHubView />);

    fireEvent.click(screen.getByRole("button", { name: "localTask.actions.filter" }));
    const tagsInput = screen.getByRole("combobox", { name: "localTask.fields.tags" });
    fireEvent.change(tagsInput, { target: { value: invalidTag } });
    fireEvent.keyDown(tagsInput, { key: "Enter" });

    expect(commands.setLocalTaskHubFilters).not.toHaveBeenCalled();
    expect(screen.getByText(expectedError)).toBeTruthy();
  });

  it.each([
    ["duplicate", ["existing"], "EXISTING"],
    ["overlength", [], "a".repeat(MAX_LOCAL_TASK_TAG_CODE_POINTS + 1)],
  ])("disables and does not call create for an invalid visible %s tag draft", (_name, tags, invalidTag) => {
    render(<TaskHubView />);
    fireEvent.click(screen.getByRole("button", { name: "localTask.actions.create" }));
    fireEvent.change(screen.getByRole("textbox", { name: "localTask.fields.title" }), {
      target: { value: "New task" },
    });
    const tagsInput = screen.getByRole("combobox", { name: "localTask.fields.tags" });
    for (const tag of tags) {
      fireEvent.change(tagsInput, { target: { value: tag } });
      fireEvent.keyDown(tagsInput, { key: "Enter" });
    }
    fireEvent.change(tagsInput, { target: { value: invalidTag } });
    fireEvent.keyDown(tagsInput, { key: "Enter" });

    const submitButton = screen.getAllByRole("button", { name: "localTask.actions.create" }).at(-1);
    expect(submitButton).toBeTruthy();
    expect((submitButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.submit(tagsInput.closest("form") as HTMLFormElement);
    expect(commands.createLocalTask).not.toHaveBeenCalled();
  });

  it("keeps the Task Hub overflow count outside the clipped visible-tag region", () => {
    localTaskStore.setState({
      hubTasks: [{ ...task, tags: ["a".repeat(MAX_LOCAL_TASK_TAG_CODE_POINTS), "second", "third"] }],
    });
    render(<TaskHubView />);

    const overflowChip = screen.getByText("+1").closest(".MuiChip-root");
    expect(overflowChip).toBeTruthy();
    const visibleTagsRegion = overflowChip?.previousElementSibling;
    expect(visibleTagsRegion).toBeTruthy();
    expect(getComputedStyle(visibleTagsRegion as Element).overflow).toBe("hidden");
    expect(getComputedStyle(overflowChip?.parentElement as Element).overflow).toBe("visible");
    expect(overflowChip?.parentElement?.parentElement).toBe(screen.getByRole("button", { name: /Ship Task Hub/ }));
  });

  it("opens a task detail view and returns to the task list", () => {
    render(<TaskHubView />);

    expect(screen.getByText("Project One")).toBeTruthy();
    expect(screen.queryByText("Desktop UX")).toBeNull();
    const taskTitle = screen.getByText("Ship Task Hub");
    const priorityIcon = screen.getByLabelText("localTask.fields.priority: localTask.priority.high");
    expect(priorityIcon.compareDocumentPosition(taskTitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText("localTask.priority.high")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Ship Task Hub/ }));
    expect(screen.getByText("Desktop UX")).toBeTruthy();
    expect(screen.getAllByText("Ship Task Hub")).toHaveLength(1);
    expect(screen.queryByRole("textbox", { name: "localTask.search.label" })).toBeNull();
    expect(screen.queryByRole("button", { name: "localTask.actions.create" })).toBeNull();
    const detailTitleBar = screen.getByTestId("local-task-hub-title");
    expect(screen.getByRole("button", { name: "common.actions.back" }).closest("[data-testid]")).toBe(detailTitleBar);
    expect(screen.getByRole("button", { name: "localTask.context.openFolder" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "localTask.actions.pauseTask" }));
    expect(commands.updateLocalTask).toHaveBeenCalledWith("task-1", { status: "paused" });
    expect(screen.getByRole("button", { name: "localTask.actions.completeTask" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "common.actions.back" }));
    expect(screen.getByRole("textbox", { name: "localTask.search.label" })).toBeTruthy();
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
