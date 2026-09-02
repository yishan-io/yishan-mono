import { projectStore } from "@renderer/domains/project";
import { sessionStore } from "@renderer/domains/session";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DaemonLocalTaskClient } from "../daemon/localTaskDaemonClient";
import type { LocalTask } from "../localTaskTypes";
import { createWorkspaceForLocalTask } from "./localTaskWorkspaceCommands";

const workspaceMocks = vi.hoisted(() => ({
  createWorkspace: vi.fn(),
}));
vi.mock("@renderer/domains/workspace", () => workspaceMocks);

const task: LocalTask = {
  id: "task-1",
  key: "TASK-1",
  projectId: null,
  title: "Task",
  description: "",
  status: "progressing",
  priority: "medium",
  createdAt: "created",
  updatedAt: "updated",
  completedAt: null,
  hasActiveWorkspace: false,
  tags: [],
  tagRefs: [],
};
const initialProjectState = projectStore.getState();
const initialSessionState = sessionStore.getState();

afterEach(() => {
  projectStore.setState(initialProjectState, true);
  sessionStore.setState(initialSessionState, true);
  vi.clearAllMocks();
});

describe("Local Task workspace commands", () => {
  it("creates a daemon-owned linked workspace and starts Pi for a git project task", async () => {
    const projectTask = { ...task, projectId: "project-1", title: "Ship Task Hub", description: "Desktop UX" };
    projectStore.setState({
      projects: [{ id: "project-1", name: "Desktop", defaultBranch: "develop", sourceType: "git" }],
    });
    sessionStore.setState({ daemonId: "node-local" });
    workspaceMocks.createWorkspace.mockResolvedValue("workspace-created");

    await createWorkspaceForLocalTask(projectTask);

    expect(workspaceMocks.createWorkspace).toHaveBeenCalledWith({
      projectId: "project-1",
      name: "TASK-1-ship-task-hub",
      sourceBranch: "develop",
      targetBranch: "task/TASK-1-ship-task-hub",
      nodeId: "node-local",
      localTaskId: "task-1",
      taskRun: {
        agentKind: "pi",
        prompt: "Implement this Local Task.\n\nTitle: Ship Task Hub\n\nDescription:\nDesktop UX",
      },
    });
  });

  it("launches a workspace when a non-null daemon payload key survives desktop parsing", async () => {
    projectStore.setState({
      projects: [{ id: "project-1", name: "Desktop", defaultBranch: "main", sourceType: "git" }],
    });
    workspaceMocks.createWorkspace.mockResolvedValue("workspace-created");
    const daemonClient = new DaemonLocalTaskClient(
      vi.fn(async () => ({ ...task, key: "TASK-42", projectId: "project-1" })),
    );

    const parsedTask = await daemonClient.get("task-1");
    await createWorkspaceForLocalTask(parsedTask);

    expect(workspaceMocks.createWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ name: "TASK-42-task", targetBranch: "task/TASK-42-task" }),
    );
  });

  it("uses distinct keys for workspace names when task titles match", async () => {
    projectStore.setState({
      projects: [{ id: "project-1", name: "Desktop", defaultBranch: "main", sourceType: "git" }],
    });
    workspaceMocks.createWorkspace.mockResolvedValue("workspace-created");

    await createWorkspaceForLocalTask({ ...task, projectId: "project-1", title: "Duplicate title", key: "DESK-41" });
    await createWorkspaceForLocalTask({
      ...task,
      id: "task-2",
      projectId: "project-1",
      title: "Duplicate title",
      key: "DESK-42",
    });

    expect(workspaceMocks.createWorkspace).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ name: "DESK-41-duplicate-title", targetBranch: "task/DESK-41-duplicate-title" }),
    );
    expect(workspaceMocks.createWorkspace).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ name: "DESK-42-duplicate-title", targetBranch: "task/DESK-42-duplicate-title" }),
    );
  });

  it("uses the key-only workspace and branch names when the title has no ASCII slug", async () => {
    projectStore.setState({
      projects: [{ id: "project-1", name: "Desktop", defaultBranch: "main", sourceType: "git" }],
    });
    workspaceMocks.createWorkspace.mockResolvedValue("workspace-created");

    await createWorkspaceForLocalTask({ ...task, projectId: "project-1", key: "DESK-7", title: "中文 !!!" });

    expect(workspaceMocks.createWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ name: "DESK-7", targetBranch: "task/DESK-7" }),
    );
  });

  it("does not launch a workspace while a task key is pending backfill", async () => {
    projectStore.setState({
      projects: [{ id: "project-1", name: "Desktop", defaultBranch: "main", sourceType: "git" }],
    });

    await expect(createWorkspaceForLocalTask({ ...task, projectId: "project-1", key: null })).resolves.toBeUndefined();
    expect(workspaceMocks.createWorkspace).not.toHaveBeenCalled();
  });

  it("coalesces duplicate workspace launches for the same task", async () => {
    const projectTask = { ...task, projectId: "project-1" };
    projectStore.setState({
      projects: [{ id: "project-1", name: "Desktop", defaultBranch: "main", sourceType: "git" }],
    });
    let resolveWorkspace: ((workspaceId: string) => void) | undefined;
    workspaceMocks.createWorkspace.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveWorkspace = resolve;
        }),
    );

    const firstLaunch = createWorkspaceForLocalTask(projectTask);
    const duplicateLaunch = createWorkspaceForLocalTask(projectTask);
    expect(workspaceMocks.createWorkspace).toHaveBeenCalledOnce();

    resolveWorkspace?.("workspace-created");
    await Promise.all([firstLaunch, duplicateLaunch]);
  });
});
