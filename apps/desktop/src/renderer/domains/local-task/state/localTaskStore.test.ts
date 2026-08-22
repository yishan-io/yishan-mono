import { afterEach, describe, expect, it } from "vitest";
import type { LocalTask, LocalTaskWorkspaceLink } from "../localTaskTypes";
import { localTaskStore } from "./localTaskStore";

const initialState = localTaskStore.getState();
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

afterEach(() => localTaskStore.setState(initialState, true));

describe("localTaskStore", () => {
  it("mutates hub filters, results, and active count without I/O", () => {
    const actions = localTaskStore.getState();
    actions.setHubFilters({ status: "paused", priority: "high" });
    actions.setHubSearchQuery("desktop");
    const requestId = actions.beginHubLoad();
    actions.setHubResults(requestId, [task], 4);

    expect(localTaskStore.getState()).toMatchObject({
      hubFilters: { status: "paused", priority: "high" },
      hubSearchQuery: "desktop",
      hubTasks: [task],
      activeTaskCount: 4,
      hubLoadState: "loaded",
      hubError: null,
    });
  });

  it("retains refresh data on errors and stores selected-workspace relationships and context", () => {
    let requestId = localTaskStore.getState().beginHubLoad();
    localTaskStore.getState().setHubResults(requestId, [task], 1);
    requestId = localTaskStore.getState().beginHubLoad();
    localTaskStore.getState().setHubError(requestId, "offline");
    requestId = localTaskStore.getState().beginWorkspaceLoad("workspace-1");
    localTaskStore.getState().setWorkspaceData(requestId, "workspace-1", [task], [link]);
    requestId = localTaskStore.getState().beginContextLoad("task-1");
    localTaskStore.getState().setContext(requestId, "task-1", {
      directory: "/context/task-1",
      planPath: "/context/task-1/plan.md",
      notesPath: "/context/task-1/notes.md",
      outcomePath: "/context/task-1/outcome.md",
    });

    const state = localTaskStore.getState();
    expect(state.hubTasks).toEqual([task]);
    expect(state.hubLoadState).toBe("error");
    expect(state.selectedWorkspaceId).toBe("workspace-1");
    expect(state.workspaceTasks).toEqual([task]);
    expect(state.workspaceLinks).toEqual([link]);
    expect(state.workspaceActiveTaskCount).toBe(1);
    expect(state.contextByTaskId["task-1"]?.planPath).toContain("plan.md");
    expect(state.contextLoadStateByTaskId["task-1"]).toBe("loaded");
  });

  it("upserts a detail entity without changing list projections", () => {
    let requestId = localTaskStore.getState().beginHubLoad();
    localTaskStore.getState().setHubResults(requestId, [task], 1);
    requestId = localTaskStore.getState().beginWorkspaceLoad("workspace-1");
    localTaskStore.getState().setWorkspaceData(requestId, "workspace-1", [task], [link]);

    localTaskStore.getState().upsertTaskEntity({ ...task, status: "completed", title: "Done" });

    expect(localTaskStore.getState().taskById["task-1"]).toMatchObject({ title: "Done", status: "completed" });
    expect(localTaskStore.getState().hubTasks).toEqual([task]);
    expect(localTaskStore.getState().workspaceTasks).toEqual([task]);
  });
});
