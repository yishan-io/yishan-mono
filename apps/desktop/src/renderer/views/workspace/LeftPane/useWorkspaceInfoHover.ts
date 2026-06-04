import { useCallback, useEffect, useRef, useState } from "react";
import { inspectGitRepository } from "../../../commands/gitCommands";
import { workspaceStore } from "../../../store/workspaceStore";
import type { WorkspaceItem } from "../../../store/types";

type UseWorkspaceInfoHoverInput = {
  workspaces: WorkspaceItem[];
  displayWorkspaceIdByProjectId: Record<string, string>;
  closeDelayMs?: number;
};

/** Manages workspace hover popover lifecycle and branch preview loading. */
export function useWorkspaceInfoHover({
  workspaces,
  displayWorkspaceIdByProjectId,
  closeDelayMs = 120,
}: UseWorkspaceInfoHoverInput) {
  const [workspaceInfoAnchorEl, setWorkspaceInfoAnchorEl] = useState<HTMLElement | null>(null);
  const [hoveredWorkspaceId, setHoveredWorkspaceId] = useState("");
  const workspaceInfoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearWorkspaceInfoCloseTimer = useCallback(() => {
    if (!workspaceInfoCloseTimerRef.current) {
      return;
    }

    clearTimeout(workspaceInfoCloseTimerRef.current);
    workspaceInfoCloseTimerRef.current = null;
  }, []);

  const scheduleWorkspaceInfoClose = useCallback(() => {
    clearWorkspaceInfoCloseTimer();
    workspaceInfoCloseTimerRef.current = setTimeout(() => {
      setHoveredWorkspaceId("");
      setWorkspaceInfoAnchorEl(null);
      workspaceInfoCloseTimerRef.current = null;
    }, closeDelayMs);
  }, [clearWorkspaceInfoCloseTimer, closeDelayMs]);

  const handleWorkspaceInfoMouseEnter = useCallback(
    (workspaceId: string, anchorEl: HTMLElement) => {
      clearWorkspaceInfoCloseTimer();
      setHoveredWorkspaceId(workspaceId);
      setWorkspaceInfoAnchorEl(anchorEl);
    },
    [clearWorkspaceInfoCloseTimer],
  );

  const handleWorkspaceInfoMouseLeave = useCallback(() => {
    scheduleWorkspaceInfoClose();
  }, [scheduleWorkspaceInfoClose]);

  const handleWorkspaceInfoPopoverMouseEnter = useCallback(() => {
    clearWorkspaceInfoCloseTimer();
  }, [clearWorkspaceInfoCloseTimer]);

  const handleWorkspaceInfoPopoverMouseLeave = useCallback(() => {
    scheduleWorkspaceInfoClose();
  }, [scheduleWorkspaceInfoClose]);

  useEffect(() => {
    return () => {
      clearWorkspaceInfoCloseTimer();
    };
  }, [clearWorkspaceInfoCloseTimer]);

  // Fetch current branch on cache miss; subsequent hovers use the cached value
  // updated by the gitChanged → git.inspect pipeline.
  useEffect(() => {
    if (!hoveredWorkspaceId) {
      return;
    }

    const workspace = workspaces.find((ws) => ws.id === hoveredWorkspaceId);
    if (!workspace?.worktreePath?.trim()) {
      return;
    }

    // Already cached — nothing to do.
    if (workspaceStore.getState().currentBranchByWorkspaceId[hoveredWorkspaceId]) {
      return;
    }

    let cancelled = false;
    inspectGitRepository({ workspaceId: hoveredWorkspaceId })
      .then((result) => {
        if (!cancelled && result.currentBranch) {
          workspaceStore.getState().setWorkspaceCurrentBranch(hoveredWorkspaceId, result.currentBranch);
        }
      })
      .catch(() => {
        // Cache miss stays empty; branch column shows nothing.
      });

    return () => {
      cancelled = true;
    };
  }, [hoveredWorkspaceId, workspaces]);

  const hoveredWorkspace = workspaces.find((workspace) => workspace.id === hoveredWorkspaceId);
  const hoveredWorkspaceCurrentBranch = workspaceStore((state) => state.currentBranchByWorkspaceId[hoveredWorkspaceId] ?? "");
  const hoveredWorkspacePullRequest = workspaceStore((state) => state.pullRequestByWorkspaceId?.[hoveredWorkspaceId]);
  const hoveredWorkspaceLatestPullRequest = workspaceStore((state) => state.latestPullRequestByWorkspaceId?.[hoveredWorkspaceId]);
  const isHoveredWorkspacePrimary = Boolean(
    hoveredWorkspace &&
      (hoveredWorkspace.kind === "local" || displayWorkspaceIdByProjectId[hoveredWorkspace.repoId] === hoveredWorkspace.id),
  );
  const isWorkspaceInfoOpen = Boolean(workspaceInfoAnchorEl) && Boolean(hoveredWorkspace);

  return {
    workspaceInfoAnchorEl,
    hoveredWorkspace,
    hoveredWorkspaceCurrentBranch,
    hoveredWorkspacePullRequest,
    hoveredWorkspaceLatestPullRequest,
    isHoveredWorkspacePrimary,
    isWorkspaceInfoOpen,
    handleWorkspaceInfoMouseEnter,
    handleWorkspaceInfoMouseLeave,
    handleWorkspaceInfoPopoverMouseEnter,
    handleWorkspaceInfoPopoverMouseLeave,
  };
}
