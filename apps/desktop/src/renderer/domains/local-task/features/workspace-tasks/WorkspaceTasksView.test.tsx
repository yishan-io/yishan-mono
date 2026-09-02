// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localTaskStore } from "../../state/localTaskStore";
import { WorkspaceTasksView } from "./WorkspaceTasksView";

const commands = vi.hoisted(() => ({
  createLocalTaskTag: vi.fn(async (name: string) => ({
    id: `tag-${name}`,
    key: name,
    name,
    aliases: [name],
    color: null,
  })),
  loadLocalTask: vi.fn(async () => undefined),
  loadLocalTaskContext: vi.fn(async () => undefined),
  loadLocalTaskDetails: vi.fn(async () => undefined),
  loadLocalTaskTagSuggestions: vi.fn(async () => undefined),
  loadLocalTaskTemplates: vi.fn(async () => undefined),
  navigateToLocalTaskProject: vi.fn(),
  navigateToLocalTaskWorkspace: vi.fn(),
  loadLocalTaskLinkCandidates: vi.fn(async () => undefined),
  refreshSelectedWorkspaceTasks: vi.fn(async () => undefined),
  linkLocalTaskWorkspace: vi.fn(),
  createAndLinkLocalTask: vi.fn(),
  openLocalTaskContextInFileTree: vi.fn(),
  openLocalTaskContextFile: vi.fn(),
  selectWorkspaceLocalTask: vi.fn(),
  unlinkLocalTaskWorkspace: vi.fn(),
  updateLocalTask: vi.fn(async () => undefined),
  updateLocalTaskTagColor: vi.fn(async () => undefined),
  updateLocalTaskLinkStatus: vi.fn(async () => undefined),
}));
vi.mock("../../commands/localTaskCommands", () => commands);
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { title?: string; taskId?: string; error?: string }) =>
      values ? `${key} ${values.title ?? ""} ${values.taskId ?? ""} ${values.error ?? ""}` : key,
    i18n: { language: "en-US" },
  }),
}));
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 128,
    getVirtualItems: () =>
      Array.from({ length: Math.min(count, 8) }, (_, index) => ({ index, key: index, start: index * 128, size: 128 })),
    scrollToIndex: vi.fn(),
  }),
}));

const primaryTask = {
  id: "task-primary",
  projectId: "project-1",
  title: "Primary task",
  description: "Primary details",
  status: "progressing" as const,
  priority: "high" as const,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  completedAt: null,
  hasActiveWorkspace: false,
  tags: [],
  tagRefs: [],
};
const relatedTask = {
  ...primaryTask,
  id: "task-related",
  title: "Related task",
  description: "Related details",
  priority: "medium" as const,
};
const primaryLink = {
  id: "link-primary",
  localTaskId: primaryTask.id,
  workspaceId: "workspace-1",
  status: "progressing" as const,
  linkedAt: "2026-01-01",
  unlinkedAt: null,
};
const relatedLink = {
  id: "link-related",
  localTaskId: relatedTask.id,
  workspaceId: "workspace-1",
  status: "progressing" as const,
  linkedAt: "2026-01-01",
  unlinkedAt: null,
};
const initialState = localTaskStore.getState();

function selectWorkspaceHeaderAction(name: string) {
  fireEvent.click(screen.getByRole("button", { name: "localTask.actions.workspaceMenu" }));
  fireEvent.click(screen.getByRole("menuitem", { name }));
}

