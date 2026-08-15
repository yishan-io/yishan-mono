package node

import (
	"context"
	"strings"

	"github.com/rs/zerolog/log"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/rpcerror"
	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/terminal"
	"yishan/apps/cli/internal/workspace/application"
)

// WorkspaceService implementation: each method performs one workspace
// application operation. Create/close route through application.Service;
// the rest operate on the instance registry / manager.

func (s *Services) ListWorkspaces() (any, error) {
	return s.registry.List(), nil
}

func (s *Services) WorkspaceCreate(ctx context.Context, req rpc.WorkspaceCreateParams) (any, error) {
	result, err := s.app.Create(ctx, application.CreateCommand(req))
	if err != nil {
		return nil, err
	}
	return map[string]any{"id": result.ID, "status": result.Status}, nil
}

func (s *Services) WorkspaceClose(ctx context.Context, req rpc.WorkspaceCloseParams) (any, error) {
	result, err := s.app.Close(ctx, application.CloseCommand(req))
	if err != nil {
		return nil, err
	}
	if result.Relayed {
		return map[string]any{"workspaceId": result.WorkspaceID, "status": result.Status}, nil
	}
	return map[string]any{
		"workspace":   map[string]string{"id": result.WorkspaceID, "status": result.Status},
		"workspaceId": result.WorkspaceID,
	}, nil
}

func (s *Services) WorkspaceRefreshPullRequest(ctx context.Context, req workspace.RefreshPullRequestRequest) (any, error) {
	workspaceID := strings.TrimSpace(req.WorkspaceID)
	workspacePath := strings.TrimSpace(req.Path)
	if workspaceID == "" && workspacePath == "" {
		return nil, workspace.NewRPCError(rpcerror.CodeInvalidParams, "workspaceId or path is required")
	}

	ws, err := func() (workspace.Workspace, error) {
		if workspaceID != "" {
			return s.getWorkspace(workspaceID)
		}
		resolvedWorkspace, ok := s.registry.GetByPath(workspacePath)
		if !ok {
			return workspace.Workspace{}, workspace.NewRPCError(rpcerror.CodeNotFound, "workspace not found")
		}
		return resolvedWorkspace, nil
	}()
	if err != nil {
		return nil, err
	}

	s.prTracker.EnsureTracked(ws.Path, false)
	s.prTracker.RefreshWorkspaceByPath(ws.Path)

	refreshedWorkspace, err := s.getWorkspace(ws.ID)
	if err != nil {
		return nil, err
	}
	return refreshedWorkspace, nil
}

func (s *Services) WorkspaceSetActive(ctx context.Context, req terminal.SetActiveWorkspaceRequest) (any, error) {
	return s.terminals.SetActiveWorkspace(req)
}

func (s *Services) WorkspaceSyncContextLink(ctx context.Context, req workspace.SyncContextLinkRequest) (any, error) {
	return workspace.SyncContextLink(req)
}

func (s *Services) WorkspaceHealth(ctx context.Context, req rpc.WorkspaceHealthParams) (any, error) {
	ws, err := s.getWorkspace(req.WorkspaceID)
	if err != nil {
		return nil, err
	}

	state, health, healthErr, err := s.nodeApp.RefreshWorkspaceHealth(ctx, req.WorkspaceID)
	if err != nil {
		return nil, err
	}

	return rpc.WorkspaceHealthResult{
		WorkspaceID: req.WorkspaceID,
		State:       state,
		Health:      health,
		Path:        ws.Path,
		Error:       healthErr,
	}, nil
}

func (s *Services) WorkspaceOpenProject(ctx context.Context, req rpc.WorkspaceOpenProjectParams) (any, error) {
	opened, skipped, openErrors := []string{}, []string{}, []string{}
	for _, entry := range req.Workspaces {
		workspaceID, didOpenWorkspace, err := s.openProjectWorkspace(entry)
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
	if len(opened) > 0 && s.tokenUsage != nil {
		s.tokenUsage.RequestRecentRecoveryScan("workspace.openProject")
	}

	return rpc.WorkspaceOpenProjectResult{
		Opened:  opened,
		Skipped: skipped,
		Errors:  openErrors,
	}, nil
}

func (s *Services) WorkspaceCloseProject(ctx context.Context, req rpc.WorkspaceCloseProjectParams) (any, error) {
	stopped := []string{}
	for _, wsID := range req.WorkspaceIDs {
		wsID = strings.TrimSpace(wsID)
		if wsID == "" {
			continue
		}
		s.terminals.StopAllForWorkspace(wsID)
		stopped = append(stopped, wsID)
	}

	return rpc.WorkspaceCloseProjectResult{Stopped: stopped}, nil
}
