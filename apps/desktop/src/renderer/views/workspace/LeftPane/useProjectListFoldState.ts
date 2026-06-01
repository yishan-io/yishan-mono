import { useEffect, useState } from "react";
import { workspaceStore } from "../../../store/workspaceStore";

type HierarchyMode = "by_project" | "by_node";

type FoldState = {
  foldedProjectIds: string[];
  foldedNodeKeys: string[];
};

type OrderState = {
  projectOrderIds: string[];
  nodeOrderByParentId: Record<string, string[]>;
};

export type ProjectListFoldStateResult = {
  projectOrderIds: string[];
  nodeOrderByParentId: Record<string, string[]>;
  foldedProjectIds: string[];
  foldedNodeKeys: string[];
  setProjectOrderIds: (next: string[]) => void;
  setNodeOrderByParentId: (updater: (prev: Record<string, string[]>) => Record<string, string[]>) => void;
  setFoldedProjectIds: (updater: string[] | ((prev: string[]) => string[])) => void;
  setFoldedNodeKeys: (updater: string[] | ((prev: string[]) => string[])) => void;
  toggleProjectFold: (projectId: string) => void;
  workspaceListHierarchyMode: HierarchyMode;
};

/**
 * Manages per-hierarchy-mode fold and order state for the project list.
 *
 * State is stored per mode so that switching between by_project and by_node
 * gives a fully isolated, clean state for each mode without cross-mode bleed.
 */
export function useProjectListFoldState(): ProjectListFoldStateResult {
  const displayProjectIds = workspaceStore((state) => state.displayProjectIds) ?? [];
  const workspaceListHierarchyMode = workspaceStore((state) => state.workspaceListHierarchyMode);
  const activeHierarchyMode: HierarchyMode = workspaceListHierarchyMode === "by_node" ? "by_node" : "by_project";

  const [foldStateByMode, setFoldStateByMode] = useState<Record<HierarchyMode, FoldState>>({
    by_project: { foldedProjectIds: [], foldedNodeKeys: [] },
    by_node: { foldedProjectIds: [], foldedNodeKeys: [] },
  });

  const [orderStateByMode, setOrderStateByMode] = useState<Record<HierarchyMode, OrderState>>({
    by_project: { projectOrderIds: [], nodeOrderByParentId: {} },
    by_node: { projectOrderIds: [], nodeOrderByParentId: {} },
  });

  // Keep projectOrderIds in sync with the filter: remove any ID that is no
  // longer in displayProjectIds so that re-checked projects are appended to
  // the end of the list (treated as new) rather than snapping back to their
  // old position. Applied only to the by_project mode bucket since
  // displayProjectIds does not affect by_node project order (controlled by
  // per-node drag order instead).
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
        foldedNodeKeys:
          typeof updater === "function" ? updater(current[activeHierarchyMode].foldedNodeKeys) : updater,
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
    foldedProjectIds,
    foldedNodeKeys,
    setProjectOrderIds,
    setNodeOrderByParentId,
    setFoldedProjectIds,
    setFoldedNodeKeys,
    toggleProjectFold,
    workspaceListHierarchyMode: activeHierarchyMode,
  };
}
