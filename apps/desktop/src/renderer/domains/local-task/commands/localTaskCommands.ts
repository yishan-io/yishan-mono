import { activateWorkspace } from "@renderer/domains/workbench";
import { resolveLocalWorkspaceIdForProject, selectFolderInFileTree, workspaceStore } from "@renderer/domains/workspace";
import { getErrorMessage } from "@shared/errors/getErrorMessage";
import { localTaskClient } from "../daemon/localTaskDaemonClient";
import type {
  CreateLocalTaskInput,
  LocalTask,
  LocalTaskDetails,
  LocalTaskFilters,
  LocalTaskStatus,
  LocalTaskTagCatalogEntry,
  LocalTaskTagRenameResult,
  LocalTaskWorkspaceLink,
  UpdateLocalTaskInput,
} from "../localTaskTypes";
import { localTaskStore } from "../state/localTaskStore";

const taskLoadsInFlight = new Map<string, Promise<LocalTask>>();
const detailLoadsInFlight = new Map<string, Promise<LocalTaskDetails>>();

function getTrackedTaskLinkProjectionIds(): string[] {
  const { taskLinksByTaskId, taskLinksLoadStateByTaskId } = localTaskStore.getState();
  return [...new Set([...Object.keys(taskLinksByTaskId), ...Object.keys(taskLinksLoadStateByTaskId)])];
}

function getTrackedTaskDetailProjectionIds(): string[] {
  const { detailsByTaskId, detailsLoadStateByTaskId } = localTaskStore.getState();
  return [...new Set([...Object.keys(detailsByTaskId), ...Object.keys(detailsLoadStateByTaskId)])];
}

function getAffectedTaskLinkProjectionIds(predicate: (link: LocalTaskWorkspaceLink) => boolean): string[] {
  const { taskLinksByTaskId, taskLinksLoadStateByTaskId, workspaceLinks } = localTaskStore.getState();
  const trackedTaskIds = new Set(getTrackedTaskLinkProjectionIds());
  const affectedTaskIds = Object.entries(taskLinksByTaskId)
    .filter(([, links]) => links.some(predicate))
    .map(([taskId]) => taskId);
  for (const [taskId, loadState] of Object.entries(taskLinksLoadStateByTaskId)) {
    if (loadState === "loading") affectedTaskIds.push(taskId);
  }
  for (const link of workspaceLinks) {
    if (predicate(link) && trackedTaskIds.has(link.localTaskId)) affectedTaskIds.push(link.localTaskId);
  }
  return [...new Set(affectedTaskIds)];
}

function invalidateTaskLinkProjections(taskIds: string[]): string[] {
  const uniqueTaskIds = [...new Set(taskIds)];
  localTaskStore.getState().invalidateTaskLinksLoads(uniqueTaskIds);
  return uniqueTaskIds;
}

function invalidateTaskDetailProjections(taskIds: string[]): string[] {
  const trackedTaskIds = new Set(getTrackedTaskDetailProjectionIds());
  const detailTaskIds = [...new Set(taskIds)].filter((taskId) => trackedTaskIds.has(taskId));
  for (const taskId of detailTaskIds) detailLoadsInFlight.delete(taskId);
  localTaskStore.getState().invalidateDetailsLoads(detailTaskIds);
  return detailTaskIds;
}

async function refreshTaskLinkProjections(taskIds: string[]): Promise<void> {
  await Promise.all([...new Set(taskIds)].map(loadLocalTaskLinks));
}

async function refreshTaskDetailProjections(taskIds: string[]): Promise<void> {
  await Promise.all([...new Set(taskIds)].map(loadLocalTaskDetails));
}

async function refreshAfterMutation(): Promise<void> {
  const workspaceId = localTaskStore.getState().selectedWorkspaceId;
  await Promise.all([
    refreshLocalTaskHub(),
    workspaceId ? refreshSelectedWorkspaceTasks(workspaceId) : Promise.resolve(),
  ]);
}

async function refreshAfterTaskMutation(): Promise<void> {
  await Promise.all([refreshAfterMutation(), loadLocalTaskTagSuggestions()]);
}

async function runMutation<T>(operation: () => Promise<T>): Promise<T> {
  localTaskStore.getState().beginMutation();
  try {
    const mutationResult = await operation();
    localTaskStore.getState().finishMutation();
    return mutationResult;
  } catch (error) {
    localTaskStore.getState().finishMutation(getErrorMessage(error));
    throw error;
  }
}

/** Loads daemon-owned Local Task tag suggestions into store-owned state. */
export async function loadLocalTaskTagSuggestions(): Promise<void> {
  const requestId = localTaskStore.getState().beginTagCatalogLoad();
  try {
    const catalog = await localTaskClient.listTagCatalog();
    localTaskStore.getState().setTagCatalog(requestId, catalog);
  } catch (error) {
    localTaskStore.getState().setTagCatalogError(requestId, getErrorMessage(error));
  }
}

