import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as daemon from "../daemon/localTaskDaemonClient";
import type { LocalTask, LocalTaskWorkspaceLink } from "../localTaskTypes";
import { localTaskStore } from "../state/localTaskStore";
import {
  createLocalTask,
  linkLocalTaskWorkspace,
  loadLocalTask,
  loadLocalTaskContext,
  loadLocalTaskLinks,
  loadLocalTaskTagSuggestions,
  refreshActiveLocalTaskCount,
  refreshLocalTaskHub,
  refreshSelectedWorkspaceTasks,
  setLocalTaskHubFilters,
  setLocalTaskHubSearchQuery,
  unlinkLocalTaskWorkspace,
  updateLocalTask,
  updateLocalTaskLinkStatus,
  updateLocalTaskTagColor,
} from "./localTaskCommands";

vi.mock("../daemon/localTaskDaemonClient", () => ({
  localTaskClient: {
    create: vi.fn(),
    get: vi.fn(),
    getDetails: vi.fn(),
    list: vi.fn(),
    listProjection: vi.fn(),
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

const initialState = localTaskStore.getState();

function createDeferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void } {
  let resolve: ((value: T) => void) | undefined;
  let reject: ((error: unknown) => void) | undefined;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  if (!resolve || !reject) throw new Error("deferred promise callbacks were not initialized");
  return { promise, resolve, reject };
}
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

beforeEach(() => {
  vi.mocked(daemon.localTaskClient.listProjection).mockResolvedValue({ tasks: [task], projectsById: {}, total: 1 });
});

afterEach(() => {
  localTaskStore.setState(initialState, true);
  vi.clearAllMocks();
});

describe("localTaskCommands", () => {
  it("loads tag suggestions into store-owned state and retains errors", async () => {
    vi.mocked(daemon.localTaskClient.listTagCatalog).mockResolvedValue([
      { id: "tag-fixture", key: "desktop", name: "Desktop", aliases: ["Desktop"], color: "#3B82F6" },
      { id: "tag-fixture", key: "cli", name: "CLI", aliases: ["CLI"], color: null },
    ]);

    await loadLocalTaskTagSuggestions();

    expect(daemon.localTaskClient.listTagCatalog).toHaveBeenCalledWith();
    expect(localTaskStore.getState()).toMatchObject({
      tagCatalog: [
        { id: "tag-fixture", key: "desktop", name: "Desktop", aliases: ["Desktop"], color: "#3B82F6" },
        { id: "tag-fixture", key: "cli", name: "CLI", aliases: ["CLI"], color: null },
      ],
      tagSuggestions: ["Desktop", "CLI"],
      tagSuggestionsLoadState: "loaded",
      tagSuggestionsError: null,
    });

    vi.mocked(daemon.localTaskClient.listTagCatalog).mockRejectedValue(new Error("suggestions unavailable"));
    await loadLocalTaskTagSuggestions();

    expect(localTaskStore.getState()).toMatchObject({
      tagCatalog: [
        { id: "tag-fixture", key: "desktop", name: "Desktop", aliases: ["Desktop"], color: "#3B82F6" },
        { id: "tag-fixture", key: "cli", name: "CLI", aliases: ["CLI"], color: null },
      ],
      tagSuggestions: ["Desktop", "CLI"],
      tagSuggestionsLoadState: "error",
      tagSuggestionsError: "suggestions unavailable",
    });
  });

  it("refreshes the active count without loading the Task Hub projection", async () => {
    vi.mocked(daemon.localTaskClient.list).mockResolvedValue([task, { ...task, id: "task-2" }]);

    await refreshActiveLocalTaskCount();

    expect(daemon.localTaskClient.list).toHaveBeenCalledOnce();
    expect(daemon.localTaskClient.list).toHaveBeenCalledWith({ status: "active" });
    expect(localTaskStore.getState()).toMatchObject({ activeTaskCount: 2, hubLoadState: "idle", hubTasks: [] });
  });

  it("keeps the newer hub-derived count when an older standalone count resolves last", async () => {
    const staleActiveTasks = createDeferred<LocalTask[]>();
    vi.mocked(daemon.localTaskClient.list).mockReturnValue(staleActiveTasks.promise);

    const standaloneRefresh = refreshActiveLocalTaskCount();
    vi.mocked(daemon.localTaskClient.list).mockImplementation(async (filters = {}) =>
      filters.status === "active" ? [task, { ...task, id: "task-2" }] : [task],
    );
    await refreshLocalTaskHub();
    staleActiveTasks.resolve([]);
    await standaloneRefresh;

    expect(localTaskStore.getState().activeTaskCount).toBe(2);
  });

  it("keeps the newer standalone count when an older hub-derived count resolves last", async () => {
    const staleHubActiveTasks = createDeferred<LocalTask[]>();
    vi.mocked(daemon.localTaskClient.list).mockImplementation(async (filters = {}) =>
      filters.status === "active" ? staleHubActiveTasks.promise : [task],
    );

    const hubRefresh = refreshLocalTaskHub();
    vi.mocked(daemon.localTaskClient.list).mockResolvedValue([task, { ...task, id: "task-2" }]);
    await refreshActiveLocalTaskCount();
    staleHubActiveTasks.resolve([]);
    await hubRefresh;

    expect(localTaskStore.getState()).toMatchObject({ activeTaskCount: 2, hubTasks: [task] });
  });

  it("refreshes a filtered hub list and active count", async () => {
    vi.mocked(daemon.localTaskClient.list).mockResolvedValue([task, { ...task, id: "task-2" }]);

    await setLocalTaskHubFilters({ priority: "medium" });

    expect(daemon.localTaskClient.listProjection).toHaveBeenCalledWith({ priority: "medium" }, "");
    expect(daemon.localTaskClient.list).toHaveBeenCalledWith({ status: "active" });
    expect(localTaskStore.getState()).toMatchObject({ hubTasks: [task], activeTaskCount: 2, hubLoadState: "loaded" });
  });

  it("uses metadata search during refresh and preserves filters", async () => {
    vi.mocked(daemon.localTaskClient.list).mockResolvedValue([task]);
    vi.mocked(daemon.localTaskClient.listProjection).mockResolvedValue({
      tasks: [task],
      projectsById: {},
      total: 1,
    });
    localTaskStore.getState().setHubFilters({ projectId: "project-1", status: "paused" });

    await setLocalTaskHubSearchQuery("  desktop  ");
    await refreshLocalTaskHub();

    expect(daemon.localTaskClient.listProjection).toHaveBeenLastCalledWith(
      { projectId: "project-1", status: "paused" },
      "desktop",
    );
    expect(localTaskStore.getState().hubTasks).toEqual([task]);
  });

  it("loads selected-workspace tasks, links, and task context", async () => {
    vi.mocked(daemon.localTaskClient.list).mockResolvedValue([task]);
    vi.mocked(daemon.localTaskClient.listWorkspaceLinks).mockResolvedValue([link]);
    vi.mocked(daemon.localTaskClient.getContext).mockResolvedValue({
      directory: "/context/task-1",
      planPath: "/context/task-1/plan.md",
      notesPath: "/context/task-1/notes.md",
      outcomePath: "/context/task-1/outcome.md",
    });

    await refreshSelectedWorkspaceTasks("workspace-1");
    await loadLocalTaskContext("task-1");

    expect(daemon.localTaskClient.list).toHaveBeenCalledWith({ workspaceId: "workspace-1" });
    expect(localTaskStore.getState().workspaceLinks).toEqual([link]);
    expect(localTaskStore.getState().contextLoadStateByTaskId["task-1"]).toBe("loaded");
  });

  it("orchestrates workspace link mutations and refreshes selected-workspace state", async () => {
    vi.mocked(daemon.localTaskClient.list).mockResolvedValue([task]);
    vi.mocked(daemon.localTaskClient.listWorkspaceLinks).mockResolvedValue([link]);
    vi.mocked(daemon.localTaskClient.linkWorkspace).mockResolvedValue(link);
    vi.mocked(daemon.localTaskClient.updateLinkStatus).mockResolvedValue({ ...link, status: "paused" });
    vi.mocked(daemon.localTaskClient.listTaskLinks).mockResolvedValue([link]);
    await refreshSelectedWorkspaceTasks("workspace-1");

    await linkLocalTaskWorkspace("task-1", "workspace-1");
    await updateLocalTaskLinkStatus("link-1", "paused");
    await unlinkLocalTaskWorkspace("link-1");
    await loadLocalTaskLinks("task-1");

    expect(daemon.localTaskClient.linkWorkspace).toHaveBeenCalledWith("task-1", "workspace-1");
    expect(daemon.localTaskClient.updateLinkStatus).toHaveBeenCalledWith("link-1", "paused");
    expect(daemon.localTaskClient.unlinkWorkspace).toHaveBeenCalledWith("link-1");
    expect(daemon.localTaskClient.listWorkspaceLinks).toHaveBeenCalledTimes(4);
    expect(localTaskStore.getState()).toMatchObject({
      taskLinksByTaskId: { "task-1": [link] },
      taskLinksLoadStateByTaskId: { "task-1": "loaded" },
    });
  });

  it("updates the global tag catalog after setting a color", async () => {
    const coloredTag = {
      id: "tag-fixture",
      key: "backend",
      name: "Backend",
      aliases: ["Backend"],
      color: "#3B82F6",
    };
    vi.mocked(daemon.localTaskClient.updateTagColor).mockResolvedValue(coloredTag);
    vi.mocked(daemon.localTaskClient.listTagCatalog).mockResolvedValue([coloredTag]);

    await updateLocalTaskTagColor("backend", "#3B82F6");

    expect(daemon.localTaskClient.updateTagColor).toHaveBeenCalledWith("backend", "#3B82F6");
    expect(daemon.localTaskClient.listTagCatalog).toHaveBeenCalledOnce();
    expect(localTaskStore.getState().tagCatalog).toEqual([coloredTag]);
  });

  it("treats the color update as successful when the catalog reload fails", async () => {
    const coloredTag = {
      id: "tag-fixture",
      key: "backend",
      name: "Backend",
      aliases: ["Backend"],
      color: "#3B82F6",
    };
    localTaskStore.setState({
      tagCatalog: [{ ...coloredTag, color: "#EF4444" }],
      tagSuggestions: ["Backend"],
    });
    vi.mocked(daemon.localTaskClient.updateTagColor).mockResolvedValue(coloredTag);
    vi.mocked(daemon.localTaskClient.listTagCatalog).mockRejectedValue(new Error("catalog reload failed"));

    await expect(updateLocalTaskTagColor("backend", "#3B82F6")).resolves.toBeUndefined();

    expect(localTaskStore.getState()).toMatchObject({
      tagCatalog: [coloredTag],
      tagSuggestions: ["Backend"],
      tagSuggestionsLoadState: "error",
      tagSuggestionsError: "catalog reload failed",
    });
  });

  it("keeps the catalog unchanged when clearing a color fails", async () => {
    const existingCatalog = [
      {
        id: "tag-fixture",
        key: "backend",
        name: "Backend",
        aliases: ["Backend"],
        color: "#EF4444",
      },
    ];
    localTaskStore.setState({ tagCatalog: existingCatalog });
    vi.mocked(daemon.localTaskClient.updateTagColor).mockRejectedValue(new Error("Color update failed"));

    await expect(updateLocalTaskTagColor("backend", null)).rejects.toThrow("Color update failed");

    expect(daemon.localTaskClient.listTagCatalog).not.toHaveBeenCalled();
    expect(localTaskStore.getState().tagCatalog).toEqual(existingCatalog);
    expect(localTaskStore.getState().mutationError).toBe("Color update failed");
  });

  it("refreshes the tag catalog after a tag mutation so new aliases resolve in the same session", async () => {
    const createdTask = { ...task, tags: ["STRASSE"] };
    vi.mocked(daemon.localTaskClient.create).mockResolvedValue(createdTask);
    vi.mocked(daemon.localTaskClient.list).mockResolvedValue([createdTask]);
    vi.mocked(daemon.localTaskClient.listTagCatalog).mockResolvedValue([
      {
        id: "tag-fixture",
        key: "strasse",
        name: "Straße",
        aliases: ["STRASSE", "Straße"],
        color: "#A855F7",
      },
    ]);

    await createLocalTask({ title: "Task", tags: ["STRASSE"] });

    expect(daemon.localTaskClient.listTagCatalog).toHaveBeenCalledOnce();
    expect(localTaskStore.getState().tagCatalog).toEqual([
      {
        id: "tag-fixture",
        key: "strasse",
        name: "Straße",
        aliases: ["STRASSE", "Straße"],
        color: "#A855F7",
      },
    ]);
  });

  it("does not let a slow detail load overwrite a newer task update", async () => {
    const staleLoad = createDeferred<LocalTask>();
    const updatedTask = { ...task, title: "Updated", updatedAt: "newer" };
    vi.mocked(daemon.localTaskClient.get).mockReturnValue(staleLoad.promise);
    vi.mocked(daemon.localTaskClient.update).mockResolvedValue(updatedTask);
    vi.mocked(daemon.localTaskClient.list).mockResolvedValue([updatedTask]);
    vi.mocked(daemon.localTaskClient.listProjection).mockResolvedValue({
      tasks: [updatedTask],
      projectsById: {},
      total: 1,
    });

    const loading = loadLocalTask("task-1");
    await updateLocalTask("task-1", { title: "Updated" });
    staleLoad.resolve(task);
    await loading;

    expect(localTaskStore.getState().taskById["task-1"]).toEqual(updatedTask);
  });

  it("reloads loaded task-link history after status and unlink mutations", async () => {
    localTaskStore.setState({
      selectedWorkspaceId: "workspace-1",
      workspaceLinks: [link],
      taskLinksByTaskId: { "task-1": [link] },
    });
    vi.mocked(daemon.localTaskClient.updateLinkStatus).mockResolvedValue({ ...link, status: "paused" });
    vi.mocked(daemon.localTaskClient.list).mockResolvedValue([]);
    vi.mocked(daemon.localTaskClient.listWorkspaceLinks).mockResolvedValue([]);
    vi.mocked(daemon.localTaskClient.listTaskLinks)
      .mockResolvedValueOnce([{ ...link, status: "paused" }])
      .mockResolvedValueOnce([{ ...link, status: "completed", unlinkedAt: "unlinked" }]);

    await updateLocalTaskLinkStatus("link-1", "paused");
    await unlinkLocalTaskWorkspace("link-1");

    expect(daemon.localTaskClient.listTaskLinks).toHaveBeenCalledTimes(2);
    expect(localTaskStore.getState().taskLinksByTaskId["task-1"]).toEqual([
      { ...link, status: "completed", unlinkedAt: "unlinked" },
    ]);
  });

  it("stores central error messages for hub, workspace, context, and mutations", async () => {
    vi.mocked(daemon.localTaskClient.listProjection).mockRejectedValue(new Error("daemon offline"));
    vi.mocked(daemon.localTaskClient.listWorkspaceLinks).mockRejectedValue(new Error("links unavailable"));
    vi.mocked(daemon.localTaskClient.getContext).mockRejectedValue(new Error("context unavailable"));
    vi.mocked(daemon.localTaskClient.listTaskLinks).mockRejectedValue(new Error("task links unavailable"));
    vi.mocked(daemon.localTaskClient.update).mockRejectedValue("update failed");

    await refreshLocalTaskHub();
    vi.mocked(daemon.localTaskClient.list).mockResolvedValue([]);
    await refreshSelectedWorkspaceTasks("workspace-1");
    await loadLocalTaskContext("task-1");
    await loadLocalTaskLinks("task-1");
    await expect(updateLocalTask("task-1", { status: "paused" })).rejects.toBe("update failed");

    expect(localTaskStore.getState()).toMatchObject({
      hubError: "daemon offline",
      workspaceError: "links unavailable",
      mutationError: "update failed",
    });
    expect(localTaskStore.getState().contextErrorByTaskId["task-1"]).toBe("context unavailable");
    expect(localTaskStore.getState().taskLinksErrorByTaskId["task-1"]).toBe("task links unavailable");
  });

  it("refreshes hub projections after creating a task", async () => {
    vi.mocked(daemon.localTaskClient.create).mockResolvedValue(task);
    vi.mocked(daemon.localTaskClient.list).mockResolvedValue([task]);

    const created = await createLocalTask({ title: "Task" });

    expect(created).toEqual(task);
    expect(daemon.localTaskClient.listProjection).toHaveBeenCalledOnce();
    expect(daemon.localTaskClient.list).toHaveBeenCalledOnce();
    expect(localTaskStore.getState()).toMatchObject({ hubTasks: [task], activeTaskCount: 1, isMutationLoading: false });
  });

  it("ignores stale hub success and error after a newer success", async () => {
    const oldSuccess = createDeferred<{ tasks: LocalTask[]; projectsById: Record<string, never>; total: number }>();
    const oldError = createDeferred<{ tasks: LocalTask[]; projectsById: Record<string, never>; total: number }>();
    const newestTask = { ...task, id: "task-new" };
    const hubLoads = [
      oldSuccess.promise,
      Promise.resolve({ tasks: [newestTask], projectsById: {}, total: 1 }),
      oldError.promise,
      Promise.resolve({ tasks: [newestTask], projectsById: {}, total: 1 }),
    ];
    localTaskStore.getState().setHubFilters({ priority: "medium" });
    vi.mocked(daemon.localTaskClient.list).mockResolvedValue([]);
    vi.mocked(daemon.localTaskClient.listProjection).mockImplementation(
      async () =>
        (await hubLoads.shift()) ?? {
          tasks: [],
          projectsById: {},
          total: 0,
        },
    );

    const firstRefresh = refreshLocalTaskHub();
    const secondRefresh = refreshLocalTaskHub();
    await secondRefresh;
    oldSuccess.resolve({ tasks: [task], projectsById: {}, total: 1 });
    await firstRefresh;

    const thirdRefresh = refreshLocalTaskHub();
    const fourthRefresh = refreshLocalTaskHub();
    await fourthRefresh;
    oldError.reject(new Error("stale hub failure"));
    await thirdRefresh;

    expect(localTaskStore.getState()).toMatchObject({ hubTasks: [newestTask], hubLoadState: "loaded", hubError: null });
  });

  it("ignores stale same-workspace success and error after a newer success", async () => {
    const oldSuccess = createDeferred<LocalTask[]>();
    const oldError = createDeferred<LocalTask[]>();
    const newestTask = { ...task, id: "task-new" };
    vi.mocked(daemon.localTaskClient.listWorkspaceLinks).mockResolvedValue([link]);
    vi.mocked(daemon.localTaskClient.list)
      .mockReturnValueOnce(oldSuccess.promise)
      .mockResolvedValueOnce([newestTask])
      .mockReturnValueOnce(oldError.promise)
      .mockResolvedValueOnce([newestTask]);

    const firstRefresh = refreshSelectedWorkspaceTasks("workspace-1");
    const secondRefresh = refreshSelectedWorkspaceTasks("workspace-1");
    await secondRefresh;
    oldSuccess.resolve([task]);
    await firstRefresh;

    const thirdRefresh = refreshSelectedWorkspaceTasks("workspace-1");
    const fourthRefresh = refreshSelectedWorkspaceTasks("workspace-1");
    await fourthRefresh;
    oldError.reject(new Error("stale workspace failure"));
    await thirdRefresh;

    expect(localTaskStore.getState()).toMatchObject({
      workspaceTasks: [newestTask],
      workspaceLoadState: "loaded",
      workspaceError: null,
    });
  });

  it("does not put created or updated tasks into incompatible projections when refresh fails", async () => {
    const updatedTask = { ...task, status: "paused" as const, title: "Paused" };
    localTaskStore.getState().setHubFilters({ status: "active" });
    {
      const requestId = localTaskStore.getState().beginHubLoad();
      localTaskStore.getState().setHubResults(requestId, [task], {}, 1);
    }
    vi.mocked(daemon.localTaskClient.create).mockResolvedValue({ ...task, id: "created", status: "paused" });
    vi.mocked(daemon.localTaskClient.update).mockResolvedValue(updatedTask);
    vi.mocked(daemon.localTaskClient.list).mockRejectedValue(new Error("refresh failed"));

    await createLocalTask({ title: "Created" });
    await updateLocalTask("task-1", { status: "paused" });

    expect(localTaskStore.getState().hubTasks).toEqual([task]);
    expect(localTaskStore.getState().taskById).toMatchObject({
      created: { status: "paused" },
      "task-1": { status: "paused", title: "Paused" },
    });
  });

  it("keeps mutation loading active until overlapping operations settle", async () => {
    const first = createDeferred<LocalTask>();
    const second = createDeferred<LocalTask>();
    vi.mocked(daemon.localTaskClient.create).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    vi.mocked(daemon.localTaskClient.list).mockResolvedValue([]);

    const firstMutation = createLocalTask({ title: "First" });
    const secondMutation = createLocalTask({ title: "Second" });
    second.resolve({ ...task, id: "second" });
    await secondMutation;

    expect(localTaskStore.getState()).toMatchObject({ isMutationLoading: true, pendingMutationCount: 1 });

    first.resolve({ ...task, id: "first" });
    await firstMutation;

    expect(localTaskStore.getState()).toMatchObject({ isMutationLoading: false, pendingMutationCount: 0 });
  });
});
