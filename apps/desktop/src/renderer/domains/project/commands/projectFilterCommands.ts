import { sessionStore } from "@renderer/domains/session";
import { loadProjectFilterPreference, saveProjectFilterPreference } from "../daemon/projectDaemonClient";
import { projectStore } from "../state/projectStore";

// Serialize hydration and writes, including rapid successive UI changes. Each
// command owns its short-lived scope subscription, including while queued.
let pendingFilterOperation: Promise<unknown> = Promise.resolve();

function inFilterScope(
  organizationId: string,
  operation: (isCurrent: () => boolean) => Promise<boolean>,
): Promise<boolean> {
  const session = sessionStore.getState();
  let isCurrent = true;
  const unsubscribe = sessionStore.subscribe((next) => {
    if (
      next.currentUserId !== session.currentUserId ||
      next.daemonId !== session.daemonId ||
      next.selectedOrganizationId !== session.selectedOrganizationId
    )
      isCurrent = false;
  });
  const pending = pendingFilterOperation
    .then(async () => {
      if (!organizationId || !isCurrent) return false;
      return operation(() => isCurrent);
    })
    .finally(unsubscribe);
  // A caller handles its own error; a rejected operation must not poison the queue.
  pendingFilterOperation = pending.then(
    () => undefined,
    () => undefined,
  );
  return pending;
}

async function hydrateFilter(organizationId: string, isCurrent: () => boolean): Promise<boolean> {
  let preference = await loadProjectFilterPreference(organizationId);
  if (!isCurrent()) return false;
  if (!preference.isInitialized) {
    // Only org-scoped legacy filters are safe to migrate. Never infer a filter
    // from the global display/default list or from knownProjectIds.
    const legacyIds = projectStore.getState().organizationPreferencesById?.[organizationId]?.displayProjectIds;
    preference = await saveProjectFilterPreference(organizationId, legacyIds, true);
    if (!isCurrent()) return false;
  }
  projectStore.getState().hydrateOrganizationProjectFilter(organizationId, preference.displayProjectIds);
  return true;
}

/** Hydrates SQLite authority (or imports legacy once) before snapshot defaults. */
export function hydrateProjectFilter(
  organizationId: string,
  isOriginCurrent: () => boolean = () => true,
): Promise<boolean> {
  return inFilterScope(organizationId, (isCurrent) => {
    const isValid = () => isCurrent() && isOriginCurrent();
    return isValid() ? hydrateFilter(organizationId, isValid) : Promise.resolve(false);
  });
}

/** Persists a user filter only after hydration; failed writes never publish it. */
export function writeProjectFilter(
  projectIds: string[] | ((current: string[], explicitIds: string[] | undefined) => string[] | undefined),
  organizationId = sessionStore.getState().selectedOrganizationId?.trim() ?? "",
): Promise<boolean> {
  const requestedIds = typeof projectIds === "function" ? projectIds : [...projectIds];
  return inFilterScope(organizationId, async (isCurrent) => {
    if (!(await hydrateFilter(organizationId, isCurrent))) return false;
    const state = projectStore.getState();
    const ids =
      typeof requestedIds === "function"
        ? requestedIds(state.displayProjectIds, state.organizationPreferencesById?.[organizationId]?.displayProjectIds)
        : requestedIds;
    // An absent filter means show all, including future projects; do not materialize it.
    if (ids === undefined) return isCurrent();
    const saved = await saveProjectFilterPreference(organizationId, ids);
    if (!isCurrent()) return false;
    projectStore.getState().hydrateOrganizationProjectFilter(organizationId, saved.displayProjectIds);
    return true;
  });
}
