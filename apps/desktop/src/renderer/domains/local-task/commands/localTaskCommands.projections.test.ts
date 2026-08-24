import { afterEach, describe, expect, it, vi } from "vitest";
import * as daemon from "../daemon/localTaskDaemonClient";
import type { LocalTask, LocalTaskWorkspaceLink } from "../localTaskTypes";
import { localTaskStore } from "../state/localTaskStore";
import {
  deleteLocalTaskTag,
  loadLocalTask,
  loadLocalTaskLinkCandidates,
  renameLocalTaskTag,
} from "./localTaskCommands";

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
  listLocalTaskTags: vi.fn(),
  listLocalTaskTagCatalog: vi.fn(),
  renameLocalTaskTag: vi.fn(),
  deleteLocalTaskTag: vi.fn(),
  createLocalTaskTag: vi.fn(),
  updateLocalTaskTagColor: vi.fn(),
}));

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
  localTaskId: task.id,
  workspaceId: "workspace-1",
  status: "active",
  linkedAt: "linked",
  unlinkedAt: null,
};

function createDeferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

afterEach(() => {
  localTaskStore.setState(initialState, true);
  vi.clearAllMocks();
});

describe("localTaskCommands projections and detail loading", () => {
  it("builds link candidates from all tasks and excludes every current link status", async () => {
    const tasks = [
      { ...task, id: "current-active", title: "Current active" },
      { ...task, id: "current-paused", title: "Current paused" },
      { ...task, id: "current-completed", title: "Current completed" },
      { ...task, id: "historical", title: "Historical only" },
      { ...task, id: "current-and-historical", title: "Current and historical" },
      { ...task, id: "never-linked", title: "Never linked" },
    ];
    vi.mocked(daemon.listLocalTasks).mockResolvedValue(tasks);
    vi.mocked(daemon.listLocalTaskWorkspaceLinks).mockResolvedValue([
      { ...link, id: "active", localTaskId: "current-active", status: "active", unlinkedAt: null },
      { ...link, id: "paused", localTaskId: "current-paused", status: "paused", unlinkedAt: null },
      { ...link, id: "completed", localTaskId: "current-completed", status: "completed", unlinkedAt: null },
      { ...link, id: "historical", localTaskId: "historical", status: "completed", unlinkedAt: "unlinked" },
      {
        ...link,
        id: "older-history",
        localTaskId: "current-and-historical",
        status: "completed",
        unlinkedAt: "unlinked",
      },
      {
        ...link,
        id: "new-current",
        localTaskId: "current-and-historical",
        status: "paused",
        unlinkedAt: null,
      },
    ]);
    localTaskStore.setState({ hubFilters: { status: "paused" }, hubSearchQuery: "unchanged" });

    await loadLocalTaskLinkCandidates("workspace-1");

    expect(daemon.listLocalTasks).toHaveBeenCalledWith();
    expect(localTaskStore.getState()).toMatchObject({
      linkCandidateWorkspaceId: "workspace-1",
      linkCandidateLoadState: "loaded",
      hubFilters: { status: "paused" },
      hubSearchQuery: "unchanged",
    });
    expect(localTaskStore.getState().linkCandidateTasks.map((candidate) => candidate.id)).toEqual([
      "historical",
      "never-linked",
    ]);
  });

  it("stores link-candidate loading errors for retry without changing hub results", async () => {
    localTaskStore.setState({ hubTasks: [task] });
    vi.mocked(daemon.listLocalTasks).mockRejectedValue(new Error("candidate list unavailable"));
    vi.mocked(daemon.listLocalTaskWorkspaceLinks).mockResolvedValue([]);

    await loadLocalTaskLinkCandidates("workspace-1");

    expect(localTaskStore.getState()).toMatchObject({
      linkCandidateWorkspaceId: "workspace-1",
      linkCandidateLoadState: "error",
      linkCandidateError: "candidate list unavailable",
      hubTasks: [task],
    });
  });

  it("deduplicates delayed per-task detail loads for concurrent mounted and hidden callers", async () => {
    const delayedTask = createDeferred<LocalTask>();
    vi.mocked(daemon.getLocalTask).mockReturnValue(delayedTask.promise);

    const mountedLoad = loadLocalTask("task-1");
    const hiddenStateLoad = loadLocalTask("task-1");
    const unrelatedLoad = loadLocalTask("task-1");

    expect(daemon.getLocalTask).toHaveBeenCalledTimes(1);
    expect(daemon.getLocalTask).toHaveBeenCalledWith("task-1");
    delayedTask.resolve(task);
    await Promise.all([mountedLoad, hiddenStateLoad, unrelatedLoad]);
    expect(daemon.getLocalTask).toHaveBeenCalledTimes(1);
  });
  it("reconciles a merged tag across cached projections without reloading global task data", async () => {
    const canonicalTag = {
      id: "tag-canonical",
      key: "canonical",
      name: "Canonical",
      aliases: ["Canonical"],
      color: null,
      customColor: null,
    };
    vi.mocked(daemon.renameLocalTaskTag).mockResolvedValue({ tag: canonicalTag, removedTagId: "tag-merged" });
    localTaskStore.setState({
      tagCatalog: [
        { id: "tag-merged", key: "merged", name: "Merged", aliases: ["Merged"], color: null, customColor: null },
        canonicalTag,
      ],
      taskById: { [task.id]: { ...task, tagRefs: [{ id: "tag-merged", name: "Merged" }] } },
      hubTasks: [{ ...task, tagRefs: [{ id: "tag-merged", name: "Merged" }] }],
      hubFilters: { tagIds: ["tag-merged", "tag-other", "tag-canonical"] },
      workspaceTasks: [{ ...task, tagRefs: [{ id: "tag-merged", name: "Merged" }] }],
      linkCandidateTasks: [{ ...task, tagRefs: [{ id: "tag-merged", name: "Merged" }] }],
    });

    await expect(renameLocalTaskTag("tag-merged", "Canonical")).resolves.toMatchObject({ removedTagId: "tag-merged" });

    const state = localTaskStore.getState();
    expect(state.tagCatalog).toEqual([canonicalTag]);
    expect(state.hubFilters).toEqual({ tagIds: ["tag-canonical", "tag-other"] });
    for (const cachedTask of [
      state.taskById[task.id],
      state.hubTasks[0],
      state.workspaceTasks[0],
      state.linkCandidateTasks[0],
    ]) {
      expect(cachedTask?.tagRefs).toEqual([{ id: "tag-canonical", name: "Canonical" }]);
    }
    expect(daemon.listLocalTaskTagCatalog).not.toHaveBeenCalled();
    expect(daemon.listLocalTasks).not.toHaveBeenCalled();
    expect(daemon.searchLocalTasks).not.toHaveBeenCalled();
    expect(daemon.listLocalTaskWorkspaceLinks).not.toHaveBeenCalled();
    expect(daemon.getLocalTask).not.toHaveBeenCalled();
  });

  it("reconciles a deleted tag across cached projections without reloading global task data", async () => {
    const deletedTag = {
      id: "tag-deleted",
      key: "deleted",
      name: "Deleted",
      aliases: ["Deleted"],
      color: null,
      customColor: null,
    };
    vi.mocked(daemon.deleteLocalTaskTag).mockResolvedValue(undefined);
    localTaskStore.setState({
      tagCatalog: [deletedTag],
      taskById: { [task.id]: { ...task, tagRefs: [{ id: "tag-deleted", name: "Deleted" }] } },
      hubTasks: [{ ...task, tagRefs: [{ id: "tag-deleted", name: "Deleted" }] }],
      hubFilters: { tagIds: ["tag-deleted", "tag-other"] },
      workspaceTasks: [{ ...task, tagRefs: [{ id: "tag-deleted", name: "Deleted" }] }],
      linkCandidateTasks: [{ ...task, tagRefs: [{ id: "tag-deleted", name: "Deleted" }] }],
    });

    await deleteLocalTaskTag("tag-deleted");

    const state = localTaskStore.getState();
    expect(state.tagCatalog).toEqual([]);
    expect(state.hubFilters).toEqual({ tagIds: ["tag-other"] });
    for (const cachedTask of [
      state.taskById[task.id],
      state.hubTasks[0],
      state.workspaceTasks[0],
      state.linkCandidateTasks[0],
    ]) {
      expect(cachedTask?.tagRefs).toEqual([]);
    }
    expect(daemon.listLocalTaskTagCatalog).not.toHaveBeenCalled();
    expect(daemon.listLocalTasks).not.toHaveBeenCalled();
    expect(daemon.searchLocalTasks).not.toHaveBeenCalled();
    expect(daemon.listLocalTaskWorkspaceLinks).not.toHaveBeenCalled();
    expect(daemon.getLocalTask).not.toHaveBeenCalled();
  });
});
