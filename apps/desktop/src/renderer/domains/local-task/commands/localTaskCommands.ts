import { SYSTEM_DEFAULT_APP_ID, openEntryInExternalApp } from "@renderer/domains/files";
import { projectStore } from "@renderer/domains/project";
import { getErrorMessage } from "@shared/errors/getErrorMessage";
import {
  createLocalTask as createLocalTaskFromDaemon,
  getLocalTaskContext as getLocalTaskContextFromDaemon,
  getLocalTask as getLocalTaskFromDaemon,
  linkLocalTaskWorkspace as linkLocalTaskWorkspaceFromDaemon,
  listLocalTaskLinks as listLocalTaskLinksFromDaemon,
  listLocalTaskWorkspaceLinks as listLocalTaskWorkspaceLinksFromDaemon,
  listLocalTasks as listLocalTasksFromDaemon,
  searchLocalTasks as searchLocalTasksFromDaemon,
  setPrimaryLocalTask as setPrimaryLocalTaskFromDaemon,
  unlinkLocalTaskWorkspace as unlinkLocalTaskWorkspaceFromDaemon,
  updateLocalTask as updateLocalTaskFromDaemon,
  updateLocalTaskLinkStatus as updateLocalTaskLinkStatusFromDaemon,
} from "../daemon/localTaskDaemonClient";
import type {
  CreateLocalTaskInput,
  LocalTask,
  LocalTaskFilters,
  LocalTaskLinkRole,
  LocalTaskStatus,
  LocalTaskWorkspaceLink,
  UpdateLocalTaskInput,
} from "../localTaskTypes";
import { localTaskStore } from "../state/localTaskStore";

const taskLoadsInFlight = new Map<string, Promise<LocalTask>>();

