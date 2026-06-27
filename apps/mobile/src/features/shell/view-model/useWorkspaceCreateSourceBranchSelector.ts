import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ProjectWithWorkspaces } from "@/features/projects/projects.types";
import type { WorkspaceCreateNodeOption } from "@/features/workspaces/create";
import { useWorkspaceBranchesQuery } from "@/features/workspaces/queries/useWorkspaceBranchesQuery";
import { getErrorMessage } from "@/helpers/errorHelpers";
import {
  type WorkspaceCreateDraft,
  listWorkspaceCreateSourceBranches,
  resolvePreferredWorkspaceCreateSourceBranch,
  resolveWorkspaceCreateSourceBranchGroups,
  syncWorkspaceCreateLoadedSourceBranch,
} from "../commands/workspace-create-sheet-domain";

export function useWorkspaceCreateSourceBranchSelector({
  draft,
  onChangeSourceBranch,
  open,
  project,
  selectedNode,
}: {
  draft: WorkspaceCreateDraft;
  onChangeSourceBranch: (sourceBranch: string) => void;
  open: boolean;
  project: ProjectWithWorkspaces | null;
  selectedNode: WorkspaceCreateNodeOption | null;
}) {
  const [isSourceBranchSelectorOpen, setIsSourceBranchSelectorOpen] = useState(false);
  const selectedWorkspaceId = selectedNode?.workspaceId ?? "";
  const lastSelectedWorkspaceIdRef = useRef(selectedWorkspaceId);
  const sourceBranchQuery = useWorkspaceBranchesQuery(
    project?.organizationId ?? "",
    project?.id ?? "",
    selectedWorkspaceId,
    {
      enabled: open && isSourceBranchSelectorOpen && !!project && selectedWorkspaceId.length > 0,
      nodeId: selectedNode?.nodeId ?? null,
    },
  );

  useEffect(() => {
    if (!open) {
      setIsSourceBranchSelectorOpen(false);
    }
  }, [open]);

  useEffect(() => {
    if (lastSelectedWorkspaceIdRef.current === selectedWorkspaceId) {
      return;
    }

    lastSelectedWorkspaceIdRef.current = selectedWorkspaceId;
    setIsSourceBranchSelectorOpen(false);
  }, [selectedWorkspaceId]);

  const sourceBranchGroups = useMemo(
    () => resolveWorkspaceCreateSourceBranchGroups(sourceBranchQuery.data),
    [sourceBranchQuery.data],
  );
  const sourceBranchOptions = useMemo(
    () => listWorkspaceCreateSourceBranches(sourceBranchGroups),
    [sourceBranchGroups],
  );
  const preferredSourceBranch = useMemo(
    () =>
      resolvePreferredWorkspaceCreateSourceBranch({
        branchList: sourceBranchQuery.data,
        fallbackSourceBranch: selectedNode?.sourceBranch ?? "",
      }),
    [selectedNode?.sourceBranch, sourceBranchQuery.data],
  );

  useEffect(() => {
    const nextDraft = syncWorkspaceCreateLoadedSourceBranch(draft, {
      availableSourceBranches: sourceBranchOptions,
      preferredSourceBranch,
    });

    if (nextDraft.sourceBranch !== draft.sourceBranch) {
      onChangeSourceBranch(nextDraft.sourceBranch);
    }
  }, [draft, onChangeSourceBranch, preferredSourceBranch, sourceBranchOptions]);

  const sourceBranchError =
    sourceBranchQuery.isError && sourceBranchQuery.error ? getErrorMessage(sourceBranchQuery.error) : "";

  const handleOpenSourceBranchSelector = useCallback(() => {
    if (!selectedNode) {
      return;
    }

    setIsSourceBranchSelectorOpen(true);
  }, [selectedNode]);

  const handleCloseSourceBranchSelector = useCallback(() => {
    setIsSourceBranchSelectorOpen(false);
  }, []);

  const handleSelectSourceBranch = useCallback(
    (sourceBranch: string) => {
      onChangeSourceBranch(sourceBranch);
      setIsSourceBranchSelectorOpen(false);
    },
    [onChangeSourceBranch],
  );

  return {
    handleCloseSourceBranchSelector,
    handleOpenSourceBranchSelector,
    handleRetrySourceBranches: sourceBranchQuery.refetch,
    handleSelectSourceBranch,
    isLoadingSourceBranches: sourceBranchQuery.isPending,
    isSourceBranchSelectorDisabled: !selectedNode,
    isSourceBranchSelectorOpen,
    sourceBranchError,
    sourceBranchGroups,
    sourceBranchOptions,
  };
}
