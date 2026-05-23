package daemon

import (
	"context"
	"encoding/json"
	"strings"

	"yishan/apps/cli/internal/workspace"

	"github.com/rs/zerolog/log"
)

func (h *JSONRPCHandler) dispatchWorkspace(ctx context.Context, _ *wsConnState, method string, params json.RawMessage) (any, error) {
	switch method {
	case MethodOpen:
		return h.handleOpen(ctx, params)
	case MethodList:
		return h.manager.List(), nil
	case MethodWorkspaceCreate:
		return h.handleWorkspaceCreate(ctx, params)
	case MethodWorkspaceSyncContextLink:
		var req workspace.SyncContextLinkRequest
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.SyncContextLink(req)
	case MethodWorkspaceSetActive:
		var req workspace.SetActiveWorkspaceRequest
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.SetActiveWorkspace(req)
	case MethodWorkspaceClose:
		return h.handleWorkspaceClose(ctx, params)
	default:
		return nil, workspace.NewRPCError(rpcCodeMethodNotFound, "unknown workspace method: "+method)
	}
}

func (h *JSONRPCHandler) handleOpen(_ context.Context, params json.RawMessage) (any, error) {
	var req workspace.OpenRequest
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}
	ws, err := h.manager.Open(req)
	if err != nil {
		return nil, err
	}
	log.Info().Str("workspaceId", ws.ID).Str("path", ws.Path).Bool("prAlreadyMerged", req.PRAlreadyMerged).Msg("daemon workspace opened")
	h.watchAndTrack(ws.Path)
	return ws, nil
}

func (h *JSONRPCHandler) handleWorkspaceCreate(ctx context.Context, params json.RawMessage) (any, error) {
	var req workspace.CreateRequest
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}
	reportProgress := func(event workspace.CreateProgressEvent) {
		h.events.Publish(frontendEvent{Topic: "workspaceCreateProgress", Payload: event})
	}
	created, err := h.manager.CreateWorkspaceWithProgress(ctx, req, reportProgress)
	if err != nil {
		return nil, err
	}

	h.watchAndTrack(created.Path)
	reportProgress(workspace.CreateProgressEvent{
		WorkspaceID: created.ID,
		StepID:      "complete",
		Label:       "Prepare workspace",
		Status:      workspace.CreateProgressCompleted,
		CreatedAt:   nowRFC3339Nano(),
	})
	warnings := buildWorkspaceHookWarnings(req.SetupHook, created.SetupHookResult, h.logFilePath)

	if req.ProjectID == "" {
		return map[string]any{
			"id":                      created.ID,
			"path":                    created.Path,
			"setupHookResult":         created.SetupHookResult,
			"lifecycleScriptWarnings": warnings,
		}, nil
	}

	remoteSyncWarning := ""
	if err := createRemoteWorkspace(ctx, WorkspaceCreation{
		ID:             created.ID,
		NodeID:         h.nodeID,
		OrganizationID: req.OrganizationID,
		ProjectID:      req.ProjectID,
		Kind:           workspace.KindWorktree,
		Branch:         req.TargetBranch,
		SourceBranch:   req.SourceBranch,
		LocalPath:      created.Path,
	}); err != nil {
		remoteSyncWarning = err.Error()
		log.Warn().
			Err(err).
			Str("workspaceId", created.ID).
			Str("projectId", req.ProjectID).
			Str("organizationId", req.OrganizationID).
			Str("branch", req.TargetBranch).
			Msg("failed to create remote workspace; local workspace remains available")
	}

	result := map[string]any{
		"id":                      created.ID,
		"path":                    created.Path,
		"setupHookResult":         created.SetupHookResult,
		"lifecycleScriptWarnings": warnings,
	}
	if remoteSyncWarning != "" {
		result["remoteSyncWarning"] = remoteSyncWarning
	}
	return result, nil
}

