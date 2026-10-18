import { sessionStore } from "@renderer/domains/session";
import { getErrorMessage } from "@shared/errors/getErrorMessage";
import { localTaskClient } from "../daemon/localTaskDaemonClient";
import { taskHubPreferenceClient } from "../daemon/taskHubPreferenceClient";
import type { LocalTaskFilters } from "../localTaskTypes";
import { localTaskStore } from "../state/localTaskStore";

/** A replacement or an intent evaluated after earlier queued writes and hydration. */
export type TaskHubFilterIntent = LocalTaskFilters | ((current: LocalTaskFilters) => LocalTaskFilters);

let pendingPreference: Promise<unknown> = Promise.resolve();
let previousScope: string | undefined;

function getScopeKey(): string {
  const { currentUserId, daemonId, selectedOrganizationId } = sessionStore.getState();
  return JSON.stringify([currentUserId, daemonId, selectedOrganizationId]);
}

function normalizeFilters(filters: LocalTaskFilters): LocalTaskFilters {
  const { status, ...remainingFilters } = filters;
  const snapshot: LocalTaskFilters = status?.length ? { ...remainingFilters, status: [...status] } : remainingFilters;
  if (snapshot.tags) snapshot.tags = [...snapshot.tags];
  if (snapshot.tagIds) snapshot.tagIds = [...snapshot.tagIds];
  return snapshot;
}

async function withHubFilters(
  requestedFilters: TaskHubFilterIntent | undefined,
  operation: (isCurrent: () => boolean) => Promise<void>,
): Promise<void> {
  const scope = getScopeKey();
  const organizationId = sessionStore.getState().selectedOrganizationId?.trim();
  let isCurrent = true;
  const unsubscribe = sessionStore.subscribe(() => {
    if (getScopeKey() !== scope) isCurrent = false;
  });
  const filters =
    typeof requestedFilters === "function" || requestedFilters === undefined
      ? requestedFilters
      : normalizeFilters(requestedFilters);
  const prepare = async () => {
    if (!isCurrent) return;
    if (scope !== previousScope) {
      if (organizationId || previousScope !== undefined) localTaskStore.getState().setHubFilters({});
      previousScope = scope;
    }
    // Without a selected organization there is no SQLite key to read or write.
    if (!organizationId) {
      if (filters)
        localTaskStore
          .getState()
          .setHubFilters(
            normalizeFilters(typeof filters === "function" ? filters(localTaskStore.getState().hubFilters) : filters),
          );
      return;
    }
    const loaded = await taskHubPreferenceClient.load(organizationId);
    if (!isCurrent) return;
    // Hydration never writes defaults, including on a brand-new installation.
    const currentFilters = normalizeFilters(loaded.filters);
    localTaskStore.getState().setHubFilters(currentFilters);
    if (filters === undefined) return;
    const nextFilters = typeof filters === "function" ? filters(currentFilters) : filters;
    if (nextFilters === currentFilters) return;
    const saved = await taskHubPreferenceClient.save(organizationId, normalizeFilters(nextFilters));
    if (isCurrent) localTaskStore.getState().setHubFilters(normalizeFilters(saved.filters));
  };
  const preparation = organizationId ? pendingPreference.then(prepare) : prepare();
  // Serialize only preference I/O, not list requests. Failed operations cannot poison the queue.
  if (organizationId) pendingPreference = preparation.catch(() => undefined);
  try {
    await preparation;
    if (isCurrent) await operation(() => isCurrent);
  } catch (error) {
    if (isCurrent) throw error;
  } finally {
    unsubscribe();
  }
}

async function refreshHub(filters?: TaskHubFilterIntent): Promise<void> {
  const requestId = localTaskStore.getState().beginHubLoad();
  try {
    await withHubFilters(filters, async (isCurrent) => {
      const { hubFilters, hubSearchQuery } = localTaskStore.getState();
      // Tag filters are conjunctive. One unavailable ID makes the saved intent
      // unsatisfiable; never send an empty replacement that would match all tasks.
      const catalog = hubFilters.tagIds?.length ? await localTaskClient.listTagCatalog() : [];
      if (!isCurrent()) return;
      const hasMissingTag = hubFilters.tagIds?.some((id) => !catalog.some((tag) => tag.id === id));
      const [projection, progressingTasks] = await Promise.all([
        hasMissingTag
          ? Promise.resolve({ tasks: [], projectsById: {} })
          : localTaskClient.listProjection(hubFilters, hubSearchQuery.trim()),
        localTaskClient.list({ status: ["progressing"] }),
      ]);
      if (isCurrent())
        localTaskStore
          .getState()
          .setHubResults(requestId, projection.tasks, projection.projectsById, progressingTasks.length);
    });
  } catch (error) {
    localTaskStore.getState().setHubError(requestId, getErrorMessage(error));
  }
}

/** Restores daemon filter authority before requesting the Hub list. */
export async function refreshLocalTaskHub(): Promise<void> {
  await refreshHub();
}

/** Serializes user filter intents after hydration; only acknowledged writes are published. */
export async function setLocalTaskHubFilters(filters: TaskHubFilterIntent): Promise<void> {
  await refreshHub(filters);
}

/** Keeps search text memory-only and refreshes the current filter projection. */
export async function setLocalTaskHubSearchQuery(query: string): Promise<void> {
  localTaskStore.getState().setHubSearchQuery(query);
  await refreshLocalTaskHub();
}

/** Owns the mounted Hub's session subscription and invalidates in-flight scope responses. */
export function startTaskHub(refreshHubList = refreshLocalTaskHub): () => void {
  let scope = getScopeKey();
  const refresh = () => {
    // fire-and-forget: refreshHub owns loading and error state.
    void refreshHubList();
  };
  const unsubscribe = sessionStore.subscribe(() => {
    const nextScope = getScopeKey();
    if (scope === nextScope) return;
    scope = nextScope;
    localTaskStore.getState().setHubFilters({});
    localTaskStore.getState().setHubResults(localTaskStore.getState().beginHubLoad(), [], {}, 0);
    refresh();
  });
  refresh();
  return unsubscribe;
}

/** Restores saved intent after catalog mutations without rewriting scoped KV values. */
export async function reconcileTaskHubTagFilter(_removedTagId: string, _survivingTagId?: string): Promise<void> {
  await withHubFilters(undefined, async () => {});
}
