import { afterEach, describe, expect, it, vi } from "vitest";
import * as daemon from "../daemon/localTaskDaemonClient";
import type { LocalTask, LocalTaskWorkspaceLink } from "../localTaskTypes";
import { localTaskStore } from "../state/localTaskStore";
import { createAndLinkLocalTask, openLocalTaskContextInFileTree } from "./localTaskCommands";

const selectFolderInFileTree = vi.hoisted(() => vi.fn());
vi.mock("@renderer/domains/workspace", () => ({ selectFolderInFileTree }));
vi.mock("../daemon/localTaskDaemonClient", () => ({
  createLocalTask: vi.fn(),
  getLocalTask: vi.fn(),
  listLocalTasks: vi.fn(),
  searchLocalTasks: vi.fn(),
  updateLocalTask: vi.fn(),
  getLocalTaskContext: vi.fn(),
  linkLocalTaskWorkspace: vi.fn(),
  unlinkLocalTaskWorkspace: vi.fn(),
  updateLocalTaskLinkStatus: vi.fn(),
  listLocalTaskWorkspaceLinks: vi.fn(),
  listLocalTaskLinks: vi.fn(),
  listLocalTaskTagCatalog: vi.fn(),
  listLocalTaskTags: vi.fn(),
}));

const task: LocalTask = {
  id: "task-1",
  projectId: null,
  title: "Task",
  description: "",
  status: "active",
  priority: "medium",
  createdAt: "created",
  updatedAt: "updated",
  completedAt: null,
  tags: [],
};
const link: LocalTaskWorkspaceLink = {
  id: "link-1",
  localTaskId: "task-1",
  workspaceId: "workspace-1",
  status: "active",
  linkedAt: "linked",
  unlinkedAt: null,
};
const initialState = localTaskStore.getState();

afterEach(() => {
  localTaskStore.setState(initialState, true);
  vi.clearAllMocks();
});

describe("Local Task workspace creation and document commands", () => {
  it("creates and links a workspace task", async () => {
    vi.mocked(daemon.createLocalTask).mockResolvedValue(task);
    vi.mocked(daemon.linkLocalTaskWorkspace).mockResolvedValue(link);
    vi.mocked(daemon.listLocalTasks).mockResolvedValue([task]);
    vi.mocked(daemon.listLocalTaskWorkspaceLinks).mockResolvedValue([link]);
    vi.mocked(daemon.listLocalTaskTagCatalog).mockResolvedValue([
      { key: "desktop", name: "Desktop", aliases: ["Desktop"], color: "blue", customColor: null },
    ]);
    localTaskStore.setState({ selectedWorkspaceId: "workspace-1" });

    const result = await createAndLinkLocalTask({ title: "Task" }, "workspace-1");

    expect(result).toEqual({ status: "linked", task });

    expect(daemon.createLocalTask).toHaveBeenCalledWith({ title: "Task" });
    expect(daemon.linkLocalTaskWorkspace).toHaveBeenCalledWith("task-1", "workspace-1");
    expect(daemon.listLocalTaskTagCatalog).toHaveBeenCalledOnce();
    expect(localTaskStore.getState().tagSuggestions).toEqual(["Desktop"]);
  });

  it("retains the created task when linking fails", async () => {
    vi.mocked(daemon.createLocalTask).mockResolvedValue(task);
    vi.mocked(daemon.linkLocalTaskWorkspace).mockRejectedValue(new Error("link failed"));
    vi.mocked(daemon.listLocalTaskTagCatalog).mockResolvedValue([
      { key: "cli", name: "CLI", aliases: ["CLI"], color: "green", customColor: null },
    ]);

    const result = await createAndLinkLocalTask({ title: "Task" }, "workspace-1");

    expect(result).toEqual({ status: "created", task, linkError: "link failed" });
    expect(localTaskStore.getState().taskById[task.id]).toEqual(task);
    expect(daemon.createLocalTask).toHaveBeenCalledTimes(1);
    expect(daemon.listLocalTaskTagCatalog).toHaveBeenCalledOnce();
    expect(localTaskStore.getState().tagSuggestions).toEqual(["CLI"]);
  });

  it("opens the Task Context directory in the workspace file tree", () => {
    localTaskStore.setState({
      contextByTaskId: {
        "task-1": {
          directory: "/contexts/task-1",
          planPath: "/contexts/task-1/plan.md",
          notesPath: "/contexts/task-1/notes.md",
          outcomePath: "/contexts/task-1/outcome.md",
        },
      },
    });

    openLocalTaskContextInFileTree("task-1");

    expect(selectFolderInFileTree).toHaveBeenCalledWith(".my-context/task-context/task-1");
  });
});
