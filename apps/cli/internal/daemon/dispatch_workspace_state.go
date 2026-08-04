package daemon

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"time"

	"yishan/apps/cli/internal/workspace"

	"github.com/rs/zerolog/log"
)

const workspaceHealthCheckInterval = 15 * time.Second

func (h *JSONRPCHandler) handleWorkspaceHealth(ctx context.Context, params json.RawMessage) (any, error) {
	var req workspaceHealthParams
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}

	ws, err := h.manager.GetWorkspace(req.WorkspaceID)
	if err != nil {
		return nil, err
	}

	state, health, healthErr, err := h.refreshWorkspaceHealth(ctx, req.WorkspaceID)
	if err != nil {
		return nil, err
	}

	return workspaceHealthResult{
		WorkspaceID: req.WorkspaceID,
		State:       state,
		Health:      health,
		Path:        ws.Path,
		Error:       healthErr,
	}, nil
}

// refreshWorkspaceHealth re-checks a workspace's path/worktree health,
// transitions its state (active → error), persists the change, and emits a
// workspace state changed event. Returns the resolved state, health detail,
// and any health-check error message.
func (h *JSONRPCHandler) refreshWorkspaceHealth(ctx context.Context, workspaceID string) (string, string, string, error) {
	ws, err := h.manager.GetWorkspace(workspaceID)
	if err != nil {
		return "", "", "", err
	}

	state := workspace.WorkspaceStateActive
	health := ""
	healthErr := ""

	if _, statErr := os.Stat(ws.Path); statErr != nil {
		state = workspace.WorkspaceStateError
		health = workspace.WorkspaceHealthPathMissing
		healthErr = statErr.Error()
	}

	if healthErr == "" {
		isWorktree, checkErr := isGitWorktree(ws.Path)
		if checkErr != nil {
			state = workspace.WorkspaceStateError
			health = workspace.WorkspaceHealthPathMissing
			healthErr = checkErr.Error()
		} else if !isWorktree {
			state = workspace.WorkspaceStateError
			health = workspace.WorkspaceHealthNotWorktree
		}
	}

	if err := h.manager.SetWorkspaceState(workspaceID, state, health); err != nil {
		return "", "", "", err
	}

	if state == workspace.WorkspaceStateError {
		h.watchers.Unwatch(ws.Path)
		h.prTracker.StopTracking(workspaceID)
	}

	if err := h.updatePersistedWorkspaceState(ctx, workspaceID, state, health); err != nil {
		return "", "", "", err
	}

	h.emitWorkspaceStateChanged(workspaceID, state, health, false)

	return state, health, healthErr, nil
}

// startWorkspaceHealthMonitor periodically re-checks active workspaces whose
// worktree path disappears while the daemon is running, so the UI can show the
// error state and offer close-only without requiring a daemon restart.
func (h *JSONRPCHandler) startWorkspaceHealthMonitor(ctx context.Context) {
	go func() {
		ticker := time.NewTicker(workspaceHealthCheckInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				h.checkWorkspaceHealth(ctx)
			}
		}
	}()
}

// checkWorkspaceHealth marks active workspaces whose worktree path has
// disappeared as error (path-missing) so they become close-only in the UI.
// Only the missing-path condition is monitored here; not-worktree detection
// stays on demand (workspace.health) to avoid false positives for
// git-local/primary workspaces that are plain directories.
func (h *JSONRPCHandler) checkWorkspaceHealth(ctx context.Context) {
	for _, ws := range h.manager.List() {
		if ws.State != workspace.WorkspaceStateActive {
			continue
		}
		if _, statErr := os.Stat(ws.Path); statErr == nil {
			continue
		}
		if _, _, _, refreshErr := h.refreshWorkspaceHealth(ctx, ws.ID); refreshErr != nil {
			log.Warn().Err(refreshErr).Str("workspaceId", ws.ID).Msg("workspace health check failed")
		}
	}
}

func (h *JSONRPCHandler) emitWorkspaceStateChanged(workspaceID string, state string, health string, removed bool) {
	h.events.Publish(frontendEvent{
		Topic: "workspaceStateChanged",
		Payload: map[string]any{
			"workspaceId": workspaceID,
			"state":       state,
			"health":      health,
			"removed":     removed,
		},
	})
}

func isGitWorktree(path string) (bool, error) {
	gitDir := filepath.Join(path, ".git")
	info, err := os.Stat(gitDir)
	if err != nil {
		return false, err
	}
	if info.IsDir() {
		return true, nil
	}
	return false, nil
}

func (h *JSONRPCHandler) summarizeUsedAgents(workspaceID string, closeReq workspace.CloseRequest) {
	if h.memory == nil {
		return
	}
	agents := h.getAgentUsage(workspaceID)
	if len(agents) == 0 {
		return
	}
	ws, err := h.manager.GetWorkspace(workspaceID)
	if err != nil {
		log.Warn().Err(err).Str("workspaceId", workspaceID).Msg("cannot resolve workspace for agent summarization")
		return
	}
	log.Info().Strs("agents", agents).Str("workspaceId", workspaceID).Msg("summarizing agents used in workspace")
	for _, agent := range agents {
		h.memory.SummarizeSession(agent, ws.Path, ws.ProjectID)
	}
}

func (h *JSONRPCHandler) watchAndTrack(workspaceID string, path string) {
	h.watchers.Watch(workspaceID, path)
	h.prTracker.EnsureTracked(path, true)
}
