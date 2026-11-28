import { projectStore } from "@renderer/domains/project";

import { sessionStore } from "@renderer/domains/session";
import { useEffect, useState } from "react";
import { useWorkspaceNavigatorPersistence } from "./useWorkspaceNavigatorPersistence";
import { EMPTY_FOLD_STATE, EMPTY_ORDER_STATE, type FoldState, type OrderState } from "./workspaceNavigatorPreferences";

export type WorkspaceNavigatorFoldStateResult = {
  projectOrderIds: string[];
  workspaceOrderByParentId: Record<string, string[]>;
  foldedProjectIds: string[];
  setProjectOrderIds: (next: string[]) => void;
  setWorkspaceOrderByParentId: (updater: (prev: Record<string, string[]>) => Record<string, string[]>) => void;
  setFoldedProjectIds: (updater: string[] | ((prev: string[]) => string[])) => void;
  toggleProjectFold: (projectId: string) => void;
};

/**
 * Owns the left-pane project list fold and order state and persists it per
 * organization via useWorkspaceNavigatorPersistence.
 */
export function useWorkspaceNavigatorFoldState(): WorkspaceNavigatorFoldStateResult {
  const displayProjectIds = projectStore((state) => state.displayProjectIds) ?? [];
  const selectedOrganizationId = sessionStore((state) => state.selectedOrganizationId) ?? "";

  const [foldState, setFoldState] = useState<FoldState>(EMPTY_FOLD_STATE);
  const [orderState, setOrderState] = useState<OrderState>(EMPTY_ORDER_STATE);
  const [workspaceOrderByParentId, updateWorkspaceOrderByParentId] = useState<Record<string, string[]>>({});

  useWorkspaceNavigatorPersistence({
    organizationId: selectedOrganizationId,
    orderState,
    foldState,
    workspaceOrderByParentId,
    setFoldState,
    setOrderState,
    setWorkspaceOrderByParentId: updateWorkspaceOrderByParentId,
  });

  // Prune order ids no longer in the display filter so re-checked projects
  // append at the end.
  useEffect(() => {
    setOrderState((current) => {
      const prev = current.projectOrderIds;
      const next = prev.filter((id) => displayProjectIds.includes(id));
      if (next.length === prev.length) {
        return current;
      }

      return { ...current, projectOrderIds: next };
    });
  }, [displayProjectIds]);

  const setProjectOrderIds = (next: string[]) => {
    setOrderState((current) => ({ ...current, projectOrderIds: next }));
  };
  const setWorkspaceOrderByParentId = (updater: (prev: Record<string, string[]>) => Record<string, string[]>) => {
    updateWorkspaceOrderByParentId((current) => updater(current));
  };

  const setFoldedProjectIds = (updater: string[] | ((prev: string[]) => string[])) => {
    setFoldState((current) => ({
      ...current,
      foldedProjectIds: typeof updater === "function" ? updater(current.foldedProjectIds) : updater,
    }));
  };

  const toggleProjectFold = (projectId: string) => {
    setFoldedProjectIds((current) =>
      current.includes(projectId) ? current.filter((item) => item !== projectId) : [...current, projectId],
    );
  };

  return {
    projectOrderIds: orderState.projectOrderIds,
    workspaceOrderByParentId,
    foldedProjectIds: foldState.foldedProjectIds,
    setProjectOrderIds,
    setWorkspaceOrderByParentId,
    setFoldedProjectIds,
    toggleProjectFold,
  };
}
