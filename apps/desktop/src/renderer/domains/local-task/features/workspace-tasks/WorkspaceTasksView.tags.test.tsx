// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  loadLocalTaskTagSuggestions: vi.fn(async () => undefined),
  loadLocalTaskLinkCandidates: vi.fn(async () => undefined),
  refreshSelectedWorkspaceTasks: vi.fn(async () => undefined),
  linkLocalTaskWorkspace: vi.fn(),
  createAndLinkLocalTask: vi.fn(),
  openLocalTaskContextInFileTree: vi.fn(),
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
  projectId: null,
  title: "Primary task",
  description: "Primary details",
  status: "active" as const,
  priority: "high" as const,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  completedAt: null,
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

  it("removes a detail tag through its selector and disables selector changes during mutations", async () => {
    const taggedTask = { ...primaryTask, tagRefs: [{ id: "tag-backend", name: "backend" }] };
    localTaskStore.setState({
      workspaceTasks: [taggedTask, relatedTask],
      taskById: { [taggedTask.id]: taggedTask, [relatedTask.id]: relatedTask },
      tagCatalog: [{ id: "tag-backend", key: "backend", name: "backend", aliases: ["backend"], color: null }],
    });
    render(<WorkspaceTasksView workspaceId="workspace-1" />);
    fireEvent.click(screen.getByRole("button", { name: /Primary task/ }));
    const metadata = screen.getByTestId("local-task-metadata");
    expect(metadata.contains(screen.getByTestId("local-task-status-icon"))).toBe(true);
    expect(metadata.contains(screen.getByText("backend"))).toBe(true);
    // Open the tag selector popover by clicking the add button.
    fireEvent.click(screen.getByRole("button", { name: "localTask.tags.add" }));
    // LocalTaskTagSelector renders a listbox; click the "backend" option to deselect it.
    fireEvent.click(await screen.findByRole("option", { name: "backend" }));

    await waitFor(() => expect(commands.updateLocalTask).toHaveBeenCalledWith("task-primary", { tagIds: [] }));

    act(() => localTaskStore.setState({ isMutationLoading: true }));
    expect((screen.getByRole("button", { name: "localTask.tags.add", hidden: true }) as HTMLButtonElement).disabled).toBe(true);
    expect(commands.updateLocalTask).toHaveBeenCalledTimes(1);
  });

  it("propagates catalog color tokens to workspace rows and detail editor chips", () => {
    const taggedTask = { ...primaryTask, tagRefs: [{ id: "tag-backend", name: "backend" }] };
    localTaskStore.setState({
      workspaceTasks: [taggedTask, relatedTask],
      taskById: { [taggedTask.id]: taggedTask, [relatedTask.id]: relatedTask },
      tagCatalog: [{ id: "tag-backend", key: "backend", name: "backend", aliases: ["backend"], color: "#14B8A6" }],
    });
    render(<WorkspaceTasksView workspaceId="workspace-1" />);

    const rowChip = screen.getByText("backend").closest(".MuiChip-root");
    expect(rowChip?.querySelector("[data-tag-chip-dot]")).toBeTruthy();
    expect(rowChip?.querySelector(".MuiChip-icon")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Primary task/ }));
    const detailChip = within(screen.getByTestId("local-task-metadata")).getByText("backend").closest(".MuiChip-root");
    expect(detailChip?.querySelector("[data-tag-chip-dot]")).toBeTruthy();
    expect(detailChip?.querySelector(".MuiChip-icon")).toBeNull();
  });

  it("shows full workspace row labels and leaves the overflow count unadorned", () => {
    const longTag = "first".repeat(6);
    const taggedTask = {
      ...primaryTask,
      tagRefs: [
        { id: "tag-long", name: longTag },
        { id: "tag-second", name: "second" },
        { id: "tag-third", name: "third" },
      ],
    };
    localTaskStore.setState({
      workspaceTasks: [taggedTask, relatedTask],
      taskById: { [taggedTask.id]: taggedTask, [relatedTask.id]: relatedTask },
    });
    render(<WorkspaceTasksView workspaceId="workspace-1" />);

    const firstTagChip = screen.getByText(longTag).closest(".MuiChip-root");
    expect(getComputedStyle(firstTagChip as Element).minHeight).toBe("18px");
    expect(getComputedStyle(firstTagChip as Element).maxWidth).not.toBe("88px");
    expect(firstTagChip?.querySelector("[data-tag-chip-dot]")).toBeTruthy();
    const overflowChip = screen.getByText("+1").closest(".MuiChip-root");
    expect(overflowChip?.querySelector("svg")).toBeNull();
  });
});
