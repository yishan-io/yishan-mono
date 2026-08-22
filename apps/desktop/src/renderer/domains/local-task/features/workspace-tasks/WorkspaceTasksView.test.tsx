// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localTaskStore } from "../../state/localTaskStore";
import { WorkspaceTasksView } from "./WorkspaceTasksView";

const commands = vi.hoisted(() => ({
  loadLocalTask: vi.fn(async () => undefined),
  loadLocalTaskContext: vi.fn(async () => undefined),
  loadLocalTaskLinkCandidates: vi.fn(async () => undefined),
  refreshSelectedWorkspaceTasks: vi.fn(async () => undefined),
  linkLocalTaskWorkspace: vi.fn(),
  createAndLinkLocalTask: vi.fn(),
  openLocalTaskContextDocument: vi.fn(async () => undefined),
  selectWorkspaceLocalTask: vi.fn(),
  setPrimaryLocalTask: vi.fn(async () => undefined),
  unlinkLocalTaskWorkspace: vi.fn(),
  updateLocalTask: vi.fn(async () => undefined),
  updateLocalTaskLinkStatus: vi.fn(async () => undefined),
}));
vi.mock("../../commands/localTaskCommands", () => commands);
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { title?: string; taskId?: string; error?: string }) =>
      values ? `${key} ${values.title ?? ""} ${values.taskId ?? ""} ${values.error ?? ""}` : key,
  }),
}));
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 128,
    getVirtualItems: () =>
      Array.from({ length: Math.min(count, 8) }, (_, index) => ({ index, key: index, start: index * 128, size: 128 })),
  }),
}));

const primaryTask = {
  id: "task-primary",
  projectId: null,
  title: "Primary task",
  description: "Primary details",
  status: "active" as const,
  priority: "high" as const,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  completedAt: null,
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
  role: "primary" as const,
  status: "active" as const,
  linkedAt: "2026-01-01",
  unlinkedAt: null,
};
const relatedLink = {
  id: "link-related",
  localTaskId: relatedTask.id,
  workspaceId: "workspace-1",
  role: "related" as const,
  status: "active" as const,
  linkedAt: "2026-01-01",
  unlinkedAt: null,
};
const initialState = localTaskStore.getState();

