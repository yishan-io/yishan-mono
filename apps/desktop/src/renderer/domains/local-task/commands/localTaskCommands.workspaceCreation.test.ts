import { afterEach, describe, expect, it, vi } from "vitest";
import * as daemon from "../daemon/localTaskDaemonClient";
import type { LocalTask, LocalTaskWorkspaceLink } from "../localTaskTypes";
import { localTaskStore } from "../state/localTaskStore";
import { createAndLinkLocalTask, openLocalTaskContextDocument } from "./localTaskCommands";

const openEntryInExternalApp = vi.hoisted(() => vi.fn(async () => ({ ok: true as const })));
vi.mock("@renderer/domains/files", () => ({
  SYSTEM_DEFAULT_APP_ID: "system-default",
  openEntryInExternalApp,
}));
vi.mock("@renderer/domains/project", () => ({
  projectStore: { getState: () => ({ lastUsedExternalAppId: undefined }) },
}));
vi.mock("../daemon/localTaskDaemonClient", () => ({
  createLocalTask: vi.fn(),
  getLocalTask: vi.fn(),
  listLocalTasks: vi.fn(),
  searchLocalTasks: vi.fn(),
  updateLocalTask: vi.fn(),
  getLocalTaskContext: vi.fn(),
  linkLocalTaskWorkspace: vi.fn(),
  unlinkLocalTaskWorkspace: vi.fn(),
  setPrimaryLocalTask: vi.fn(),
  updateLocalTaskLinkStatus: vi.fn(),
  listLocalTaskWorkspaceLinks: vi.fn(),
  listLocalTaskLinks: vi.fn(),
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
};
const link: LocalTaskWorkspaceLink = {
  id: "link-1",
  localTaskId: "task-1",
  workspaceId: "workspace-1",
  role: "primary",
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
  it("creates and links a workspace task with the requested role", async () => {
    vi.mocked(daemon.createLocalTask).mockResolvedValue(task);
    vi.mocked(daemon.linkLocalTaskWorkspace).mockResolvedValue(link);
    vi.mocked(daemon.listLocalTasks).mockResolvedValue([task]);
    vi.mocked(daemon.listLocalTaskWorkspaceLinks).mockResolvedValue([link]);
    localTaskStore.setState({ selectedWorkspaceId: "workspace-1" });

    const result = await createAndLinkLocalTask({ title: "Task" }, "workspace-1", "primary");

    expect(result).toEqual({ status: "linked", task });

    expect(daemon.createLocalTask).toHaveBeenCalledWith({ title: "Task" });
    expect(daemon.linkLocalTaskWorkspace).toHaveBeenCalledWith("task-1", "workspace-1", "primary");
  });

  it("retains the created task when linking fails", async () => {
    vi.mocked(daemon.createLocalTask).mockResolvedValue(task);
    vi.mocked(daemon.linkLocalTaskWorkspace).mockRejectedValue(new Error("link failed"));

    const result = await createAndLinkLocalTask({ title: "Task" }, "workspace-1", "related");

    expect(result).toEqual({ status: "created", task, linkError: "link failed" });
    expect(localTaskStore.getState().taskById[task.id]).toEqual(task);
    expect(daemon.createLocalTask).toHaveBeenCalledTimes(1);
  });

  it("opens the exact returned context document in the system default app", async () => {
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

    await openLocalTaskContextDocument("task-1", "plan");

    expect(openEntryInExternalApp).toHaveBeenCalledWith({
      workspaceWorktreePath: "/contexts/task-1/plan.md",
      appId: "system-default",
    });
  });
});
