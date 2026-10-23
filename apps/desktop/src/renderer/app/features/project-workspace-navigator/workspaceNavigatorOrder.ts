/**
 * Reorders an array of IDs by moving `draggedId` to just before or after `targetId`.
 */
export function reorderIds(input: {
  ids: string[];
  draggedId: string;
  targetId: string;
  position: "before" | "after";
}): string[] {
  const draggedIndex = input.ids.indexOf(input.draggedId);
  const targetIndex = input.ids.indexOf(input.targetId);
  if (draggedIndex < 0 || targetIndex < 0) {
    return input.ids;
  }

  const nextIds = [...input.ids];
  const [movedId] = nextIds.splice(draggedIndex, 1);
  if (!movedId) {
    return input.ids;
  }

  const nextTargetIndex = nextIds.indexOf(input.targetId);
  if (nextTargetIndex < 0) {
    return input.ids;
  }

  const insertIndex = input.position === "after" ? nextTargetIndex + 1 : nextTargetIndex;
  nextIds.splice(insertIndex, 0, movedId);
  return nextIds;
}

/**
 * Merge a stored order list with the current live set of IDs.
 * - IDs no longer in liveIds are stripped (unchecked / removed items).
 * - IDs in liveIds but absent from storedOrder are appended at the end
 *   (newly added / re-checked items).
 * The relative order of retained IDs is preserved from storedOrder.
 */
export function reconcileOrder(storedOrder: string[], liveIds: string[]): string[] {
  const liveSet = new Set(liveIds);
  const retained = storedOrder.filter((id) => liveSet.has(id));
  const retainedSet = new Set(retained);
  const appended = liveIds.filter((id) => !retainedSet.has(id));
  return [...retained, ...appended];
}

/** Parses the project ID from a tree row ID like "project:nodeId:projectId". */
export function parseProjectRowProjectId(rowId: string): string {
  const value = rowId.replace(/^project:/, "");
  const splitIndex = value.indexOf(":");
  if (splitIndex < 0) {
    return value;
  }
  return value.slice(splitIndex + 1);
}

/** Parses the node ID from a tree row ID like "node:parentId:nodeId". */
export function parseNodeRowNodeId(rowId: string): string {
  const value = rowId.replace(/^node:/, "");
  const splitIndex = value.indexOf(":");
  if (splitIndex < 0) {
    return value;
  }
  return value.slice(splitIndex + 1);
}

/** Builds a total sibling order: saved ranks, then creation time (unknown last), then immutable ID. */
export function createNavigatorOrderComparator(storedOrder: string[]) {
  const rankById = new Map(storedOrder.map((id, index) => [id, index]));
  const getCreatedTime = (createdAt: string | undefined) => {
    const timestamp = createdAt ? Date.parse(createdAt) : Number.NaN;
    return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
  };
  return (a: { id: string; createdAt?: string }, b: { id: string; createdAt?: string }): number => {
    const rankA = rankById.get(a.id) ?? Number.POSITIVE_INFINITY;
    const rankB = rankById.get(b.id) ?? Number.POSITIVE_INFINITY;
    if (rankA !== rankB) {
      return rankA < rankB ? -1 : 1;
    }
    const timeA = getCreatedTime(a.createdAt);
    const timeB = getCreatedTime(b.createdAt);
    if (timeA !== timeB) {
      return timeA < timeB ? -1 : 1;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };
}
