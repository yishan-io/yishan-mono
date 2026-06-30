import { useCallback, useEffect, useMemo, useState } from "react";

import type { Node } from "@/features/nodes/nodes.types";
import type { ProjectWithWorkspaces } from "@/features/projects/projects.types";
import { type WorkspaceCreateNodeOption, resolveWorkspaceCreateNodeOptions } from "@/features/workspaces/create";
import {
  createEmptyWorkspaceCreateDraft,
  resolveWorkspaceCreateSelectedNodeId,
  syncWorkspaceCreateSourceBranch,
  syncWorkspaceCreateTargetBranch,
} from "../commands/workspace-create-sheet-domain";

export function useWorkspaceCreateSheetDraft({
  currentNodeId,
  currentNodes,
  open,
  project,
}: {
  currentNodeId: string | null;
  currentNodes: Node[];
  open: boolean;
  project: ProjectWithWorkspaces | null;
}) {
  const [draft, setDraft] = useState(createEmptyWorkspaceCreateDraft);

  const nodeOptions = useMemo(
    () => (project ? resolveWorkspaceCreateNodeOptions({ currentNodes, project }) : []),
    [currentNodes, project],
  );
  const selectedNode = useMemo(
    () => nodeOptions.find((option) => option.nodeId === draft.selectedNodeId) ?? null,
    [draft.selectedNodeId, nodeOptions],
  );

  const resetDraft = useCallback(() => {
    setDraft(createEmptyWorkspaceCreateDraft());
  }, []);

  useEffect(() => {
    if (!open) {
      resetDraft();
      return;
    }

    if (nodeOptions.length === 0) {
      return;
    }

    setDraft((current) => {
      const selectedNodeId = resolveWorkspaceCreateSelectedNodeId({
        currentNodeId,
        currentSelectedNodeId: current.selectedNodeId,
        nodeOptions,
      });

      return current.selectedNodeId === selectedNodeId ? current : { ...current, selectedNodeId };
    });
  }, [currentNodeId, nodeOptions, open, resetDraft]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setDraft((current) => syncWorkspaceCreateSourceBranch(current, selectedNode));
  }, [open, selectedNode]);

  const handleSelectNode = useCallback((option: WorkspaceCreateNodeOption) => {
    setDraft((current) => ({
      ...current,
      selectedNodeId: option.nodeId,
      sourceBranch: option.sourceBranch,
    }));
  }, []);

  const handleChangeSourceBranch = useCallback((sourceBranch: string) => {
    setDraft((current) => ({ ...current, sourceBranch }));
  }, []);

  return {
    handleChangeTargetBranch: (targetBranch: string) =>
      setDraft((current) => ({
        ...current,
        hasEditedTargetBranch: true,
        targetBranch,
      })),
    handleSelectNode,
    name: draft.name,
    nodeOptions,
    onChangeName: (name: string) =>
      setDraft((current) =>
        syncWorkspaceCreateTargetBranch({
          ...current,
          name,
        }),
      ),
    onChangeSourceBranch: handleChangeSourceBranch,
    resetDraft,
    selectedNode,
    sourceBranch: draft.sourceBranch,
    targetBranch: draft.targetBranch,
    workspaceCreateDraft: draft,
  };
}