/** Refreshes only the active Local Task count used by app-level indicators. */
export async function refreshActiveLocalTaskCount(): Promise<void> {
  const requestId = localTaskStore.getState().beginActiveTaskCountLoad();
  try {
    const activeTasks = await localTaskClient.list({ status: "active" });
    localTaskStore.getState().setActiveTaskCount(requestId, activeTasks.length);
  } catch (error) {
    console.error("Failed to refresh active Local Task count", error);
  }
}

/** Refreshes the Task Hub using its current search query and filters. */
export async function refreshLocalTaskHub(): Promise<void> {
  const { hubFilters, hubSearchQuery } = localTaskStore.getState();
  const query = hubSearchQuery.trim();
  const requestId = localTaskStore.getState().beginHubLoad();
  try {
    const [hubTasks, activeTasks] = await Promise.all([
      query ? localTaskClient.search(query, hubFilters) : localTaskClient.list(hubFilters),
      localTaskClient.list({ status: "active" }),
    ]);
    localTaskStore.getState().setHubResults(requestId, hubTasks, activeTasks.length);
  } catch (error) {
    localTaskStore.getState().setHubError(requestId, getErrorMessage(error));
  }
}

/** Replaces Task Hub filters and refreshes the current list or search. */
export async function setLocalTaskHubFilters(filters: LocalTaskFilters): Promise<void> {
  localTaskStore.getState().setHubFilters(filters);
  await refreshLocalTaskHub();
}

/** Replaces the Task Hub metadata query and refreshes its results. */
export async function setLocalTaskHubSearchQuery(query: string): Promise<void> {
  localTaskStore.getState().setHubSearchQuery(query);
  await refreshLocalTaskHub();
}

/** Refreshes tasks and historical links for the selected local workspace. */
export async function refreshSelectedWorkspaceTasks(workspaceId?: string): Promise<void> {
  const selectedWorkspaceId = workspaceId ?? localTaskStore.getState().selectedWorkspaceId;
  if (!selectedWorkspaceId) return;
  const requestId = localTaskStore.getState().beginWorkspaceLoad(selectedWorkspaceId);
  try {
    const [tasks, links] = await Promise.all([
      localTaskClient.list({ workspaceId: selectedWorkspaceId }),
      localTaskClient.listWorkspaceLinks(selectedWorkspaceId),
    ]);
    localTaskStore.getState().setWorkspaceData(requestId, selectedWorkspaceId, tasks, links);
  } catch (error) {
    localTaskStore.getState().setWorkspaceError(requestId, selectedWorkspaceId, getErrorMessage(error));
  }
}

/** Selects a local workspace and loads its Local Task relationships. */
export async function selectLocalTaskWorkspace(workspaceId: string | null): Promise<void> {
  if (!workspaceId) {
    localTaskStore.getState().clearSelectedWorkspace();
    return;
  }
  await refreshSelectedWorkspaceTasks(workspaceId);
}

/** Loads and caches derived Task Context paths for one Local Task. */
export async function loadLocalTaskContext(taskId: string): Promise<void> {
  const requestId = localTaskStore.getState().beginContextLoad(taskId);
  try {
    const context = await localTaskClient.getContext(taskId);
    localTaskStore.getState().setContext(requestId, taskId, context);
  } catch (error) {
    localTaskStore.getState().setContextError(requestId, taskId, getErrorMessage(error));
  }
}

/** Loads one Local Task into the detail entity cache without changing list projections. */
export function loadLocalTask(taskId: string): Promise<LocalTask> {
  const existingLoad = taskLoadsInFlight.get(taskId);
  if (existingLoad) return existingLoad;

  const requestId = localTaskStore.getState().beginTaskLoad(taskId);
  const load = localTaskClient
    .get(taskId)
    .then((task) => {
      localTaskStore.getState().setTaskEntity(requestId, taskId, task);
      return task;
    })
    .catch((error) => {
      localTaskStore.getState().setTaskError(requestId, taskId, getErrorMessage(error));
      throw error;
    })
    .finally(() => taskLoadsInFlight.delete(taskId));
  taskLoadsInFlight.set(taskId, load);
  return load;
}

/** Loads a Local Task detail projection with daemon-resolved display metadata. */
export function loadLocalTaskDetails(taskId: string): Promise<LocalTaskDetails> {
  const existingLoad = detailLoadsInFlight.get(taskId);
  if (existingLoad) return existingLoad;

  const requestId = localTaskStore.getState().beginDetailsLoad(taskId);
  const load = localTaskClient
    .getDetails(taskId)
    .then((details) => {
      localTaskStore.getState().setDetails(requestId, taskId, details);
      return details;
    })
    .catch((error) => {
      localTaskStore.getState().setDetailsError(requestId, taskId, getErrorMessage(error));
      throw error;
    })
    .finally(() => {
      if (detailLoadsInFlight.get(taskId) === load) detailLoadsInFlight.delete(taskId);
    });
  detailLoadsInFlight.set(taskId, load);
  return load;
}

