package workspace

import (
	"context"
	"strings"

	"github.com/rs/zerolog/log"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/terminal"
	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/application"
)

// WorkspaceService implementation: each method performs one workspace
// application operation. Create/close route through application.Service;
// the rest operate on the instance registry / manager.

func (s *Service) ListWorkspaces() (any, error) {
	return s.deps.Registry.List(), nil
}

func (s *Service) Create(ctx context.Context, req rpc.WorkspaceCreateParams) (any, error) {
	result, err := s.app.Create(ctx, application.CreateCommand(req))
	if err != nil {
		return nil, err
	}
	return map[string]any{"id": result.ID, "status": result.Status}, nil
}

func (s *Service) Close(ctx context.Context, req rpc.WorkspaceCloseParams) (any, error) {
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

func (s *Service) RefreshPullRequest(ctx context.Context, req workspace.RefreshPullRequestRequest) (any, error) {
	workspaceID := strings.TrimSpace(req.WorkspaceID)
	workspacePath := strings.TrimSpace(req.Path)
	if workspaceID == "" && workspacePath == "" {
		return nil, rpc.NewRPCError(rpc.CodeInvalidParams, "workspaceId or path is required")
	}

	ws, err := func() (workspace.Workspace, error) {
		if workspaceID != "" {
			return s.GetWorkspace(workspaceID)
		}
		resolvedWorkspace, ok := s.deps.Registry.GetByPath(workspacePath)
		if !ok {
			return workspace.Workspace{}, rpc.NewRPCError(rpc.CodeNotFound, "workspace not found")
		}
		return resolvedWorkspace, nil
	}()
	if err != nil {
		return nil, err
	}

	if ws.Kind != workspace.KindFolder {
		s.deps.PRTracker.EnsureTracked(ws.Path, false)
		s.deps.PRTracker.RefreshWorkspaceByPath(ws.Path)
	}

	refreshedWorkspace, err := s.GetWorkspace(ws.ID)
	if err != nil {
		return nil, err
	}
	return refreshedWorkspace, nil
}

func (s *Service) SetActive(ctx context.Context, req terminal.SetActiveWorkspaceRequest) (any, error) {
	return s.deps.Terminals.SetActiveWorkspace(req)
}

func (s *Service) SyncContextLink(ctx context.Context, req workspace.SyncContextLinkRequest) (any, error) {
	return workspace.SyncContextLink(req)
}

func (s *Service) Health(ctx context.Context, req rpc.WorkspaceHealthParams) (any, error) {
	ws, err := s.GetWorkspace(req.WorkspaceID)
	if err != nil {
		return nil, err
	}

	state, health, healthErr, err := s.RefreshHealth(ctx, req.WorkspaceID)
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

func (s *Service) OpenProject(ctx context.Context, req rpc.WorkspaceOpenProjectParams) (any, error) {
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
	if len(opened) > 0 && s.deps.TokenUsage != nil {
		s.deps.TokenUsage.RequestRecentRecoveryScan("workspace.openProject")
	}

	return rpc.WorkspaceOpenProjectResult{
		Opened:  opened,
		Skipped: skipped,
		Errors:  openErrors,
	}, nil
}

func (s *Service) CloseProject(ctx context.Context, req rpc.WorkspaceCloseProjectParams) (any, error) {
	stopped := []string{}
	for _, wsID := range req.WorkspaceIDs {
		wsID = strings.TrimSpace(wsID)
		if wsID == "" {
			continue
		}
		s.deps.Terminals.StopAllForWorkspace(wsID)
		stopped = append(stopped, wsID)
	}

	return rpc.WorkspaceCloseProjectResult{Stopped: stopped}, nil
}
