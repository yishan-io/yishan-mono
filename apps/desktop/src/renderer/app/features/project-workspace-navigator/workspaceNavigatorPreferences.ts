import type { ProjectListPreference } from "@renderer/domains/project";

export type FoldState = {
  foldedProjectIds: string[];
};

export type OrderState = {
  projectOrderIds: string[];
};

export const EMPTY_FOLD_STATE: FoldState = { foldedProjectIds: [] };
export const EMPTY_ORDER_STATE: OrderState = { projectOrderIds: [] };

export const PUSH_DEBOUNCE_MS = 500;
export const FETCH_RETRY_BASE_MS = 1000;
export const FETCH_RETRY_MAX_MS = 8000;

/** Seeds fold/order state plus the workspace order from persisted preferences. */
export function seedFromPreferences(
  preferences: ProjectListPreference,
  setFoldState: React.Dispatch<React.SetStateAction<FoldState>>,
  setOrderState: React.Dispatch<React.SetStateAction<OrderState>>,
  setWorkspaceOrderByParentId: React.Dispatch<React.SetStateAction<Record<string, string[]>>>,
): void {
  setFoldState({ foldedProjectIds: preferences.by_project.foldedProjectIds });
  setOrderState({ projectOrderIds: preferences.by_project.projectOrderIds });
  setWorkspaceOrderByParentId(preferences.workspaceOrderByParentId);
}

/** Builds a serializable snapshot signature so no-op pushes can be skipped. */
export function buildSignatureFromState(
  orderState: OrderState,
  foldState: FoldState,
  workspaceOrderByParentId: Record<string, string[]>,
): string {
  return JSON.stringify({ orderState, foldState, workspaceOrderByParentId });
}

/** Builds the state-shape signature directly from a fetched preference payload. */
export function buildSignatureFromPreferences(preferences: ProjectListPreference): string {
  return buildSignatureFromState(
    { projectOrderIds: preferences.by_project.projectOrderIds },
    { foldedProjectIds: preferences.by_project.foldedProjectIds },
    preferences.workspaceOrderByParentId,
  );
}

/** Builds the daemon payload from current state. */
export function buildPushPayload(
  orderState: OrderState,
  foldState: FoldState,
  workspaceOrderByParentId: Record<string, string[]>,
): ProjectListPreference {
  return {
    version: 1,
    by_project: {
      projectOrderIds: orderState.projectOrderIds,
      foldedProjectIds: foldState.foldedProjectIds,
    },
    workspaceOrderByParentId,
  };
}
