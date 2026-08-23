// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localTaskStore } from "../../state/localTaskStore";
import { WorkspaceTasksView } from "./WorkspaceTasksView";

const commands = vi.hoisted(() => ({
  loadLocalTask: vi.fn(async () => undefined),
  loadLocalTaskContext: vi.fn(async () => undefined),
  loadLocalTaskTagSuggestions: vi.fn(async () => undefined),
  loadLocalTaskLinkCandidates: vi.fn(async () => undefined),
  refreshSelectedWorkspaceTasks: vi.fn(async () => undefined),
  linkLocalTaskWorkspace: vi.fn(),
  createAndLinkLocalTask: vi.fn(),
  openLocalTaskContextInFileTree: vi.fn(),
  selectWorkspaceLocalTask: vi.fn(),
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
  tags: [],
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
  status: "active" as const,
  linkedAt: "2026-01-01",
  unlinkedAt: null,
};
const relatedLink = {
  id: "link-related",
  localTaskId: relatedTask.id,
  workspaceId: "workspace-1",
  status: "active" as const,
  linkedAt: "2026-01-01",
  unlinkedAt: null,
};
const initialState = localTaskStore.getState();

describe("WorkspaceTasksView tags", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("removes a detail tag through the update command and disables controls during mutations", async () => {
    const taggedTask = { ...primaryTask, tags: ["backend"] };
    localTaskStore.setState({
      workspaceTasks: [taggedTask, relatedTask],
      taskById: { [taggedTask.id]: taggedTask, [relatedTask.id]: relatedTask },
    });
    render(<WorkspaceTasksView workspaceId="workspace-1" />);
    fireEvent.click(screen.getByRole("button", { name: /Primary task/ }));
    const metadata = screen.getByTestId("local-task-metadata");
    expect(metadata.contains(screen.getByTestId("local-task-status-icon"))).toBe(true);
    expect(metadata.contains(screen.getByText("backend"))).toBe(true);
    expect(metadata.contains(screen.getByRole("button", { name: "localTask.tags.add" }))).toBe(true);
    fireEvent.click(screen.getByLabelText("localTask.tags.delete"));

    await waitFor(() => expect(commands.updateLocalTask).toHaveBeenCalledWith("task-primary", { tags: [] }));
    act(() => localTaskStore.setState({ isMutationLoading: true }));
    expect((screen.getByRole("button", { name: "localTask.tags.add" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps the workspace row overflow count outside the clipped visible-tag region", () => {
    const taggedTask = { ...primaryTask, tags: ["first", "second", "third"] };
    localTaskStore.setState({
      workspaceTasks: [taggedTask, relatedTask],
      taskById: { [taggedTask.id]: taggedTask, [relatedTask.id]: relatedTask },
    });
    render(<WorkspaceTasksView workspaceId="workspace-1" />);

    const firstTagChip = screen.getByText("first").closest(".MuiChip-root");
    expect(getComputedStyle(firstTagChip as Element).height).toBe("18px");
    const taskCard = firstTagChip?.closest(".MuiPaper-root");
    expect(taskCard).toBeTruthy();
    if (!taskCard) return;
    const statusChip = within(taskCard as HTMLElement).getByText("localTask.status.active");
    const priorityChip = within(taskCard as HTMLElement).getByText("localTask.priority.high");
    expect(statusChip.compareDocumentPosition(priorityChip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(priorityChip.compareDocumentPosition(firstTagChip as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(getComputedStyle(firstTagChip as Element).flexGrow).toBe("0");
    const overflowChip = screen.getByText("+1").closest(".MuiChip-root");
    expect(overflowChip).toBeTruthy();
    expect(getComputedStyle(overflowChip?.previousElementSibling as Element).overflow).toBe("hidden");
    expect(getComputedStyle(overflowChip?.parentElement as Element).overflow).toBe("visible");
    expect(getComputedStyle(overflowChip?.closest(".MuiPaper-root") as Element).overflow).toBe("visible");
  });
});
