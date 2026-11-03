package localtask

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	domain "yishan/apps/cli/internal/localtask"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
)

// LinkWorkspace reuses an active pair or creates a progressing workspace link.
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
	linked, err := s.deps.Repository.LinkWorkspace(ctx, link)
	if err != nil {
		return linked, err
	}
	s.publishTaskChanged()
	return linked, nil
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
	s.publishTaskChanged()
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
	if err != nil {
		return link, err
	}
	s.publishTaskChanged()
	return link, nil
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
	localWorkspace, err := s.resolveLocalWorkspace(ctx, resolvedWorkspaceID)
	if err != nil {
		return "", "", err
	}
	task, err := s.deps.Repository.Get(ctx, resolvedTaskID)
	if err != nil {
		return "", "", err
	}
	if task.ProjectID != nil && *task.ProjectID != "" && *task.ProjectID != localWorkspace.ProjectID {
		return "", "", fmt.Errorf("task and workspace projects differ: %w", domain.ErrInvalidLink)
	}
	if task.OrganizationID != nil && *task.OrganizationID != "" && *task.OrganizationID != localWorkspace.OrganizationID {
		return "", "", fmt.Errorf("task and workspace organizations differ: %w", domain.ErrInvalidLink)
	}
	return resolvedTaskID, resolvedWorkspaceID, nil
}

func (s *Service) requireLocalWorkspace(ctx context.Context, workspaceID string) error {
	_, err := s.resolveLocalWorkspace(ctx, workspaceID)
	return err
}

func (s *Service) resolveLocalWorkspace(ctx context.Context, workspaceID string) (workspace.StoredWorkspace, error) {
	if s.deps.Registry != nil {
		if localWorkspace, ok := s.deps.Registry.Get(workspaceID); ok {
			return workspace.StoredWorkspace{
				ID: localWorkspace.ID, ProjectID: localWorkspace.ProjectID, OrganizationID: localWorkspace.OrgID,
			}, nil
		}
	}
	if s.deps.WorkspaceStore == nil {
		return workspace.StoredWorkspace{}, workspace.NewError(workspace.ErrCodeNotFound, "workspace not found")
	}
	workspaces, err := s.deps.WorkspaceStore.List(ctx)
	if err != nil {
		return workspace.StoredWorkspace{}, fmt.Errorf("list local workspaces: %w", err)
	}
	for _, localWorkspace := range workspaces {
		if localWorkspace.ID == workspaceID {
			return localWorkspace, nil
		}
	}
	return workspace.StoredWorkspace{}, workspace.NewError(workspace.ErrCodeNotFound, "workspace not found")
}

// UnlinkWorkspaceAssociations removes every active Local Task association for
// a workspace. Workspace provisioning rollback calls this through a narrow
// callback owned by the composition root.
func (s *Service) UnlinkWorkspaceAssociations(ctx context.Context, workspaceID string) error {
	resolvedWorkspaceID, err := requireIdentifier(workspaceID, "workspaceId")
	if err != nil {
		return err
	}
	links, err := s.deps.Repository.ListWorkspaceLinks(ctx, resolvedWorkspaceID)
	if err != nil {
		return err
	}
	for _, link := range links {
		if link.UnlinkedAt != nil {
			continue
		}
		if err := s.deps.Repository.UnlinkWorkspace(ctx, link.ID); err != nil {
			return err
		}
	}
	s.publishTaskChanged()
	return nil
}
