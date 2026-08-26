package localtask

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	domain "yishan/apps/cli/internal/localtask"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
)

// LinkWorkspace creates a progressing Local Task workspace link.
func (s *Service) LinkWorkspace(ctx context.Context, req rpc.LocalTaskLinkWorkspaceParams) (any, error) {
	taskID, workspaceID, err := s.validateTaskWorkspace(ctx, req.TaskID, req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	link := domain.WorkspaceLink{
		ID: uuid.NewString(), LocalTaskID: taskID, WorkspaceID: workspaceID, Status: domain.StatusProgressing,
	}
	if err := domain.ValidateWorkspaceLink(link); err != nil {
		return nil, err
	}
	return s.deps.Repository.LinkWorkspace(ctx, link)
}

// UnlinkWorkspace removes a current association while preserving history.
func (s *Service) UnlinkWorkspace(ctx context.Context, req rpc.LocalTaskLinkIDParams) (any, error) {
	linkID, err := requireIdentifier(req.LinkID, "linkId")
	if err != nil {
		return nil, err
	}
	if err := s.deps.Repository.UnlinkWorkspace(ctx, linkID); err != nil {
		return nil, err
	}
	return nil, nil
}

// UpdateWorkspaceLinkStatus changes a workspace link lifecycle status.
func (s *Service) UpdateWorkspaceLinkStatus(ctx context.Context, req rpc.LocalTaskUpdateLinkStatusParams) (any, error) {
	linkID, err := requireIdentifier(req.LinkID, "linkId")
	if err != nil {
		return nil, err
	}
	if err := domain.ValidateLinkStatus(req.Status); err != nil {
		return nil, err
	}
	link, err := s.deps.Repository.UpdateWorkspaceLinkStatus(ctx, linkID, req.Status)
	return link, err
}

// ListWorkspaceLinks loads all historical task links for a local workspace.
func (s *Service) ListWorkspaceLinks(ctx context.Context, req rpc.LocalTaskWorkspaceIDParams) (any, error) {
	workspaceID, err := requireIdentifier(req.WorkspaceID, "workspaceId")
	if err != nil {
		return nil, err
	}
	if err := s.requireLocalWorkspace(ctx, workspaceID); err != nil {
		return nil, err
	}
	links, err := s.deps.Repository.ListWorkspaceLinks(ctx, workspaceID)
	return links, err
}

// ListTaskLinks loads all historical workspace links for one Local Task.
func (s *Service) ListTaskLinks(ctx context.Context, req rpc.LocalTaskIDParams) (any, error) {
	taskID, err := requireIdentifier(req.ID, "id")
	if err != nil {
		return nil, err
	}
	if _, err := s.deps.Repository.Get(ctx, taskID); err != nil {
		return nil, err
	}
	links, err := s.deps.Repository.ListTaskLinks(ctx, taskID)
	return links, err
}

func (s *Service) validateTaskWorkspace(ctx context.Context, taskID string, workspaceID string) (string, string, error) {
	resolvedTaskID, err := requireIdentifier(taskID, "taskId")
	if err != nil {
		return "", "", err
	}
	resolvedWorkspaceID, err := requireIdentifier(workspaceID, "workspaceId")
	if err != nil {
		return "", "", err
	}
	if err := s.requireLocalWorkspace(ctx, resolvedWorkspaceID); err != nil {
		return "", "", err
	}
	if _, err := s.deps.Repository.Get(ctx, resolvedTaskID); err != nil {
		return "", "", err
	}
	return resolvedTaskID, resolvedWorkspaceID, nil
}

func (s *Service) requireLocalWorkspace(ctx context.Context, workspaceID string) error {
	if s.deps.Registry != nil {
		if _, ok := s.deps.Registry.Get(workspaceID); ok {
			return nil
		}
	}
	if s.deps.WorkspaceStore == nil {
		return workspace.NewError(workspace.ErrCodeNotFound, "workspace not found")
	}
	workspaces, err := s.deps.WorkspaceStore.List(ctx)
	if err != nil {
		return fmt.Errorf("list local workspaces: %w", err)
	}
	for _, localWorkspace := range workspaces {
		if localWorkspace.ID == workspaceID {
			return nil
		}
	}
	return workspace.NewError(workspace.ErrCodeNotFound, "workspace not found")
}
