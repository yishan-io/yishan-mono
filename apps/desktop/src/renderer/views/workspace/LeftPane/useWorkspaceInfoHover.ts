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
  const [hoveredWorkspaceCurrentBranch, setHoveredWorkspaceCurrentBranch] = useState("");
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
      setHoveredWorkspaceCurrentBranch("");
      setWorkspaceInfoAnchorEl(null);
      workspaceInfoCloseTimerRef.current = null;
    }, closeDelayMs);
  }, [clearWorkspaceInfoCloseTimer, closeDelayMs]);

  const handleWorkspaceInfoMouseEnter = useCallback(
    (workspaceId: string, anchorEl: HTMLElement) => {
      clearWorkspaceInfoCloseTimer();
      setHoveredWorkspaceCurrentBranch((currentBranch) => {
        if (workspaceId !== hoveredWorkspaceId) {
          return "";
        }
        return currentBranch;
      });
      setHoveredWorkspaceId(workspaceId);
      setWorkspaceInfoAnchorEl(anchorEl);
    },
    [clearWorkspaceInfoCloseTimer, hoveredWorkspaceId],
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

  useEffect(() => {
    if (!hoveredWorkspaceId) {
      setHoveredWorkspaceCurrentBranch("");
      return;
    }

    const workspace = workspaces.find((ws) => ws.id === hoveredWorkspaceId);
    const worktreePath = workspace?.worktreePath?.trim();
    if (!worktreePath) {
      setHoveredWorkspaceCurrentBranch("");
      return;
    }

    let cancelled = false;
    inspectGitRepository({ path: worktreePath }).then((result) => {
        if (!cancelled) {
          setHoveredWorkspaceCurrentBranch(result.currentBranch || "");
        }
      }).catch(() => {
        if (!cancelled) {
          setHoveredWorkspaceCurrentBranch("");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hoveredWorkspaceId, workspaces]);

  const hoveredWorkspace = workspaces.find((workspace) => workspace.id === hoveredWorkspaceId);
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