/** Loads a dedicated projection of tasks that can be linked to one workspace. */
export async function loadLocalTaskLinkCandidates(workspaceId: string): Promise<void> {
  const requestId = localTaskStore.getState().beginLinkCandidateLoad(workspaceId);
  try {
    const [tasks, links] = await Promise.all([localTaskClient.list(), localTaskClient.listWorkspaceLinks(workspaceId)]);
    const currentlyLinkedTaskIds = new Set(
      links
        .filter((link) => link.workspaceId === workspaceId && link.unlinkedAt === null)
        .map((link) => link.localTaskId),
    );
    localTaskStore.getState().setLinkCandidates(
      requestId,
      workspaceId,
      tasks.filter((task) => !currentlyLinkedTaskIds.has(task.id)),
    );
  } catch (error) {
    localTaskStore.getState().setLinkCandidateError(requestId, workspaceId, getErrorMessage(error));
  }
}

/** Creates a Local Task and refreshes authoritative list projections. */
export async function createLocalTask(input: CreateLocalTaskInput): Promise<LocalTask> {
  return runMutation(async () => {
    const task = await localTaskClient.create(input);
    localTaskStore.getState().upsertTaskEntity(task);
    await refreshAfterTaskMutation();
    return task;
  });
}

/** Sets or clears a global tag color and refreshes the authoritative catalog. */
export async function updateLocalTaskTagColor(id: string, color: string | null): Promise<void> {
  await runMutation(async () => {
    const updatedCatalogEntry = await localTaskClient.updateTagColor(id, color);
    localTaskStore.getState().upsertTagCatalogEntry(updatedCatalogEntry);

    const requestId = localTaskStore.getState().beginTagCatalogLoad();
    try {
      const catalog = await localTaskClient.listTagCatalog();
      localTaskStore.getState().setTagCatalog(requestId, catalog);
    } catch (error) {
      // The RPC already succeeded; retain its entry and expose only the best-effort reload failure.
      localTaskStore.getState().setTagCatalogError(requestId, getErrorMessage(error));
    }
  });
}

/** Creates one daemon-owned catalog tag and refreshes authoritative tag state. */
export async function createLocalTaskTag(name: string): Promise<LocalTaskTagCatalogEntry> {
  return runMutation(async () => {
    const tag = await localTaskClient.createTag(name);
    localTaskStore.getState().upsertTagCatalogEntry(tag);
    return tag;
  });
}

/** Renames one daemon-owned catalog tag by stable ID and refreshes authoritative tag state. */
export async function renameLocalTaskTag(id: string, name: string): Promise<LocalTaskTagRenameResult> {
  return runMutation(async () => {
    const result = await localTaskClient.renameTag(id, name);
    const removedTagId = result.removedTagId ?? id;
    localTaskStore.getState().reconcileTagRename(result.tag, result.removedTagId);
    localTaskStore.getState().reconcileHubTagFilter(removedTagId, result.tag.id);
    return result;
  });
}

/** Deletes one daemon-owned catalog tag by stable ID and refreshes authoritative tag state. */
export async function deleteLocalTaskTag(id: string): Promise<void> {
  await runMutation(async () => {
    await localTaskClient.deleteTag(id);
    localTaskStore.getState().reconcileTagDeletion(id);
    localTaskStore.getState().reconcileHubTagFilter(id);
  });
}

/** Updates a Local Task and refreshes authoritative list projections. */
export async function updateLocalTask(taskId: string, input: UpdateLocalTaskInput): Promise<LocalTask> {
  return runMutation(async () => {
    const task = await localTaskClient.update(taskId, input);
    const detailTaskIds = invalidateTaskDetailProjections([taskId]);
    localTaskStore.getState().upsertTaskEntity(task);
    await Promise.all([refreshAfterTaskMutation(), refreshTaskDetailProjections(detailTaskIds)]);
    return task;
  });
}

/** Links a Local Task to a workspace and refreshes affected projections. */
export async function linkLocalTaskWorkspace(taskId: string, workspaceId: string): Promise<LocalTaskWorkspaceLink> {
  return runMutation(async () => {
    const taskIds = invalidateTaskLinkProjections(
      getTrackedTaskLinkProjectionIds().filter((trackedTaskId) => trackedTaskId === taskId),
    );
    const link = await localTaskClient.linkWorkspace(taskId, workspaceId);
    const detailTaskIds = invalidateTaskDetailProjections([taskId]);
    await Promise.all([
      refreshAfterMutation(),
      refreshTaskDetailProjections(detailTaskIds),
      refreshTaskLinkProjections(taskIds),
    ]);
    return link;
  });
}

