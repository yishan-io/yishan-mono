import { projectStore } from "@renderer/domains/project";
import { useSelectedOrganizationId } from "@renderer/domains/session";
import { useEffect, useState } from "react";
import { useWorkspaceNavigatorPersistence } from "./useWorkspaceNavigatorPersistence";
import {
  EMPTY_FOLD_STATE,
  EMPTY_ORDER_STATE,
  type FoldState,
  type HierarchyMode,
  type OrderState,
} from "./workspaceNavigatorPreferences";

export type WorkspaceNavigatorFoldStateResult = {
  projectOrderIds: string[];
  nodeOrderByParentId: Record<string, string[]>;
  workspaceOrderByParentId: Record<string, string[]>;
  foldedProjectIds: string[];
  foldedNodeKeys: string[];
  setProjectOrderIds: (next: string[]) => void;
  setNodeOrderByParentId: (updater: (prev: Record<string, string[]>) => Record<string, string[]>) => void;
  setWorkspaceOrderByParentId: (updater: (prev: Record<string, string[]>) => Record<string, string[]>) => void;
  setFoldedProjectIds: (updater: string[] | ((prev: string[]) => string[])) => void;
  setFoldedNodeKeys: (updater: string[] | ((prev: string[]) => string[])) => void;
  toggleProjectFold: (projectId: string) => void;
  workspaceListHierarchyMode: HierarchyMode;
};

/**
 * Owns the left-pane project list fold and order state and persists it per
 * organization via useWorkspaceNavigatorPersistence.
 *
 * Project/node order and fold state are stored per mode so that switching
 * between by_project and by_node gives a fully isolated arrangement for each
 * mode without cross-mode bleed. Workspace order is shared across modes: the
 * same workspaces hang under the same projectId:nodeId groups in both modes,
 * so reordering workspaces in one mode must apply to the other.
 */
export function useWorkspaceNavigatorFoldState(): WorkspaceNavigatorFoldStateResult {
  const displayProjectIds = projectStore((state) => state.displayProjectIds) ?? [];
  const workspaceListHierarchyMode = projectStore((state) => state.workspaceListHierarchyMode);
  const activeHierarchyMode: HierarchyMode = workspaceListHierarchyMode === "by_node" ? "by_node" : "by_project";
  const selectedOrganizationId = useSelectedOrganizationId() ?? "";

  const [foldStateByMode, setFoldStateByMode] = useState<Record<HierarchyMode, FoldState>>({
    by_project: EMPTY_FOLD_STATE,
    by_node: EMPTY_FOLD_STATE,
  });

  const [orderStateByMode, setOrderStateByMode] = useState<Record<HierarchyMode, OrderState>>({
    by_project: EMPTY_ORDER_STATE,
    by_node: EMPTY_ORDER_STATE,
  });

  const [workspaceOrderByParentId, updateWorkspaceOrderByParentId] = useState<Record<string, string[]>>({}); // shared across modes

  useWorkspaceNavigatorPersistence({
    organizationId: selectedOrganizationId,
    orderStateByMode,
    foldStateByMode,
    workspaceOrderByParentId,
    setFoldStateByMode,
    setOrderStateByMode,
    setWorkspaceOrderByParentId: updateWorkspaceOrderByParentId,
  });

  // Prune by_project order ids no longer in the display filter so re-checked
  // projects append at the end; by_node order is unaffected by the filter.
  useEffect(() => {
    setOrderStateByMode((current) => {
      const prev = current.by_project.projectOrderIds;
      const next = prev.filter((id) => displayProjectIds.includes(id));
      if (next.length === prev.length) {
        return current;
      }

      return {
        ...current,
        by_project: { ...current.by_project, projectOrderIds: next },
      };
    });
  }, [displayProjectIds]);

  const projectOrderIds = orderStateByMode[activeHierarchyMode].projectOrderIds;
  const nodeOrderByParentId = orderStateByMode[activeHierarchyMode].nodeOrderByParentId;

  const setProjectOrderIds = (next: string[]) => {
    setOrderStateByMode((current) => ({
      ...current,
      [activeHierarchyMode]: { ...current[activeHierarchyMode], projectOrderIds: next },
    }));
  };
  const setNodeOrderByParentId = (updater: (prev: Record<string, string[]>) => Record<string, string[]>) => {
    setOrderStateByMode((current) => ({
      ...current,
      [activeHierarchyMode]: {
        ...current[activeHierarchyMode],
        nodeOrderByParentId: updater(current[activeHierarchyMode].nodeOrderByParentId),
      },
    }));
  };
  const setWorkspaceOrderByParentId = (updater: (prev: Record<string, string[]>) => Record<string, string[]>) => {
    updateWorkspaceOrderByParentId((current) => updater(current));
  };

  const foldedProjectIds = foldStateByMode[activeHierarchyMode].foldedProjectIds;
  const foldedNodeKeys = foldStateByMode[activeHierarchyMode].foldedNodeKeys;
  const setFoldedProjectIds = (updater: string[] | ((prev: string[]) => string[])) => {
    setFoldStateByMode((current) => ({
      ...current,
      [activeHierarchyMode]: {
        ...current[activeHierarchyMode],
        foldedProjectIds:
          typeof updater === "function" ? updater(current[activeHierarchyMode].foldedProjectIds) : updater,
      },
    }));
  };
  const setFoldedNodeKeys = (updater: string[] | ((prev: string[]) => string[])) => {
    setFoldStateByMode((current) => ({
      ...current,
      [activeHierarchyMode]: {
        ...current[activeHierarchyMode],
        foldedNodeKeys: typeof updater === "function" ? updater(current[activeHierarchyMode].foldedNodeKeys) : updater,
      },
    }));
  };

  const toggleProjectFold = (projectId: string) => {
    setFoldedProjectIds((current) =>
      current.includes(projectId) ? current.filter((item) => item !== projectId) : [...current, projectId],
    );
  };

  return {
    projectOrderIds,
    nodeOrderByParentId,
    workspaceOrderByParentId,
    foldedProjectIds,
    foldedNodeKeys,
    setProjectOrderIds,
    setNodeOrderByParentId,
    setWorkspaceOrderByParentId,
    setFoldedProjectIds,
    setFoldedNodeKeys,
    toggleProjectFold,
    workspaceListHierarchyMode: activeHierarchyMode,
  };
}