describe("WorkspaceTasksView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    commands.createAndLinkLocalTask.mockResolvedValue({ status: "linked", task: primaryTask });
    commands.linkLocalTaskWorkspace.mockResolvedValue(undefined);
    commands.setPrimaryLocalTask.mockResolvedValue(undefined);
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
      contextLoadStateByTaskId: { [primaryTask.id]: "loaded" },
      contextByTaskId: {
        [primaryTask.id]: {
          directory: "/contexts/task-primary",
          planPath: "/contexts/task-primary/plan.md",
          notesPath: "/contexts/task-primary/notes.md",
          outcomePath: "/contexts/task-primary/outcome.md",
        },
      },
    });
  });
  afterEach(() => {
    cleanup();
    localTaskStore.setState(initialState, true);
  });

  it("selects related rows for details and confirms unlink before mutation", () => {
    render(<WorkspaceTasksView workspaceId="workspace-1" />);
    const relatedSelection = screen.getByRole("button", { name: /Related task/ });
    expect(relatedSelection.tagName).toBe("BUTTON");
    fireEvent.click(relatedSelection);
    expect(commands.selectWorkspaceLocalTask).toHaveBeenCalledWith("task-related");
    expect(screen.getByText("Related details")).toBeTruthy();
    expect(screen.getByText("localTask.fields.status: localTask.status.active")).toBeTruthy();
    expect(screen.getByText("localTask.fields.priority: localTask.priority.medium")).toBeTruthy();

    const relatedCard = relatedSelection.closest(".MuiPaper-root");
    expect(relatedCard).toBeTruthy();
    if (!relatedCard) return;
    fireEvent.click(within(relatedCard as HTMLElement).getByRole("button", { name: "localTask.actions.setPrimary" }));
    expect(commands.setPrimaryLocalTask).toHaveBeenCalledWith("task-related", "workspace-1");
    fireEvent.click(within(relatedCard as HTMLElement).getByRole("button", { name: "localTask.actions.unlink" }));
    expect(commands.unlinkLocalTaskWorkspace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "localTask.actions.unlink" }));
    expect(commands.unlinkLocalTaskWorkspace).toHaveBeenCalledWith("link-related");
  });

  it("creates and links a Local Task to the current workspace", async () => {
    render(<WorkspaceTasksView workspaceId="workspace-1" />);
    fireEvent.click(screen.getByRole("button", { name: "localTask.actions.createLocal" }));
    const titleInput = screen.getByRole("textbox", { name: "localTask.fields.title" });
    fireEvent.change(titleInput, { target: { value: "Workspace task" } });
    const form = titleInput.closest("form");
    expect(form).toBeTruthy();
    if (!form) return;
    fireEvent.submit(form);
    await waitFor(() =>
      expect(commands.createAndLinkLocalTask).toHaveBeenCalledWith(
        { projectId: undefined, title: "Workspace task", description: "", priority: "medium" },
        "workspace-1",
        "related",
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
    fireEvent.click(screen.getByRole("button", { name: "localTask.actions.createLocal" }));
    const titleInput = screen.getByRole("textbox", { name: "localTask.fields.title" });
    fireEvent.change(titleInput, { target: { value: "Created task" } });
    const form = titleInput.closest("form");
    expect(form).toBeTruthy();
    if (!form) return;

    fireEvent.submit(form);
    expect((await screen.findByRole("alert")).textContent).toContain("task-created");
    expect(screen.getByRole("alert").textContent).toContain("link failed");
    fireEvent.submit(form);

    await waitFor(() =>
      expect(commands.linkLocalTaskWorkspace).toHaveBeenCalledWith("task-created", "workspace-1", "related"),
    );
    expect(commands.createAndLinkLocalTask).toHaveBeenCalledTimes(1);
  });

  it("uses dedicated link candidates and reports link failures inside the dialog", async () => {
    const availableTask = { ...relatedTask, id: "task-available", title: "Available task" };
    localTaskStore.setState({ linkCandidateTasks: [availableTask] });
    commands.linkLocalTaskWorkspace.mockRejectedValueOnce(new Error("link dialog failed"));
    render(<WorkspaceTasksView workspaceId="workspace-1" />);
    fireEvent.click(screen.getByRole("button", { name: "localTask.actions.link" }));
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
      hubFilters: { status: "paused" },
      hubSearchQuery: "keep me",
      linkCandidateWorkspaceId: null,
      linkCandidateTasks: [],
      linkCandidateLoadState: "idle",
      linkCandidateError: null,
    });
    render(<WorkspaceTasksView workspaceId="workspace-1" />);
    fireEvent.click(screen.getByRole("button", { name: "localTask.actions.link" }));

    expect(screen.getByText("localTask.link.title")).toBeTruthy();
    expect(screen.getByText("localTask.link.loadingCandidates")).toBeTruthy();
    expect(localTaskStore.getState()).toMatchObject({ hubFilters: { status: "paused" }, hubSearchQuery: "keep me" });
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
    fireEvent.click(screen.getByRole("button", { name: "localTask.actions.link" }));
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
    fireEvent.click(screen.getByRole("button", { name: "localTask.actions.link" }));
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
    firstHistoryRow.focus();
    await userEvent.keyboard("{Enter}");
    expect(commands.selectWorkspaceLocalTask).toHaveBeenCalledWith("task-0");
    expect(screen.queryByText("History 59")).toBeNull();
    expect(screen.getAllByRole("button", { name: /History/ }).length).toBeLessThan(60);
  });

  it("loads details only for the selected historical row instead of every mounted history row", () => {
    const historyLinks = Array.from({ length: 20 }, (_, index) => ({
      ...relatedLink,
      id: `history-link-${index}`,
      localTaskId: `history-task-${index}`,
      unlinkedAt: "2026-02-01",
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

  it("supports explicit task pause and link pause interactions", () => {
    render(<WorkspaceTasksView workspaceId="workspace-1" />);
    fireEvent.click(screen.getByRole("button", { name: "localTask.actions.pauseTask" }));
    expect(commands.updateLocalTask).toHaveBeenCalledWith("task-primary", { status: "paused" });

    const primaryCard = screen.getByRole("button", { name: /Primary task/ }).closest(".MuiPaper-root");
    expect(primaryCard).toBeTruthy();
    if (!primaryCard) return;
    fireEvent.click(within(primaryCard as HTMLElement).getByRole("button", { name: "localTask.actions.pauseLink" }));
    expect(commands.updateLocalTaskLinkStatus).toHaveBeenCalledWith("link-primary", "paused");
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

  it("opens the selected Task Context document through the Local Task command", () => {
    render(<WorkspaceTasksView workspaceId="workspace-1" />);
    fireEvent.click(screen.getByRole("button", { name: "plan.md" }));
    expect(commands.openLocalTaskContextDocument).toHaveBeenCalledWith("task-primary", "plan");
  });

  it("surfaces exact document-open failures and retries the same document", async () => {
    commands.openLocalTaskContextDocument
      .mockRejectedValueOnce(new Error("ENOENT: exact missing plan path"))
      .mockResolvedValueOnce(undefined);
    render(<WorkspaceTasksView workspaceId="workspace-1" />);
    fireEvent.click(screen.getByRole("button", { name: "plan.md" }));

    expect((await screen.findByRole("alert")).textContent).toContain("ENOENT: exact missing plan path");
    fireEvent.click(screen.getByRole("button", { name: "localTask.actions.retry" }));
    await waitFor(() => expect(commands.openLocalTaskContextDocument).toHaveBeenCalledTimes(2));
    expect(commands.openLocalTaskContextDocument).toHaveBeenLastCalledWith("task-primary", "plan");
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("renders Task Context failure and retries the selected task", () => {
    localTaskStore.setState({
      contextByTaskId: {},
      contextLoadStateByTaskId: { [primaryTask.id]: "error" },
      contextErrorByTaskId: { [primaryTask.id]: "context failed" },
    });
    render(<WorkspaceTasksView workspaceId="workspace-1" />);
    expect(screen.getByRole("alert").textContent).toContain("context failed");
    expect((screen.getByRole("button", { name: "plan.md" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "localTask.actions.retry" }));
    expect(commands.loadLocalTaskContext).toHaveBeenCalledWith("task-primary");
  });

  it("renders loading, empty, and error workspace states", () => {
    localTaskStore.setState({ workspaceLoadState: "loading" });
    const view = render(<WorkspaceTasksView workspaceId="workspace-1" />);
    expect(screen.getByRole("progressbar")).toBeTruthy();
    act(() => localTaskStore.setState({ workspaceLoadState: "loaded", workspaceLinks: [], workspaceTasks: [] }));
    expect(screen.getByText("localTask.workspace.noPrimary")).toBeTruthy();
    act(() => localTaskStore.setState({ workspaceLoadState: "error", workspaceError: "failed" }));
    expect(screen.getByRole("alert").textContent).toContain("failed");
    view.unmount();
  });
});
