import { projectStore } from "@renderer/domains/project";
import { sessionStore } from "@renderer/domains/session";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LocalTask } from "../localTaskTypes";
import { createWorkspaceForLocalTask } from "./localTaskWorkspaceCommands";

const workspaceMocks = vi.hoisted(() => ({
  createWorkspace: vi.fn(),
}));
vi.mock("@renderer/domains/workspace", () => workspaceMocks);

const task: LocalTask = {
  id: "task-1",
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
      name: "ship-task-hub",
      sourceBranch: "develop",
      targetBranch: "task/ship-task-hub",
      nodeId: "node-local",
      localTaskId: "task-1",
      taskRun: {
        agentKind: "pi",
        prompt: "Implement this Local Task.\n\nTitle: Ship Task Hub\n\nDescription:\nDesktop UX",
      },
    });
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