describe("WorkspaceTasksView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    commands.createAndLinkLocalTask.mockResolvedValue({ status: "linked", task: primaryTask });
    commands.linkLocalTaskWorkspace.mockResolvedValue(undefined);
    commands.unlinkLocalTaskWorkspace.mockResolvedValue(undefined);
    commands.updateLocalTaskLinkStatus.mockResolvedValue(undefined);
    commands.selectWorkspaceLocalTask.mockImplementation((taskId: string) => {
      localTaskStore.setState({ selectedWorkspaceTaskId: taskId });
    });
    localTaskStore.setState({
      ...initialState,
      workspaceLoadState: "loaded",
      workspaceTasks: [primaryTask, relatedTask],
      workspaceLinks: [primaryLink, relatedLink],
      taskById: { [primaryTask.id]: primaryTask, [relatedTask.id]: relatedTask },
      selectedWorkspaceTaskId: primaryTask.id,
      linkCandidateWorkspaceId: "workspace-1",
      linkCandidateTasks: [],
      linkCandidateLoadState: "loaded",
      linkCandidateError: null,
      detailsByTaskId: {
        [primaryTask.id]: {
          task: primaryTask,
          project: { id: "project-1", name: "Project One", icon: "rocket", color: "#3B82F6" },
          workspaces: [
            { id: "workspace-1", projectId: "project-1", name: "Workspace One", kind: "local", status: "active" },
          ],
        },
      },
      detailsLoadStateByTaskId: { [primaryTask.id]: "loaded" },
      contextLoadStateByTaskId: { [primaryTask.id]: "loaded" },
      contextByTaskId: {
        [primaryTask.id]: {
          directory: "/contexts/task-primary",
          files: [
            { name: "plan.md", path: "/contexts/task-primary/plan.md" },
            { name: "notes.md", path: "/contexts/task-primary/notes.md" },
            { name: "outcome.md", path: "/contexts/task-primary/outcome.md" },
          ],
        },
      },
    });
  });
  afterEach(() => {
    cleanup();
    localTaskStore.setState(initialState, true);
  });

  it("allows the workspace task list to use the available pane height", () => {
    render(<WorkspaceTasksView workspaceId="workspace-1" />);

    const scrollContainer = screen.getByRole("list").parentElement;
    if (!scrollContainer) throw new Error("Task list scroll container is missing");

    expect(window.getComputedStyle(scrollContainer).maxHeight).toBe("none");
    expect(window.getComputedStyle(scrollContainer).flexGrow).toBe("1");
  });

  it("opens linked task details in a dedicated pane and returns to the list", () => {
    render(<WorkspaceTasksView workspaceId="workspace-1" />);

    expect(screen.queryByText("Primary details")).toBeNull();
    expect(screen.queryByText("localTask.workspace.details")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Primary task/ }));
    expect(commands.selectWorkspaceLocalTask).toHaveBeenCalledWith("task-primary");
    expect(screen.getByText("Primary details")).toBeTruthy();
    expect(screen.getAllByText("Primary task")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "common.actions.back" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "localTask.context.openFolder" })).toBeNull();
    expect(screen.queryByRole("button", { name: "localTask.actions.pauseTask" })).toBeNull();
    expect(screen.queryByRole("button", { name: "localTask.actions.completeTask" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Related task/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "common.actions.back" }));
    expect(screen.queryByText("Primary details")).toBeNull();
    expect(screen.getByRole("button", { name: /Related task/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Related task/ }));
    expect(commands.selectWorkspaceLocalTask).toHaveBeenCalledWith("task-related");
    const relatedTitle = screen.getByText("Related task");
    const relatedDescription = screen.getByText("Related details");
    expect(screen.queryByText("task-related")).toBeNull();
    expect(relatedTitle.compareDocumentPosition(relatedDescription) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("button", { name: "localTask.fields.status" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "localTask.fields.priority" })).toBeTruthy();
    expect(screen.queryByText("localTask.fields.status: localTask.status.progressing")).toBeNull();
    expect(screen.queryByText("localTask.fields.priority: localTask.priority.medium")).toBeNull();
  });

  it("hides project and workspace metadata inside the workspace detail pane", () => {
    render(<WorkspaceTasksView workspaceId="workspace-1" />);

    fireEvent.click(screen.getByRole("button", { name: /Primary task/ }));
    expect(screen.queryByText("Project One")).toBeNull();
    expect(screen.queryByTestId("local-task-project-icon")).toBeNull();
    expect(screen.queryByText("Workspace One")).toBeNull();
  });

  it("keeps card menus independent from task-details navigation", () => {
    render(<WorkspaceTasksView workspaceId="workspace-1" />);
    const relatedSelection = screen.getByRole("button", { name: /Related task/ });
    const relatedCard = relatedSelection.closest(".MuiPaper-root");
    expect(relatedCard).toBeTruthy();
    if (!relatedCard) return;
    expect(relatedCard.classList.contains("MuiCard-root")).toBe(true);
    expect(relatedCard.classList.contains("MuiPaper-outlined")).toBe(true);

    const taskMenus = screen.getAllByLabelText("localTask.actions.taskMenu");
    const relatedTaskMenu = taskMenus[1];
    expect(relatedTaskMenu).toBeTruthy();
    if (!relatedTaskMenu) return;
    fireEvent.click(relatedTaskMenu);
    expect(commands.selectWorkspaceLocalTask).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "common.actions.back" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "localTask.actions.pauseLink" })).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: "localTask.actions.unlink" }));
    expect(commands.unlinkLocalTaskWorkspace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "localTask.actions.unlink" }));
    expect(commands.unlinkLocalTaskWorkspace).toHaveBeenCalledWith("link-related");
  });

  it("returns safely to the list when the workspace changes or the detailed task disappears", () => {
    const view = render(<WorkspaceTasksView workspaceId="workspace-1" />);
    fireEvent.click(screen.getByRole("button", { name: /Related task/ }));
    expect(screen.getByRole("button", { name: "common.actions.back" })).toBeTruthy();

    view.rerender(<WorkspaceTasksView workspaceId="workspace-2" />);
    expect(screen.queryByRole("button", { name: "common.actions.back" })).toBeNull();

    view.rerender(<WorkspaceTasksView workspaceId="workspace-1" />);
    fireEvent.click(screen.getByRole("button", { name: /Related task/ }));
    act(() => localTaskStore.setState({ workspaceLinks: [primaryLink] }));
    expect(screen.queryByRole("button", { name: "common.actions.back" })).toBeNull();
    expect(screen.getByRole("button", { name: /Primary task/ })).toBeTruthy();
  });

  it("hides unlinked task history from the workspace task list", () => {
    const historicalLink = { ...relatedLink, status: "done" as const, unlinkedAt: "2026-02-01" };
    localTaskStore.setState({ workspaceLinks: [primaryLink, historicalLink] });
    render(<WorkspaceTasksView workspaceId="workspace-1" />);

    expect(screen.getByText("Primary task")).toBeTruthy();
    expect(screen.queryByText("Related task")).toBeNull();
    expect(screen.queryByLabelText("localTask.link.unlinked")).toBeNull();
  });

  it("keeps refresh beside one compact workspace action menu", () => {
    render(<WorkspaceTasksView workspaceId="workspace-1" />);

    expect(screen.queryByRole("button", { name: "localTask.actions.createLocal" })).toBeNull();
    expect(screen.queryByRole("button", { name: "localTask.actions.link" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "localTask.actions.refresh" }));
    expect(commands.refreshSelectedWorkspaceTasks).toHaveBeenCalledWith("workspace-1");

    fireEvent.click(screen.getByRole("button", { name: "localTask.actions.workspaceMenu" }));
    expect(screen.queryByRole("menuitem", { name: "localTask.actions.refresh" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "localTask.actions.createLocal" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "localTask.actions.link" })).toBeTruthy();
  });

  it("creates and links a Local Task to the current workspace", async () => {
    render(<WorkspaceTasksView workspaceId="workspace-1" />);
    selectWorkspaceHeaderAction("localTask.actions.createLocal");
    const titleInput = screen.getByRole("textbox", { name: "localTask.fields.title" });
    fireEvent.change(titleInput, { target: { value: "Workspace task" } });
    const form = titleInput.closest("form");
    expect(form).toBeTruthy();
    if (!form) return;
    fireEvent.submit(form);
    await waitFor(() =>
      expect(commands.createAndLinkLocalTask).toHaveBeenCalledWith(
        { projectId: undefined, title: "Workspace task", description: "", priority: "medium", tagIds: [] },
        "workspace-1",
      ),
    );
  });

  it("retains partial creation and retries only the failed link", async () => {
    commands.createAndLinkLocalTask.mockResolvedValueOnce({
      status: "created",
      task: { ...relatedTask, id: "task-created", title: "Created task" },
      linkError: "link failed",
    });
    render(<WorkspaceTasksView workspaceId="workspace-1" />);
    selectWorkspaceHeaderAction("localTask.actions.createLocal");
    const titleInput = screen.getByRole("textbox", { name: "localTask.fields.title" });
    fireEvent.change(titleInput, { target: { value: "Created task" } });
    const form = titleInput.closest("form");
    expect(form).toBeTruthy();
    if (!form) return;

    fireEvent.submit(form);
    expect((await screen.findByRole("alert")).textContent).toContain("task-created");
    expect(screen.getByRole("alert").textContent).toContain("link failed");
    fireEvent.submit(form);

    await waitFor(() => expect(commands.linkLocalTaskWorkspace).toHaveBeenCalledWith("task-created", "workspace-1"));
    expect(commands.createAndLinkLocalTask).toHaveBeenCalledTimes(1);
  });

  it("uses dedicated link candidates and reports link failures inside the dialog", async () => {
    const availableTask = { ...relatedTask, id: "task-available", title: "Available task" };
    localTaskStore.setState({ linkCandidateTasks: [availableTask] });
    commands.linkLocalTaskWorkspace.mockRejectedValueOnce(new Error("link dialog failed"));
    render(<WorkspaceTasksView workspaceId="workspace-1" />);
    selectWorkspaceHeaderAction("localTask.actions.link");
    const input = await screen.findByRole("combobox", { name: "localTask.link.task" });
    fireEvent.mouseDown(input);

    expect(screen.queryByRole("option", { name: "Primary task" })).toBeNull();
    expect(screen.queryByRole("option", { name: "Related task" })).toBeNull();
    fireEvent.click(screen.getByRole("option", { name: "Available task" }));
    fireEvent.click(screen.getByRole("button", { name: "localTask.actions.link" }));

    expect((await screen.findByRole("alert")).textContent).toContain("link dialog failed");
  });

  it("opens the link dialog immediately, preserves Task Hub state, and supports candidate retry", async () => {
    localTaskStore.setState({
      hubFilters: { status: ["new"] },
      hubSearchQuery: "keep me",
      linkCandidateWorkspaceId: null,
      linkCandidateTasks: [],
      linkCandidateLoadState: "idle",
      linkCandidateError: null,
    });
    render(<WorkspaceTasksView workspaceId="workspace-1" />);
    selectWorkspaceHeaderAction("localTask.actions.link");

    expect(screen.getByText("localTask.link.title")).toBeTruthy();
    expect(screen.getByText("localTask.link.loadingCandidates")).toBeTruthy();
    expect(localTaskStore.getState()).toMatchObject({ hubFilters: { status: ["new"] }, hubSearchQuery: "keep me" });
    expect(commands.loadLocalTaskLinkCandidates).toHaveBeenCalledWith("workspace-1");

    act(() =>
      localTaskStore.setState({
        linkCandidateWorkspaceId: "workspace-1",
        linkCandidateLoadState: "error",
        linkCandidateError: "candidate RPC failed exactly",
      }),
    );
    expect(screen.getByRole("alert").textContent).toContain("candidate RPC failed exactly");
    fireEvent.click(screen.getByRole("button", { name: "localTask.actions.retry" }));
    expect(commands.loadLocalTaskLinkCandidates).toHaveBeenCalledTimes(2);
  });

  it("uses mutation loading to disable and prevent closing the link dialog", async () => {
    localTaskStore.setState({
      linkCandidateTasks: [{ ...relatedTask, id: "task-available", title: "Available task" }],
    });
    render(<WorkspaceTasksView workspaceId="workspace-1" />);
    selectWorkspaceHeaderAction("localTask.actions.link");
    await screen.findByRole("combobox", { name: "localTask.link.task" });

    act(() => localTaskStore.setState({ isMutationLoading: true }));
    expect((screen.getByRole("combobox", { name: "localTask.link.task" }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "common.actions.cancel" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByText("localTask.link.title")).toBeTruthy();
  });

  it("disables and submission-locks the link dialog while linking", async () => {
    const availableTask = { ...relatedTask, id: "task-available", title: "Available task" };
    localTaskStore.setState({ linkCandidateTasks: [availableTask] });
    let resolveLink: (() => void) | undefined;
    commands.linkLocalTaskWorkspace.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveLink = resolve;
        }),
    );
    render(<WorkspaceTasksView workspaceId="workspace-1" />);
    selectWorkspaceHeaderAction("localTask.actions.link");
    const input = await screen.findByRole("combobox", { name: "localTask.link.task" });
    fireEvent.mouseDown(input);
    fireEvent.click(screen.getByRole("option", { name: "Available task" }));
    const submit = screen.getByRole("button", { name: "localTask.actions.link" });
    fireEvent.click(submit);
    fireEvent.click(submit);

    expect(commands.linkLocalTaskWorkspace).toHaveBeenCalledTimes(1);
    expect((screen.getByRole("combobox", { name: "localTask.link.task" }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "common.actions.cancel" }) as HTMLButtonElement).disabled).toBe(true);
    resolveLink?.();
  });

  it("virtualizes workspace relationship history larger than fifty rows", async () => {
    const manyLinks = Array.from({ length: 60 }, (_, index) => ({
      ...relatedLink,
      id: `link-${index}`,
      localTaskId: `task-${index}`,
    }));
    const taskById = Object.fromEntries(
      manyLinks.map((link, index) => [
        link.localTaskId,
        { ...relatedTask, id: link.localTaskId, title: `History ${index}` },
      ]),
    );
    localTaskStore.setState({ workspaceLinks: [primaryLink, ...manyLinks], taskById });
    render(<WorkspaceTasksView workspaceId="workspace-1" />);

    const firstHistoryRow = screen.getByRole("button", { name: /History 0/ });
    expect(screen.getAllByRole("button", { name: /History/ }).length).toBeLessThan(60);
    firstHistoryRow.focus();
    await userEvent.keyboard("{Enter}");
    expect(commands.selectWorkspaceLocalTask).toHaveBeenCalledWith("task-0");
    expect(screen.queryByText("History 59")).toBeNull();
    expect(screen.queryByRole("button", { name: /History/ })).toBeNull();
  });

  it("loads details only for the selected linked row instead of every mounted row", () => {
    const historyLinks = Array.from({ length: 20 }, (_, index) => ({
      ...relatedLink,
      id: `history-link-${index}`,
      localTaskId: `history-task-${index}`,
      unlinkedAt: null,
    }));
    localTaskStore.setState({
      workspaceLinks: [primaryLink, ...historyLinks],
      taskById: { [primaryTask.id]: primaryTask },
    });
    render(<WorkspaceTasksView workspaceId="workspace-1" />);

    expect(commands.loadLocalTask).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /history-task-0/ }));
    expect(commands.loadLocalTask).toHaveBeenCalledTimes(1);
    expect(commands.loadLocalTask).toHaveBeenCalledWith("history-task-0");
  });

  it("supports explicit task pause interactions", () => {
    render(<WorkspaceTasksView workspaceId="workspace-1" />);
    const primaryCard = screen.getByRole("button", { name: /Primary task/ }).closest(".MuiPaper-root");
    expect(primaryCard).toBeTruthy();
    if (!primaryCard) return;
    const cardQueries = within(primaryCard as HTMLElement);
    const statusIcon = cardQueries.getByLabelText("localTask.status.progressing");
    const priorityIcon = cardQueries.getByLabelText("localTask.fields.priority: localTask.priority.high");
    expect(priorityIcon.nextElementSibling).toBe(statusIcon);
    expect(statusIcon.nextElementSibling?.textContent).toBe("Primary task");
    expect(cardQueries.queryByText("localTask.status.progressing")).toBeNull();
  });

  it("uses valid list roles for virtualized history without ul child violations", () => {
    render(<WorkspaceTasksView workspaceId="workspace-1" />);
    const list = screen.getByRole("list");
    expect(list.tagName).toBe("UL");
    expect(
      within(list)
        .getAllByRole("listitem")
        .every((item) => item.tagName === "LI"),
    ).toBe(true);
    expect(list.querySelector(":scope > div")).toBeNull();
  });

  it("stacks task content above metadata and its FileTree in the workspace detail", () => {
    render(<WorkspaceTasksView workspaceId="workspace-1" />);
    fireEvent.click(screen.getByRole("button", { name: /Primary task/ }));

    const layout = screen.getByTestId("local-task-detail-layout");
    const metadata = screen.getByTestId("local-task-details-sidebar");
    const taskDescription = screen.getByText("Primary details");
    const fileTree = screen.getByTestId("task-context-file-tree");
    expect(getComputedStyle(layout).gridTemplateColumns).toBe("minmax(0, 1fr)");
    expect(getComputedStyle(metadata).position).toBe("static");
    expect(taskDescription.compareDocumentPosition(metadata) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(taskDescription.compareDocumentPosition(fileTree) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("plan.md")).toBeTruthy();
    expect(screen.getByText("notes.md")).toBeTruthy();
    expect(screen.getByText("outcome.md")).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "localTask.fields.status" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "localTask.fields.priority" })).toBeNull();
    expect(screen.getByText("localTask.status.progressing")).toBeTruthy();
    expect(screen.getByText("localTask.priority.high")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "localTask.fields.status" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "localTask.status.new" }));
    expect(commands.updateLocalTask).toHaveBeenCalledWith("task-primary", { status: "new" });
    fireEvent.click(screen.getByRole("button", { name: "localTask.fields.priority" }));
    const lowPriorityOption = screen.getByRole("menuitem", { name: "localTask.priority.low" });
    expect(lowPriorityOption.querySelector("[data-testid='local-task-priority-icon']")).toBeTruthy();
    fireEvent.click(lowPriorityOption);
    expect(commands.updateLocalTask).toHaveBeenCalledWith("task-primary", { priority: "low" });
  });

  it("renders Task Context failure and retries the selected task", () => {
    localTaskStore.setState({
      contextByTaskId: {},
      contextLoadStateByTaskId: { [primaryTask.id]: "error" },
      contextErrorByTaskId: { [primaryTask.id]: "context failed" },
    });
    render(<WorkspaceTasksView workspaceId="workspace-1" />);
    fireEvent.click(screen.getByRole("button", { name: /Primary task/ }));
    expect(screen.getByRole("alert").textContent).toContain("context failed");
    fireEvent.click(screen.getByRole("button", { name: "localTask.actions.retry" }));
    expect(commands.loadLocalTaskContext).toHaveBeenCalledWith("task-primary");
  });

  it("renders loading, empty, and error workspace states", () => {
    localTaskStore.setState({ workspaceLoadState: "loading", workspaceTasks: [] });
    const view = render(<WorkspaceTasksView workspaceId="workspace-1" />);
    expect(screen.getByRole("progressbar")).toBeTruthy();
    act(() => localTaskStore.setState({ workspaceLoadState: "loaded", workspaceLinks: [], workspaceTasks: [] }));
    expect(screen.getByText("localTask.workspace.noLinks")).toBeTruthy();
    act(() => localTaskStore.setState({ workspaceLoadState: "error", workspaceError: "failed" }));
    expect(screen.getByRole("alert").textContent).toContain("failed");
    view.unmount();
  });
});
