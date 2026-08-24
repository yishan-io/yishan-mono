import { afterEach, describe, expect, it, vi } from "vitest";
import * as daemon from "../daemon/localTaskDaemonClient";
import type { LocalTask, LocalTaskWorkspaceLink } from "../localTaskTypes";
import { localTaskStore } from "../state/localTaskStore";
import { createAndLinkLocalTask, openLocalTaskContextInFileTree } from "./localTaskCommands";

const selectFolderInFileTree = vi.hoisted(() => vi.fn());
vi.mock("@renderer/domains/workspace", () => ({ selectFolderInFileTree }));
vi.mock("../daemon/localTaskDaemonClient", () => ({
  localTaskClient: {
    create: vi.fn(),
    get: vi.fn(),
    list: vi.fn(),
    search: vi.fn(),
    listTags: vi.fn(),
    listTagCatalog: vi.fn(),
    updateTagColor: vi.fn(),
    createTag: vi.fn(),
    renameTag: vi.fn(),
    deleteTag: vi.fn(),
    update: vi.fn(),
    getContext: vi.fn(),
    linkWorkspace: vi.fn(),
    unlinkWorkspace: vi.fn(),
    updateLinkStatus: vi.fn(),
    listWorkspaceLinks: vi.fn(),
    listTaskLinks: vi.fn(),
  },
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
  tagRefs: [],
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
    vi.mocked(daemon.localTaskClient.create).mockResolvedValue(task);
    vi.mocked(daemon.localTaskClient.linkWorkspace).mockResolvedValue(link);
    vi.mocked(daemon.localTaskClient.list).mockResolvedValue([task]);
    vi.mocked(daemon.localTaskClient.listWorkspaceLinks).mockResolvedValue([link]);
    vi.mocked(daemon.localTaskClient.listTagCatalog).mockResolvedValue([
      { id: "tag-fixture", key: "desktop", name: "Desktop", aliases: ["Desktop"], color: "#3B82F6" },
    ]);
    localTaskStore.setState({ selectedWorkspaceId: "workspace-1" });

    const result = await createAndLinkLocalTask({ title: "Task" }, "workspace-1");

    expect(result).toEqual({ status: "linked", task });

    expect(daemon.localTaskClient.create).toHaveBeenCalledWith({ title: "Task" });
    expect(daemon.localTaskClient.linkWorkspace).toHaveBeenCalledWith("task-1", "workspace-1");
    expect(daemon.localTaskClient.listTagCatalog).toHaveBeenCalledOnce();
    expect(localTaskStore.getState().tagSuggestions).toEqual(["Desktop"]);
  });

  it("retains the created task when linking fails", async () => {
    vi.mocked(daemon.localTaskClient.create).mockResolvedValue(task);
    vi.mocked(daemon.localTaskClient.linkWorkspace).mockRejectedValue(new Error("link failed"));
    vi.mocked(daemon.localTaskClient.listTagCatalog).mockResolvedValue([
      { id: "tag-fixture", key: "cli", name: "CLI", aliases: ["CLI"], color: "#22C55E" },
    ]);

    const result = await createAndLinkLocalTask({ title: "Task" }, "workspace-1");

    expect(result).toEqual({ status: "created", task, linkError: "link failed" });
    expect(localTaskStore.getState().taskById[task.id]).toEqual(task);
    expect(daemon.localTaskClient.create).toHaveBeenCalledTimes(1);
    expect(daemon.localTaskClient.listTagCatalog).toHaveBeenCalledOnce();
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
