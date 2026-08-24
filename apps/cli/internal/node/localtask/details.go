package localtask

import (
	"context"
	"path/filepath"
	"strings"

	domain "yishan/apps/cli/internal/localtask"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
)

type resolvedWorkspace struct {
	display                 domain.WorkspaceDisplay
	organizationID          string
	projectID               string
	persistedOrganizationID string
	persistedProjectID      string
}

// GetDetails loads a Local Task with resolved display metadata for its links.
func (s *Service) GetDetails(ctx context.Context, req rpc.LocalTaskIDParams) (any, error) {
	taskID, err := requireIdentifier(req.ID, "id")
	if err != nil {
		return nil, err
	}
	task, err := s.deps.Repository.Get(ctx, taskID)
	if err != nil {
		return nil, err
	}
	links, err := s.deps.Repository.ListTaskLinks(ctx, taskID)
	if err != nil {
		return nil, err
	}
	workspaces, project, err := s.resolveDetails(ctx, task, links)
	if err != nil {
		return nil, err
	}
	return domain.Details{Task: task, Workspaces: workspaces, Project: project}, nil
}

func (s *Service) resolveDetails(ctx context.Context, task domain.Task, links []domain.WorkspaceLink) ([]domain.WorkspaceDisplay, *domain.ProjectDisplay, error) {
	resolved, err := s.resolveLinkedWorkspaces(ctx)
	if err != nil {
		return nil, nil, err
	}
	workspaces, linkedProjectContext := linkedWorkspaceDisplays(links, resolved)
	projectContext := selectProjectContext(task, resolved, linkedProjectContext)
	project, err := s.resolveProject(ctx, projectContext)
	if err != nil {
		return nil, nil, err
	}
	return workspaces, project, nil
}

func (s *Service) resolveLinkedWorkspaces(ctx context.Context) (map[string]resolvedWorkspace, error) {
	resolved := make(map[string]resolvedWorkspace)
	if s.deps.WorkspaceStore != nil {
		stored, err := s.deps.WorkspaceStore.List(ctx)
		if err != nil {
			return nil, err
		}
		for _, storedWorkspace := range stored {
			resolved[storedWorkspace.ID] = resolvedStoredWorkspace(storedWorkspace)
		}
	}
	if s.deps.Registry != nil {
		for _, localWorkspace := range s.deps.Registry.List() {
			resolved[localWorkspace.ID] = mergeRegistryWorkspace(resolved[localWorkspace.ID], localWorkspace)
		}
	}
	return resolved, nil
}

func resolvedStoredWorkspace(stored workspace.StoredWorkspace) resolvedWorkspace {
	return resolvedWorkspace{
		display:                 domain.WorkspaceDisplay{ID: stored.ID, Name: workspaceName(stored.Name, stored.LocalPath), Kind: workspaceDisplayKind(stored.Kind)},
		organizationID:          stored.OrganizationID,
		projectID:               stored.ProjectID,
		persistedOrganizationID: stored.OrganizationID,
		persistedProjectID:      stored.ProjectID,
	}
}

func mergeRegistryWorkspace(resolved resolvedWorkspace, local workspace.Workspace) resolvedWorkspace {
	if resolved.display.ID == "" {
		resolved.display.ID = local.ID
	}
	if resolved.display.Name == "" {
		resolved.display.Name = workspaceName(nil, local.Path)
	}
	if local.Kind != "" {
		resolved.display.Kind = workspaceDisplayKind(string(local.Kind))
	}
	if local.OrgID != "" {
		resolved.organizationID = local.OrgID
	}
	if local.ProjectID != "" {
		resolved.projectID = local.ProjectID
	}
	return resolved
}

// workspaceDisplayKind translates internal workspace records into the stable
// localTask.getDetails wire contract. Unknown legacy kinds remain managed so
// the daemon never emits an unsupported wire value.
func workspaceDisplayKind(kind string) domain.WorkspaceDisplayKind {
	switch workspace.Kind(kind) {
	case workspace.KindPrimary:
		return domain.WorkspaceDisplayKindLocal
	case workspace.KindFolder:
		return domain.WorkspaceDisplayKindFolder
	default:
		return domain.WorkspaceDisplayKindManaged
	}
}

func workspaceName(name *string, localPath string) string {
	if name != nil && strings.TrimSpace(*name) != "" {
		return *name
	}
	base := filepath.Base(filepath.Clean(localPath))
	if base == "." || base == string(filepath.Separator) {
		return ""
	}
	return base
}

func linkedWorkspaceDisplays(links []domain.WorkspaceLink, resolved map[string]resolvedWorkspace) ([]domain.WorkspaceDisplay, resolvedWorkspace) {
	workspaces := make([]domain.WorkspaceDisplay, 0, len(links))
	seen := make(map[string]struct{})
	projectContext := resolvedWorkspace{}
	for _, link := range links {
		if link.UnlinkedAt != nil {
			continue
		}
		workspace, ok := resolved[link.WorkspaceID]
		if !ok {
			continue
		}
		if _, duplicate := seen[workspace.display.ID]; duplicate {
			continue
		}
		seen[workspace.display.ID] = struct{}{}
		workspaces = append(workspaces, workspace.display)
		if projectContext.projectID == "" && workspace.organizationID != "" && workspace.projectID != "" {
			projectContext = workspace
		}
	}
	return workspaces, projectContext
}

func selectProjectContext(task domain.Task, resolved map[string]resolvedWorkspace, linkedProjectContext resolvedWorkspace) resolvedWorkspace {
	if task.ProjectID == nil {
		return linkedProjectContext
	}
	return findPersistedProjectContext(*task.ProjectID, resolved)
}

func findPersistedProjectContext(projectID string, resolved map[string]resolvedWorkspace) resolvedWorkspace {
	for _, localWorkspace := range resolved {
		if localWorkspace.persistedProjectID == projectID && localWorkspace.persistedOrganizationID != "" {
			return resolvedWorkspace{organizationID: localWorkspace.persistedOrganizationID, projectID: projectID}
		}
	}
	return resolvedWorkspace{}
}

func (s *Service) resolveProject(ctx context.Context, workspace resolvedWorkspace) (*domain.ProjectDisplay, error) {
	if s.deps.ProjectResolver == nil || workspace.organizationID == "" || workspace.projectID == "" {
		return nil, nil
	}
	project, found, err := s.deps.ProjectResolver.ResolveTaskProject(ctx, workspace.organizationID, workspace.projectID)
	if err != nil || !found {
		return nil, err
	}
	return &project, nil
}
