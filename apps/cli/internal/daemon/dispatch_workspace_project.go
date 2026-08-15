package daemon

import (
	"context"
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"

	"yishan/apps/cli/internal/workspace"

	"github.com/rs/zerolog/log"
)

func normalizeWorkspaceOpenProjectPath(path string) string {
	trimmedPath := strings.TrimSpace(path)
	if trimmedPath == "" {
		return ""
	}
	absolutePath, err := filepath.Abs(trimmedPath)
	if err != nil {
		return filepath.Clean(trimmedPath)
	}
	resolvedPath, err := filepath.EvalSymlinks(absolutePath)
	if err == nil {
		return resolvedPath
	}
	return filepath.Clean(absolutePath)
}

func shouldSkipWorkspaceOpenProject(existing workspace.Workspace, entry workspaceOpenProjectEntry) bool {
	return normalizeWorkspaceOpenProjectPath(existing.Path) == normalizeWorkspaceOpenProjectPath(entry.WorktreePath) &&
		strings.TrimSpace(existing.ProjectID) == strings.TrimSpace(entry.ProjectID) &&
		strings.TrimSpace(existing.OrgID) == strings.TrimSpace(entry.OrgID)
}

func (h *JSONRPCHandler) openProjectWorkspace(entry workspaceOpenProjectEntry) (string, bool, error) {
	workspaceID := strings.TrimSpace(entry.WorkspaceID)
	workspacePath := strings.TrimSpace(entry.WorktreePath)
	if workspaceID == "" || workspacePath == "" {
		return "", false, fmt.Errorf("missing workspaceId or worktreePath")
	}
	if existingWorkspace, err := h.getWorkspace(workspaceID); err == nil {
		if shouldSkipWorkspaceOpenProject(existingWorkspace, entry) {
			// The workspace is already open (for example restored from the local
			// DB at daemon boot). Watch registration is idempotent per worktree
			// path, so ensure the filesystem watcher exists even on the skip
			// path; otherwise file-change events never flow for this workspace.
			if existingWorkspace.State == workspace.StateActive && strings.TrimSpace(existingWorkspace.Path) != "" {
				h.nodeApp.WatchAndTrack(existingWorkspace.ID, existingWorkspace.Path)
			}
			return workspaceID, false, nil
		}
	}
	openedWorkspace, err := h.manager.Open(workspace.OpenRequest{
		ID:        workspaceID,
		Path:      workspacePath,
		ProjectID: entry.ProjectID,
		OrgID:     entry.OrgID,
	})
	if err != nil {
		return workspaceID, false, err
	}
	h.nodeApp.WatchAndTrack(openedWorkspace.ID, openedWorkspace.Path)
	return openedWorkspace.ID, true, nil
}

func (h *JSONRPCHandler) handleWorkspaceOpenProject(_ context.Context, params json.RawMessage) (any, error) {
	var req workspaceOpenProjectParams
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}

	opened, skipped, openErrors := []string{}, []string{}, []string{}
	for _, entry := range req.Workspaces {
		workspaceID, didOpenWorkspace, err := h.openProjectWorkspace(entry)
		if err != nil {
			if workspaceID != "" {
				log.Warn().Err(err).Str("workspaceId", workspaceID).Str("path", strings.TrimSpace(entry.WorktreePath)).
					Msg("workspace.openProject: failed to open workspace")
				openErrors = append(openErrors, workspaceID+": "+err.Error())
				continue
			}
			openErrors = append(openErrors, err.Error())
			continue
		}
		if didOpenWorkspace {
			opened = append(opened, workspaceID)
			continue
		}
		skipped = append(skipped, workspaceID)
	}
	if len(opened) > 0 && h.tokenUsage != nil {
		h.tokenUsage.RequestRecentRecoveryScan("workspace.openProject")
	}

	return workspaceOpenProjectResult{
		Opened:  opened,
		Skipped: skipped,
		Errors:  openErrors,
	}, nil
}

func (h *JSONRPCHandler) handleWorkspaceCloseProject(_ context.Context, params json.RawMessage) (any, error) {
	var req workspaceCloseProjectParams
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}

	stopped := []string{}
	for _, wsID := range req.WorkspaceIDs {
		wsID = strings.TrimSpace(wsID)
		if wsID == "" {
			continue
		}
		h.manager.Terminals().StopAllForWorkspace(wsID)
		stopped = append(stopped, wsID)
	}

	return workspaceCloseProjectResult{Stopped: stopped}, nil
}