func (h *JSONRPCHandler) handleWorkspaceClose(ctx context.Context, params json.RawMessage) (any, error) {
	var req workspaceCloseParams
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}
	if err := closeRemoteWorkspace(ctx, WorkspaceClose{
		WorkspaceID:    req.WorkspaceID,
		OrganizationID: req.OrganizationID,
		ProjectID:      req.ProjectID,
	}); err != nil {
		return nil, err
	}

	closeReq := workspace.CloseRequest{
		WorkspaceID:   req.WorkspaceID,
		Branch:        req.Branch,
		RemoveBranch:  req.RemoveBranch,
		ForceWorktree: req.ForceWorktree,
		ForceBranch:   req.ForceBranch,
		PostHook:      req.PostHook,
	}
	ws, wsErr := h.manager.GetWorkspace(closeReq.WorkspaceID)
	if wsErr == nil && h.cleanupStore != nil {
		if err := h.cleanupStore.Add(pendingWorkspaceCleanup{
			WorkspaceID:   closeReq.WorkspaceID,
			Path:          ws.Path,
			Branch:        closeReq.Branch,
			RemoveBranch:  closeReq.RemoveBranch,
			ForceWorktree: closeReq.ForceWorktree,
			ForceBranch:   closeReq.ForceBranch,
			PostHook:      closeReq.PostHook,
		}); err != nil {
			return nil, err
		}
	}
	if wsErr == nil {
		h.watchers.Unwatch(ws.Path)
		h.prTracker.StopTracking(ws.ID)
	}
	if _, err := h.manager.CloseWorkspace(ctx, closeReq); err != nil {
		if h.cleanupStore != nil {
			if markErr := h.cleanupStore.MarkFailure(closeReq.WorkspaceID, err); markErr != nil {
				log.Warn().Err(markErr).Str("workspaceId", closeReq.WorkspaceID).Msg("failed to mark workspace cleanup failure")
			}
		}
		return nil, err
	}
	if h.cleanupStore != nil {
		if err := h.cleanupStore.Remove(closeReq.WorkspaceID); err != nil {
			log.Warn().Err(err).Str("workspaceId", closeReq.WorkspaceID).Msg("failed to remove completed workspace cleanup")
		}
	}

	return map[string]any{
		"workspace":   map[string]string{"id": req.WorkspaceID, "status": "closed"},
		"workspaceId": req.WorkspaceID,
	}, nil
}

// watchAndTrack starts filesystem watching and PR tracking for a workspace path.
func (h *JSONRPCHandler) watchAndTrack(path string) {
	h.watchers.Watch(path)
	h.prTracker.EnsureTracked(path)
}

// buildWorkspaceHookWarnings builds the lifecycle script warning list from a HookResult.
// Returns a non-nil empty slice when the hook result is nil or has no error.
func buildWorkspaceHookWarnings(command string, result *workspace.HookResult, logFilePath string) []any {
	warnings := []any{}
	if result != nil && result.Error != "" {
		warnings = append(warnings, hookResultToWarning("setup", command, result, logFilePath))
	}
	return warnings
}

// hookResultToWarning converts a HookResult into the structured warning shape
// that the desktop UI expects for lifecycle script warnings.
func hookResultToWarning(scriptKind string, command string, hr *workspace.HookResult, logFilePath string) map[string]any {
	var exitCode any
	if hr.ExitCode >= 0 {
		exitCode = hr.ExitCode
	}

	timedOut := false
	if hr.Error != "" {
		timedOut = strings.Contains(hr.Error, "timed out")
	}

	var logFileValue any
	if logFilePath != "" {
		logFileValue = logFilePath
	}

	return map[string]any{
		"scriptKind":    scriptKind,
		"timedOut":      timedOut,
		"message":       hr.Error,
		"command":       command,
		"stdoutExcerpt": hr.Stdout,
		"stderrExcerpt": hr.Stderr,
		"exitCode":      exitCode,
		"signal":        nil,
		"logFilePath":   logFileValue,
	}
}