function getTrackedTaskLinkProjectionIds(): string[] {
  const { taskLinksByTaskId, taskLinksLoadStateByTaskId } = localTaskStore.getState();
  return [...new Set([...Object.keys(taskLinksByTaskId), ...Object.keys(taskLinksLoadStateByTaskId)])];
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

async function refreshTaskLinkProjections(taskIds: string[]): Promise<void> {
  await Promise.all([...new Set(taskIds)].map(loadLocalTaskLinks));
}

async function refreshAfterMutation(): Promise<void> {
  const workspaceId = localTaskStore.getState().selectedWorkspaceId;
  await Promise.all([
    refreshLocalTaskHub(),
    workspaceId ? refreshSelectedWorkspaceTasks(workspaceId) : Promise.resolve(),
  ]);
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

/** Refreshes only the active Local Task count used by app-level indicators. */
export async function refreshActiveLocalTaskCount(): Promise<void> {
  const requestId = localTaskStore.getState().beginActiveTaskCountLoad();
  try {
    const activeTasks = await listLocalTasksFromDaemon({ status: "active" });
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
      query ? searchLocalTasksFromDaemon(query, hubFilters) : listLocalTasksFromDaemon(hubFilters),
      listLocalTasksFromDaemon({ status: "active" }),
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
      listLocalTasksFromDaemon({ workspaceId: selectedWorkspaceId }),
      listLocalTaskWorkspaceLinksFromDaemon(selectedWorkspaceId),
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
    const context = await getLocalTaskContextFromDaemon(taskId);
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
  const load = getLocalTaskFromDaemon(taskId)
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

/** Loads a dedicated projection of tasks that can be linked to one workspace. */
export async function loadLocalTaskLinkCandidates(workspaceId: string): Promise<void> {
  const requestId = localTaskStore.getState().beginLinkCandidateLoad(workspaceId);
  try {
    const [tasks, links] = await Promise.all([
      listLocalTasksFromDaemon(),
      listLocalTaskWorkspaceLinksFromDaemon(workspaceId),
    ]);
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
    const task = await createLocalTaskFromDaemon(input);
    localTaskStore.getState().upsertTaskEntity(task);
    await refreshAfterMutation();
    return task;
  });
}

/** Updates a Local Task and refreshes authoritative list projections. */
export async function updateLocalTask(taskId: string, input: UpdateLocalTaskInput): Promise<LocalTask> {
  return runMutation(async () => {
    const task = await updateLocalTaskFromDaemon(taskId, input);
    localTaskStore.getState().upsertTaskEntity(task);
    await refreshAfterMutation();
    return task;
  });
}

/** Links a Local Task to a workspace and refreshes affected projections. */
export async function linkLocalTaskWorkspace(
  taskId: string,
  workspaceId: string,
  role?: LocalTaskLinkRole,
): Promise<LocalTaskWorkspaceLink> {
  return runMutation(async () => {
    const trackedTaskIds = getTrackedTaskLinkProjectionIds();
    const taskIds = invalidateTaskLinkProjections(
      role === "primary" ? trackedTaskIds : trackedTaskIds.filter((trackedTaskId) => trackedTaskId === taskId),
    );
    const link = await linkLocalTaskWorkspaceFromDaemon(taskId, workspaceId, role);
    await Promise.all([refreshAfterMutation(), refreshTaskLinkProjections(taskIds)]);
    return link;
  });
}

/** Unlinks a workspace relationship and refreshes affected projections. */
export async function unlinkLocalTaskWorkspace(linkId: string): Promise<void> {
  await runMutation(async () => {
    const taskIds = invalidateTaskLinkProjections(getAffectedTaskLinkProjectionIds((link) => link.id === linkId));
    await unlinkLocalTaskWorkspaceFromDaemon(linkId);
    await Promise.all([refreshAfterMutation(), refreshTaskLinkProjections(taskIds)]);
  });
}

/** Sets one workspace's primary Local Task and refreshes affected projections. */
export async function setPrimaryLocalTask(taskId: string, workspaceId: string): Promise<LocalTaskWorkspaceLink> {
  return runMutation(async () => {
    const taskIds = invalidateTaskLinkProjections(getTrackedTaskLinkProjectionIds());
    const link = await setPrimaryLocalTaskFromDaemon(taskId, workspaceId);
    await Promise.all([refreshAfterMutation(), refreshTaskLinkProjections(taskIds)]);
    return link;
  });
}

/** Updates one workspace link status and refreshes affected projections. */
export async function updateLocalTaskLinkStatus(
  linkId: string,
  status: LocalTaskStatus,
): Promise<LocalTaskWorkspaceLink> {
  return runMutation(async () => {
    const taskIds = invalidateTaskLinkProjections(getAffectedTaskLinkProjectionIds((link) => link.id === linkId));
    const link = await updateLocalTaskLinkStatusFromDaemon(linkId, status);
    if (status === "active" && link.role === "primary") {
      taskIds.push(...invalidateTaskLinkProjections(getTrackedTaskLinkProjectionIds()));
    } else if (getTrackedTaskLinkProjectionIds().includes(link.localTaskId)) {
      taskIds.push(link.localTaskId);
    }
    await Promise.all([refreshAfterMutation(), refreshTaskLinkProjections(taskIds)]);
    return link;
  });
}

/** Loads all historical workspace links for one Local Task into store-owned state. */
export async function loadLocalTaskLinks(taskId: string): Promise<void> {
  const requestId = localTaskStore.getState().beginTaskLinksLoad(taskId);
  try {
    const links = await listLocalTaskLinksFromDaemon(taskId);
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
  role: LocalTaskLinkRole,
): Promise<CreateAndLinkLocalTaskResult> {
  localTaskStore.getState().beginMutation();
  let task: LocalTask;
  try {
    task = await createLocalTaskFromDaemon(input);
    localTaskStore.getState().upsertTaskEntity(task);
  } catch (error) {
    localTaskStore.getState().finishMutation(getErrorMessage(error));
    throw error;
  }

  try {
    await linkLocalTaskWorkspaceFromDaemon(task.id, workspaceId, role);
  } catch (error) {
    const linkError = getErrorMessage(error);
    await refreshAfterMutation();
    localTaskStore.getState().finishMutation(linkError);
    return { status: "created", task, linkError };
  }

  await refreshAfterMutation();
  localTaskStore.getState().finishMutation();
  return { status: "linked", task };
}

export type LocalTaskContextDocument = "plan" | "notes" | "outcome";

/** Opens the exact derived Task Context document path in the configured editor or system default application. */
export async function openLocalTaskContextDocument(taskId: string, document: LocalTaskContextDocument): Promise<void> {
  const context = localTaskStore.getState().contextByTaskId[taskId];
  if (!context) return;
  const pathByDocument = {
    plan: context.planPath,
    notes: context.notesPath,
    outcome: context.outcomePath,
  };
  await openEntryInExternalApp({
    workspaceWorktreePath: pathByDocument[document],
    appId: projectStore.getState().lastUsedExternalAppId ?? SYSTEM_DEFAULT_APP_ID,
  });
}

/** Selects which workspace-linked Local Task is shown in the details panel. */
export function selectWorkspaceLocalTask(taskId: string): void {
  localTaskStore.getState().selectWorkspaceTask(taskId);
}
