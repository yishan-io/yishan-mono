import { afterEach, describe, expect, it, vi } from "vitest";
import * as daemon from "../daemon/localTaskDaemonClient";
import type { LocalTask, LocalTaskWorkspaceLink } from "../localTaskTypes";
import { localTaskStore } from "../state/localTaskStore";
import {
  deleteLocalTaskTag,
  linkLocalTaskWorkspace,
  loadLocalTask,
  loadLocalTaskDetails,
  loadLocalTaskLinkCandidates,
  renameLocalTaskTag,
  unlinkLocalTaskWorkspace,
  updateLocalTask,
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
  tags: [],
  tagRefs: [],
};
const link: LocalTaskWorkspaceLink = {
  id: "link-1",
  localTaskId: task.id,
  workspaceId: "workspace-1",
  status: "progressing",
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
    vi.mocked(daemon.localTaskClient.list).mockResolvedValue(tasks);
    vi.mocked(daemon.localTaskClient.listWorkspaceLinks).mockResolvedValue([
      { ...link, id: "progressing", localTaskId: "current-active", status: "progressing", unlinkedAt: null },
      { ...link, id: "new", localTaskId: "current-paused", status: "new", unlinkedAt: null },
      { ...link, id: "done", localTaskId: "current-completed", status: "done", unlinkedAt: null },
      { ...link, id: "historical", localTaskId: "historical", status: "done", unlinkedAt: "unlinked" },
      {
        ...link,
        id: "older-history",
        localTaskId: "current-and-historical",
        status: "done",
        unlinkedAt: "unlinked",
      },
      {
        ...link,
        id: "new-current",
        localTaskId: "current-and-historical",
        status: "new",
        unlinkedAt: null,
      },
    ]);
    localTaskStore.setState({ hubFilters: { status: ["new"] }, hubSearchQuery: "unchanged" });

    await loadLocalTaskLinkCandidates("workspace-1");

    expect(daemon.localTaskClient.list).toHaveBeenCalledWith();
    expect(localTaskStore.getState()).toMatchObject({
      linkCandidateWorkspaceId: "workspace-1",
      linkCandidateLoadState: "loaded",
      hubFilters: { status: ["new"] },
      hubSearchQuery: "unchanged",
    });
    expect(localTaskStore.getState().linkCandidateTasks.map((candidate) => candidate.id)).toEqual([
      "historical",
      "never-linked",
    ]);
  });

  it("stores link-candidate loading errors for retry without changing hub results", async () => {
    localTaskStore.setState({ hubTasks: [task] });
    vi.mocked(daemon.localTaskClient.list).mockRejectedValue(new Error("candidate list unavailable"));
    vi.mocked(daemon.localTaskClient.listWorkspaceLinks).mockResolvedValue([]);

    await loadLocalTaskLinkCandidates("workspace-1");

    expect(localTaskStore.getState()).toMatchObject({
      linkCandidateWorkspaceId: "workspace-1",
      linkCandidateLoadState: "error",
      linkCandidateError: "candidate list unavailable",
      hubTasks: [task],
    });
  });

  it("loads detail display metadata without renderer project or workspace stores", async () => {
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
    vi.mocked(daemon.localTaskClient.getDetails).mockResolvedValue(details);

    await loadLocalTaskDetails(task.id);

    expect(daemon.localTaskClient.getDetails).toHaveBeenCalledWith(task.id);
    expect(localTaskStore.getState().detailsByTaskId[task.id]).toEqual(details);
  });

  it("refreshes cached detail projections after link and unlink mutations", async () => {
    const details = { task, project: null, workspaces: [] };
    const linkedDetails = {
      ...details,
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
    vi.mocked(daemon.localTaskClient.getDetails)
      .mockResolvedValueOnce(details)
      .mockResolvedValueOnce(linkedDetails)
      .mockResolvedValueOnce(details);
    vi.mocked(daemon.localTaskClient.linkWorkspace).mockResolvedValue(link);
    vi.mocked(daemon.localTaskClient.unlinkWorkspace).mockResolvedValue(undefined);
    vi.mocked(daemon.localTaskClient.list).mockResolvedValue([task]);
    vi.mocked(daemon.localTaskClient.listWorkspaceLinks).mockResolvedValue([link]);
    vi.mocked(daemon.localTaskClient.listTaskLinks).mockResolvedValue([link]);

    await loadLocalTaskDetails(task.id);
    await linkLocalTaskWorkspace(task.id, "workspace-1");
    await unlinkLocalTaskWorkspace(link.id);

    expect(daemon.localTaskClient.getDetails).toHaveBeenCalledTimes(3);
    expect(daemon.localTaskClient.getDetails).toHaveBeenLastCalledWith(task.id);
    expect(localTaskStore.getState().detailsByTaskId[task.id]).toEqual(details);
  });

  it("forces a fresh detail load when a load starts while a link mutation is pending", async () => {
    const mutationResponse = createDeferred<LocalTaskWorkspaceLink>();
    const staleDetails = createDeferred<{ task: LocalTask; project: null; workspaces: [] }>();
    const freshDetails = {
      task,
      project: null,
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
    localTaskStore.setState({
      detailsByTaskId: { [task.id]: { task, project: null, workspaces: [] } },
      detailsLoadStateByTaskId: { [task.id]: "loaded" },
      detailsErrorByTaskId: { [task.id]: null },
    });
    vi.mocked(daemon.localTaskClient.getDetails)
      .mockReturnValueOnce(staleDetails.promise)
      .mockResolvedValueOnce(freshDetails);
    vi.mocked(daemon.localTaskClient.linkWorkspace).mockReturnValue(mutationResponse.promise);
    vi.mocked(daemon.localTaskClient.list).mockResolvedValue([task]);
    vi.mocked(daemon.localTaskClient.listWorkspaceLinks).mockResolvedValue([link]);

    const mutation = linkLocalTaskWorkspace(task.id, link.workspaceId);
    await vi.waitFor(() => expect(daemon.localTaskClient.linkWorkspace).toHaveBeenCalledTimes(1));
    const staleLoad = loadLocalTaskDetails(task.id);
    mutationResponse.resolve(link);

    try {
      await vi.waitFor(() => expect(daemon.localTaskClient.getDetails).toHaveBeenCalledTimes(2));
    } finally {
      staleDetails.resolve({ task, project: null, workspaces: [] });
      await Promise.all([staleLoad, mutation]);
    }

    expect(localTaskStore.getState().detailsByTaskId[task.id]).toEqual(freshDetails);
  });

  it("supersedes an in-flight detail load after a link mutation", async () => {
    const staleDetails = createDeferred<{ task: LocalTask; project: null; workspaces: [] }>();
    const refreshedDetails = {
      task,
      project: null,
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
    vi.mocked(daemon.localTaskClient.getDetails)
      .mockReturnValueOnce(staleDetails.promise)
      .mockResolvedValueOnce(refreshedDetails);
    vi.mocked(daemon.localTaskClient.linkWorkspace).mockResolvedValue(link);
    vi.mocked(daemon.localTaskClient.list).mockResolvedValue([task]);
    vi.mocked(daemon.localTaskClient.listWorkspaceLinks).mockResolvedValue([link]);

    const staleLoad = loadLocalTaskDetails(task.id);
    const mutation = linkLocalTaskWorkspace(task.id, link.workspaceId);

    try {
      await vi.waitFor(() => expect(daemon.localTaskClient.getDetails).toHaveBeenCalledTimes(2));
    } finally {
      staleDetails.resolve({ task, project: null, workspaces: [] });
      await Promise.all([staleLoad, mutation]);
    }

    expect(localTaskStore.getState().detailsByTaskId[task.id]).toEqual(refreshedDetails);
  });

  it("does not let a stale detail response overwrite a newer task update", async () => {
    const staleDetails = createDeferred<{ task: LocalTask; project: null; workspaces: [] }>();
    const updatedTask = { ...task, title: "Updated task", updatedAt: "updated-later" };
    const refreshedDetails = { task: updatedTask, project: null, workspaces: [] };
    vi.mocked(daemon.localTaskClient.getDetails)
      .mockReturnValueOnce(staleDetails.promise)
      .mockResolvedValueOnce(refreshedDetails);
    vi.mocked(daemon.localTaskClient.update).mockResolvedValue(updatedTask);
    vi.mocked(daemon.localTaskClient.list).mockResolvedValue([updatedTask]);
    vi.mocked(daemon.localTaskClient.listTagCatalog).mockResolvedValue([]);

    const staleLoad = loadLocalTaskDetails(task.id);
    const mutation = updateLocalTask(task.id, { title: updatedTask.title });

    try {
      await vi.waitFor(() => expect(daemon.localTaskClient.getDetails).toHaveBeenCalledTimes(2));
    } finally {
      staleDetails.resolve({ task, project: null, workspaces: [] });
      await Promise.all([staleLoad, mutation]);
    }

    expect(localTaskStore.getState().taskById[task.id]).toEqual(updatedTask);
    expect(localTaskStore.getState().detailsByTaskId[task.id]).toEqual(refreshedDetails);
  });

  it("deduplicates delayed per-task detail loads for concurrent mounted and hidden callers", async () => {
    const delayedTask = createDeferred<LocalTask>();
    vi.mocked(daemon.localTaskClient.get).mockReturnValue(delayedTask.promise);

    const mountedLoad = loadLocalTask("task-1");
    const hiddenStateLoad = loadLocalTask("task-1");
    const unrelatedLoad = loadLocalTask("task-1");

    expect(daemon.localTaskClient.get).toHaveBeenCalledTimes(1);
    expect(daemon.localTaskClient.get).toHaveBeenCalledWith("task-1");
    delayedTask.resolve(task);
    await Promise.all([mountedLoad, hiddenStateLoad, unrelatedLoad]);
    expect(daemon.localTaskClient.get).toHaveBeenCalledTimes(1);
  });
  it("reconciles a merged tag across cached projections without reloading global task data", async () => {
    const canonicalTag = {
      id: "tag-canonical",
      key: "canonical",
      name: "Canonical",
      aliases: ["Canonical"],
      color: null,
    };
    vi.mocked(daemon.localTaskClient.renameTag).mockResolvedValue({ tag: canonicalTag, removedTagId: "tag-merged" });
    localTaskStore.setState({
      tagCatalog: [{ id: "tag-merged", key: "merged", name: "Merged", aliases: ["Merged"], color: null }, canonicalTag],
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
    expect(daemon.localTaskClient.listTagCatalog).not.toHaveBeenCalled();
    expect(daemon.localTaskClient.list).not.toHaveBeenCalled();
    expect(daemon.localTaskClient.search).not.toHaveBeenCalled();
    expect(daemon.localTaskClient.listWorkspaceLinks).not.toHaveBeenCalled();
    expect(daemon.localTaskClient.get).not.toHaveBeenCalled();
  });

  it("reconciles a deleted tag across cached projections without reloading global task data", async () => {
    const deletedTag = {
      id: "tag-deleted",
      key: "deleted",
      name: "Deleted",
      aliases: ["Deleted"],
      color: null,
    };
    vi.mocked(daemon.localTaskClient.deleteTag).mockResolvedValue(undefined);
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
    expect(daemon.localTaskClient.listTagCatalog).not.toHaveBeenCalled();
    expect(daemon.localTaskClient.list).not.toHaveBeenCalled();
    expect(daemon.localTaskClient.search).not.toHaveBeenCalled();
    expect(daemon.localTaskClient.listWorkspaceLinks).not.toHaveBeenCalled();
    expect(daemon.localTaskClient.get).not.toHaveBeenCalled();
  });
});
