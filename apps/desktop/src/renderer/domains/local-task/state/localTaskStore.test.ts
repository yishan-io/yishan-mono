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

afterEach(() => localTaskStore.setState(initialState, true));

describe("localTaskStore", () => {
  it("tracks the selected workspace task and defaults details to the first daemon-ordered link", () => {
    const relatedTask = { ...task, id: "task-2", title: "Second" };
    const relatedLink = { ...link, id: "link-2", localTaskId: "task-2" };
    const requestId = localTaskStore.getState().beginWorkspaceLoad("workspace-1");
    localTaskStore.getState().setWorkspaceData(requestId, "workspace-1", [task, relatedTask], [link, relatedLink]);

    expect(localTaskStore.getState().selectedWorkspaceTaskId).toBe("task-1");
    localTaskStore.getState().selectWorkspaceTask("task-2");
    expect(localTaskStore.getState().selectedWorkspaceTaskId).toBe("task-2");
  });

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

  it("reconciles hub tag ID filters after tag merges and deletions", () => {
    const actions = localTaskStore.getState();
    actions.setHubFilters({ tagIds: ["tag-source", "tag-other", "tag-target", "tag-source"] });

    actions.reconcileHubTagFilter("tag-source", "tag-target");
    expect(localTaskStore.getState().hubFilters).toEqual({ tagIds: ["tag-target", "tag-other"] });

    actions.reconcileHubTagFilter("tag-target");
    expect(localTaskStore.getState().hubFilters).toEqual({ tagIds: ["tag-other"] });
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

  it("stores daemon tag suggestions and retains values when a refresh fails", () => {
    let requestId = localTaskStore.getState().beginTagCatalogLoad();
    localTaskStore.getState().setTagCatalog(requestId, [
      { id: "tag-fixture", key: "desktop", name: "desktop", aliases: ["desktop"], color: null },
      { id: "tag-fixture", key: "cli", name: "cli", aliases: ["cli"], color: null },
    ]);
    requestId = localTaskStore.getState().beginTagCatalogLoad();
    localTaskStore.getState().setTagCatalogError(requestId, "offline");

    expect(localTaskStore.getState()).toMatchObject({
      tagSuggestions: ["desktop", "cli"],
      tagSuggestionsLoadState: "error",
      tagSuggestionsError: "offline",
    });
  });

  it("ignores stale tag suggestion responses", () => {
    const staleRequestId = localTaskStore.getState().beginTagCatalogLoad();
    const currentRequestId = localTaskStore.getState().beginTagCatalogLoad();
    localTaskStore
      .getState()
      .setTagCatalog(staleRequestId, [
        { id: "tag-fixture", key: "stale", name: "stale", aliases: ["stale"], color: null },
      ]);
    localTaskStore
      .getState()
      .setTagCatalog(currentRequestId, [
        { id: "tag-fixture", key: "current", name: "current", aliases: ["current"], color: null },
      ]);

    expect(localTaskStore.getState().tagSuggestions).toEqual(["current"]);
  });

  it("stores Local Task detail projections and ignores stale responses", () => {
    const staleRequestId = localTaskStore.getState().beginDetailsLoad("task-1");
    const requestId = localTaskStore.getState().beginDetailsLoad("task-1");
    const details = {
      task,
      project: { id: "project-1", name: "Project One", icon: "rocket", color: "#3B82F6" },
      workspaces: [
        {
          id: "workspace-1",
          projectId: "project-1",
          name: "Workspace One",
          kind: "local" as const,
          status: "active" as const,
        },
      ],
    };
    localTaskStore.getState().setDetails(staleRequestId, "task-1", { ...details, project: null });
    localTaskStore.getState().setDetails(requestId, "task-1", details);

    expect(localTaskStore.getState().detailsByTaskId["task-1"]).toEqual(details);
    expect(localTaskStore.getState().detailsLoadStateByTaskId["task-1"]).toBe("loaded");
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

it("stores catalog entries and derives autocomplete names without normalizing daemon keys", () => {
  const requestId = localTaskStore.getState().beginTagCatalogLoad();
  localTaskStore.getState().setTagCatalog(requestId, [
    { id: "tag-fixture", key: "café", name: "Café", aliases: ["Café"], color: "#14B8A6" },
    { id: "tag-fixture", key: "backend", name: "Backend", aliases: ["Backend"], color: null },
  ]);

  expect(localTaskStore.getState().tagCatalog).toEqual([
    { id: "tag-fixture", key: "café", name: "Café", aliases: ["Café"], color: "#14B8A6" },
    { id: "tag-fixture", key: "backend", name: "Backend", aliases: ["Backend"], color: null },
  ]);
  expect(localTaskStore.getState().tagSuggestions).toEqual(["Café", "Backend"]);
});
