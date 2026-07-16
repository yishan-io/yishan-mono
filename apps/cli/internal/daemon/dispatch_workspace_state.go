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

func (h *JSONRPCHandler) handleWorkspaceHealth(_ context.Context, params json.RawMessage) (any, error) {
	var req workspaceHealthParams
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}

	ws, err := h.manager.GetWorkspace(req.WorkspaceID)
	if err != nil {
		return nil, err
	}

	state := workspace.WorkspaceStateActive
	health := ""
	healthErr := ""

	if _, statErr := os.Stat(ws.Path); statErr != nil {
		state = workspace.WorkspaceStateDegraded
		health = workspace.WorkspaceHealthPathMissing
		healthErr = statErr.Error()
	}

	if healthErr == "" {
		isWorktree, checkErr := isGitWorktree(ws.Path)
		if checkErr != nil {
			state = workspace.WorkspaceStateDegraded
			health = workspace.WorkspaceHealthPathMissing
			healthErr = checkErr.Error()
		} else if !isWorktree {
			state = workspace.WorkspaceStateDegraded
			health = workspace.WorkspaceHealthNotWorktree
		}
	}

	if err := h.manager.SetWorkspaceState(req.WorkspaceID, state, health); err != nil {
		return nil, err
	}

	if state == workspace.WorkspaceStateDegraded {
		h.watchers.Unwatch(ws.Path)
		h.prTracker.StopTracking(req.WorkspaceID)
	}

	if h.wsIndexStore != nil {
		if err := h.wsIndexStore.Upsert(workspaceIndexEntry{
			WorkspaceID:  ws.ID,
			WorktreePath: ws.Path,
			ProjectID:    ws.ProjectID,
			OrgID:        ws.OrgID,
			State:        state,
			Health:       health,
			LastSeen:     time.Now().UTC().Format(time.RFC3339),
			Error:        healthErr,
		}); err != nil {
			log.Warn().Err(err).Str("workspaceId", req.WorkspaceID).Msg("workspace index store upsert failed during health check")
		}
	}

	h.emitWorkspaceStateChanged(req.WorkspaceID, state, health, false)

	return workspaceHealthResult{
		WorkspaceID: req.WorkspaceID,
		State:       state,
		Health:      health,
		Path:        ws.Path,
		Error:       healthErr,
	}, nil
}

func (h *JSONRPCHandler) handleWorkspaceRepair(ctx context.Context, params json.RawMessage) (any, error) {
	var req workspaceRepairParams
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}

	ws, err := h.manager.GetWorkspace(req.WorkspaceID)
	if err != nil {
		return nil, err
	}

	if ws.State != workspace.WorkspaceStateDegraded {
		return nil, workspace.NewRPCError(rpcCodeInvalidParams, "workspace is not in degraded state")
	}

	repaired := false
	state := ws.State
	health := ws.Health
	repairErr := ""

	if ws.Health == workspace.WorkspaceHealthPathMissing {
		if _, statErr := os.Stat(ws.Path); statErr == nil {
			repaired = true
		} else {
			repairErr = statErr.Error()
		}
	} else if ws.Health == workspace.WorkspaceHealthNotWorktree {
		isWorktree, checkErr := isGitWorktree(ws.Path)
		if checkErr == nil && isWorktree {
			repaired = true
		} else if checkErr != nil {
			repairErr = checkErr.Error()
		}
	} else {
		return nil, workspace.NewRPCError(rpcCodeInvalidParams, "unknown health condition: "+ws.Health)
	}

	if repaired {
		state = workspace.WorkspaceStateActive
		health = ""
		h.watchAndTrack(ws.ID, ws.Path)
	}

	if err := h.manager.SetWorkspaceState(req.WorkspaceID, state, health); err != nil {
		return nil, err
	}

	if h.wsIndexStore != nil {
		if err := h.wsIndexStore.Upsert(workspaceIndexEntry{
			WorkspaceID:  ws.ID,
			WorktreePath: ws.Path,
			ProjectID:    ws.ProjectID,
			OrgID:        ws.OrgID,
			State:        state,
			Health:       health,
			LastSeen:     time.Now().UTC().Format(time.RFC3339),
			Error:        repairErr,
		}); err != nil {
			log.Warn().Err(err).Str("workspaceId", req.WorkspaceID).Msg("workspace index store upsert failed during repair")
		}
	}

	h.emitWorkspaceStateChanged(req.WorkspaceID, state, health, false)

	return workspaceRepairResult{
		WorkspaceID: req.WorkspaceID,
		State:       state,
		Health:      health,
		Error:       repairErr,
	}, nil
}

func (h *JSONRPCHandler) handleWorkspaceForget(_ context.Context, params json.RawMessage) (any, error) {
	var req workspaceForgetParams
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}

	ws, wsErr := h.manager.GetWorkspace(req.WorkspaceID)
	if wsErr == nil {
		h.watchers.Unwatch(ws.Path)
		h.prTracker.StopTracking(ws.ID)
		h.manager.RemoveWorkspaceFromMemory(req.WorkspaceID)
	}

	if h.wsIndexStore != nil {
		if err := h.wsIndexStore.Remove(req.WorkspaceID); err != nil {
			log.Warn().Err(err).Str("workspaceId", req.WorkspaceID).Msg("failed to remove workspace from index store during forget")
		}
	}

	if wsErr == nil {
		h.emitWorkspaceStateChanged(req.WorkspaceID, "", "", true)
	}

	return workspaceForgetResult{
		WorkspaceID: req.WorkspaceID,
		Removed:     true,
	}, nil
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
