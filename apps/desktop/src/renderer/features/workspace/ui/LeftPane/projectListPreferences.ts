import type { ProjectListPreference } from "../../../../rpc/daemonTypes";

export type HierarchyMode = "by_project" | "by_node";

export type FoldState = {
  foldedProjectIds: string[];
  foldedNodeKeys: string[];
};

export type OrderState = {
  projectOrderIds: string[];
  nodeOrderByParentId: Record<string, string[]>;
};

export const EMPTY_FOLD_STATE: FoldState = { foldedProjectIds: [], foldedNodeKeys: [] };
export const EMPTY_ORDER_STATE: OrderState = { projectOrderIds: [], nodeOrderByParentId: {} };

export const PUSH_DEBOUNCE_MS = 500;
export const FETCH_RETRY_BASE_MS = 1000;
export const FETCH_RETRY_MAX_MS = 8000;

/** Seeds per-mode fold/order state plus the shared workspace order from persisted preferences. */
export function seedFromPreferences(
  preferences: ProjectListPreference,
  setFoldStateByMode: React.Dispatch<React.SetStateAction<Record<HierarchyMode, FoldState>>>,
  setOrderStateByMode: React.Dispatch<React.SetStateAction<Record<HierarchyMode, OrderState>>>,
  setWorkspaceOrderByParentId: React.Dispatch<React.SetStateAction<Record<string, string[]>>>,
): void {
  setFoldStateByMode({
    by_project: {
      foldedProjectIds: preferences.by_project.foldedProjectIds,
      foldedNodeKeys: preferences.by_project.foldedNodeKeys,
    },
    by_node: {
      foldedProjectIds: preferences.by_node.foldedProjectIds,
      foldedNodeKeys: preferences.by_node.foldedNodeKeys,
    },
  });
  setOrderStateByMode({
    by_project: {
      projectOrderIds: preferences.by_project.projectOrderIds,
      nodeOrderByParentId: preferences.by_project.nodeOrderByParentId,
    },
    by_node: {
      projectOrderIds: preferences.by_node.projectOrderIds,
      nodeOrderByParentId: preferences.by_node.nodeOrderByParentId,
    },
  });
  setWorkspaceOrderByParentId(preferences.workspaceOrderByParentId);
}

/** Builds a serializable snapshot signature so no-op pushes can be skipped. */
export function buildSignatureFromState(
  orderStateByMode: Record<HierarchyMode, OrderState>,
  foldStateByMode: Record<HierarchyMode, FoldState>,
  workspaceOrderByParentId: Record<string, string[]>,
): string {
  return JSON.stringify({ orderStateByMode, foldStateByMode, workspaceOrderByParentId });
}

/** Builds the state-shape signature directly from a fetched preference payload. */
export function buildSignatureFromPreferences(preferences: ProjectListPreference): string {
  const orderStateByMode: Record<HierarchyMode, OrderState> = {
    by_project: {
      projectOrderIds: preferences.by_project.projectOrderIds,
      nodeOrderByParentId: preferences.by_project.nodeOrderByParentId,
    },
    by_node: {
      projectOrderIds: preferences.by_node.projectOrderIds,
      nodeOrderByParentId: preferences.by_node.nodeOrderByParentId,
    },
  };
  const foldStateByMode: Record<HierarchyMode, FoldState> = {
    by_project: {
      foldedProjectIds: preferences.by_project.foldedProjectIds,
      foldedNodeKeys: preferences.by_project.foldedNodeKeys,
    },
    by_node: {
      foldedProjectIds: preferences.by_node.foldedProjectIds,
      foldedNodeKeys: preferences.by_node.foldedNodeKeys,
    },
  };
  return buildSignatureFromState(orderStateByMode, foldStateByMode, preferences.workspaceOrderByParentId);
}

/** Builds the daemon payload from current state. */
export function buildPushPayload(
  orderStateByMode: Record<HierarchyMode, OrderState>,
  foldStateByMode: Record<HierarchyMode, FoldState>,
  workspaceOrderByParentId: Record<string, string[]>,
): ProjectListPreference {
  const modePreference = (mode: HierarchyMode) => ({
    projectOrderIds: orderStateByMode[mode].projectOrderIds,
    nodeOrderByParentId: orderStateByMode[mode].nodeOrderByParentId,
    foldedProjectIds: foldStateByMode[mode].foldedProjectIds,
    foldedNodeKeys: foldStateByMode[mode].foldedNodeKeys,
  });
  return {
    version: 1,
    by_project: modePreference("by_project"),
    by_node: modePreference("by_node"),
    workspaceOrderByParentId,
  };
}