/** Unlinks a workspace relationship and refreshes affected projections. */
export async function unlinkLocalTaskWorkspace(linkId: string): Promise<void> {
  await runMutation(async () => {
    const affectedTaskIds = getAffectedTaskLinkProjectionIds((link) => link.id === linkId);
    const taskIds = invalidateTaskLinkProjections(affectedTaskIds);
    await localTaskClient.unlinkWorkspace(linkId);
    const detailTaskIds = invalidateTaskDetailProjections(getTrackedTaskDetailProjectionIds());
    await Promise.all([
      refreshAfterMutation(),
      refreshTaskDetailProjections(detailTaskIds),
      refreshTaskLinkProjections(taskIds),
    ]);
  });
}

/** Updates one workspace link status and refreshes affected projections. */
export async function updateLocalTaskLinkStatus(
  linkId: string,
  status: LocalTaskStatus,
): Promise<LocalTaskWorkspaceLink> {
  return runMutation(async () => {
    const affectedTaskIds = getAffectedTaskLinkProjectionIds((link) => link.id === linkId);
    const taskIds = invalidateTaskLinkProjections(affectedTaskIds);
    const link = await localTaskClient.updateLinkStatus(linkId, status);
    const detailTaskIds = invalidateTaskDetailProjections([...affectedTaskIds, link.localTaskId]);
    if (getTrackedTaskLinkProjectionIds().includes(link.localTaskId)) taskIds.push(link.localTaskId);
    await Promise.all([
      refreshAfterMutation(),
      refreshTaskDetailProjections(detailTaskIds),
      refreshTaskLinkProjections(taskIds),
    ]);
    return link;
  });
}

/** Loads all historical workspace links for one Local Task into store-owned state. */
export async function loadLocalTaskLinks(taskId: string): Promise<void> {
  const requestId = localTaskStore.getState().beginTaskLinksLoad(taskId);
  try {
    const links = await localTaskClient.listTaskLinks(taskId);
    localTaskStore.getState().setTaskLinks(requestId, taskId, links);
  } catch (error) {
    localTaskStore.getState().setTaskLinksError(requestId, taskId, getErrorMessage(error));
  }
}

/** The result of creating a task and attempting to link it to a workspace. */
export type CreateAndLinkLocalTaskResult =
  | { status: "linked"; task: LocalTask }
  | { status: "created"; task: LocalTask; linkError: string };

/** Creates a Local Task and retains explicit partial success when workspace linking fails. */
export async function createAndLinkLocalTask(
  input: CreateLocalTaskInput,
  workspaceId: string,
): Promise<CreateAndLinkLocalTaskResult> {
  localTaskStore.getState().beginMutation();
  let task: LocalTask;
  try {
    task = await localTaskClient.create(input);
    localTaskStore.getState().upsertTaskEntity(task);
  } catch (error) {
    localTaskStore.getState().finishMutation(getErrorMessage(error));
    throw error;
  }

  try {
    await localTaskClient.linkWorkspace(task.id, workspaceId);
  } catch (error) {
    const linkError = getErrorMessage(error);
    await refreshAfterTaskMutation();
    localTaskStore.getState().finishMutation(linkError);
    return { status: "created", task, linkError };
  }

  await refreshAfterTaskMutation();
  localTaskStore.getState().finishMutation();
  return { status: "linked", task };
}

const TASK_CONTEXT_RELATIVE_ROOT = ".my-context/task-context";

/** Opens a project's derived Task Context directory in the workspace file tree. */
export function openLocalTaskContextInFileTree(taskId: string): void {
  if (!localTaskStore.getState().contextByTaskId[taskId]) return;
  selectFolderInFileTree(`${TASK_CONTEXT_RELATIVE_ROOT}/${taskId}`);
}

/** Selects which workspace-linked Local Task is shown in the details panel. */
export function selectWorkspaceLocalTask(taskId: string): void {
  localTaskStore.getState().selectWorkspaceTask(taskId);
}

/** Activates an active workspace shown by a Local Task detail projection. */
export function navigateToLocalTaskWorkspace(workspaceId: string, projectId: string): void {
  activateWorkspace({ workspaceId, projectId });
}

/** Activates a project's hydrated local primary workspace from Local Task details. */
export function navigateToLocalTaskProject(projectId: string): void {
  const workspaceId = resolveLocalWorkspaceIdForProject(workspaceStore.getState().workspaces, projectId);
  if (workspaceId) activateWorkspace({ workspaceId, projectId });
}
