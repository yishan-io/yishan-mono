package project

import (
	"context"
	"fmt"
	"strings"

	"yishan/apps/cli/internal/adapter/sqlite"
	"yishan/apps/cli/internal/rpc"

	"github.com/google/uuid"
)

// Create stores a new project, and this node's primary workspace when a
// local path is given.
func (s *Service) Create(ctx context.Context, req rpc.ProjectCreateParams) (any, error) {
	project, primary, err := s.buildNewProject(req)
	if err != nil {
		return nil, err
	}
	if err := s.store().Create(ctx, project, primary); err != nil {
		return nil, toRPCError(err, project.ID)
	}
	return s.loadWithWorkspaces(ctx, project.ID)
}

func (s *Service) buildNewProject(req rpc.ProjectCreateParams) (sqlite.Project, *sqlite.PrimaryWorkspaceInput, error) {
	organizationID, name, prefix := strings.TrimSpace(req.OrganizationID), strings.TrimSpace(req.Name), strings.TrimSpace(req.TaskPrefix)
	if s.deps.Database == nil {
		return sqlite.Project{}, nil, fmt.Errorf("project storage is not available")
	}
	if organizationID == "" || name == "" {
		return sqlite.Project{}, nil, invalidParams("organizationId and name are required")
	}
	if err := validateTaskPrefix(prefix); err != nil {
		return sqlite.Project{}, nil, invalidParams(err.Error())
	}
	project := sqlite.Project{
		ID: uuid.Must(uuid.NewV7()).String(), OrganizationID: organizationID, Name: name, TaskPrefix: &prefix,
		Icon: strings.TrimSpace(req.Icon), Color: strings.TrimSpace(req.Color), ContextEnabled: true,
		Commands: []sqlite.ProjectCommand{},
	}
	if req.ContextEnabled != nil {
		project.ContextEnabled = *req.ContextEnabled
	}
	if err := applySource(&project, req.SourceTypeHint, req.RepoURL); err != nil {
		return sqlite.Project{}, nil, err
	}
	localPath := strings.TrimSpace(req.LocalPath)
	if localPath == "" {
		return project, nil, nil
	}
	return project, &sqlite.PrimaryWorkspaceInput{ID: uuid.Must(uuid.NewV7()).String(), NodeID: s.deps.NodeID, LocalPath: localPath}, nil
}

// applySource derives source type and repository identity the way
// api-service does: a remote URL makes a git project, a git-local project is
// keyed by its own ID, anything else is a plain folder.
func applySource(project *sqlite.Project, sourceTypeHint string, repoURL string) error {
	repoURL = strings.TrimSpace(repoURL)
	if repoURL != "" {
		source, err := inferRepoSource(repoURL)
		if err != nil {
			return invalidParams(err.Error())
		}
		project.SourceType, project.RepoURL = "git", &repoURL
		project.RepoProvider, project.RepoKey = &source.Provider, &source.Key
		return nil
	}
	switch strings.TrimSpace(sourceTypeHint) {
	case "git-local":
		project.SourceType, project.RepoKey = "git-local", &project.ID
	case "", "unknown":
		project.SourceType = "unknown"
	default:
		return invalidParams("a git project needs a repository URL")
	}
	return nil
}

// Update applies configuration changes and an optional primary path move.
func (s *Service) Update(ctx context.Context, req rpc.ProjectUpdateParams) (any, error) {
	project, err := s.ownedProject(ctx, req.OrganizationID, req.ProjectID)
	if err != nil {
		return nil, err
	}
	update, err := buildProjectUpdate(req)
	if err != nil {
		return nil, err
	}
	if req.LocalPath != nil {
		if err := s.movePrimaryWorkspace(ctx, project, *req.LocalPath); err != nil {
			return nil, err
		}
	}
	if _, err := s.store().Update(ctx, project.ID, update); err != nil {
		return nil, toRPCError(err, project.ID)
	}
	return s.loadWithWorkspaces(ctx, project.ID)
}

func buildProjectUpdate(req rpc.ProjectUpdateParams) (sqlite.ProjectUpdate, error) {
	update := sqlite.ProjectUpdate{
		Icon: req.Icon, Color: req.Color, SetupScript: req.SetupScript, PostScript: req.PostScript,
		ContextEnabled: req.ContextEnabled,
	}
	if req.Name != nil {
		name := strings.TrimSpace(*req.Name)
		if name == "" {
			return sqlite.ProjectUpdate{}, invalidParams("project name cannot be empty")
		}
		update.Name = &name
	}
	if req.Commands != nil {
		commands := make([]sqlite.ProjectCommand, 0, len(*req.Commands))
		for _, command := range *req.Commands {
			if strings.TrimSpace(command.Name) == "" || strings.TrimSpace(command.Command) == "" {
				return sqlite.ProjectUpdate{}, invalidParams("project commands need a name and a command")
			}
			commands = append(commands, sqlite.ProjectCommand{Name: strings.TrimSpace(command.Name), Command: strings.TrimSpace(command.Command)})
		}
		update.Commands = &commands
	}
	return update, nil
}

func (s *Service) movePrimaryWorkspace(ctx context.Context, project sqlite.Project, localPath string) error {
	localPath = strings.TrimSpace(localPath)
	if localPath == "" {
		return invalidParams("localPath cannot be empty")
	}
	primary := sqlite.PrimaryWorkspaceInput{ID: uuid.Must(uuid.NewV7()).String(), NodeID: s.deps.NodeID, LocalPath: localPath}
	if err := s.store().SetPrimaryWorkspace(ctx, project, primary); err != nil {
		return fmt.Errorf("move primary workspace: %w", err)
	}
	return nil
}

// Delete removes the project and this node's primary workspace row.
func (s *Service) Delete(ctx context.Context, req rpc.ProjectRefParams) (any, error) {
	project, err := s.ownedProject(ctx, req.OrganizationID, req.ProjectID)
	if err != nil {
		return nil, err
	}
	if err := s.store().Delete(ctx, project.ID); err != nil {
		return nil, toRPCError(err, project.ID)
	}
	return map[string]bool{"ok": true}, nil
}

// PromoteGit turns a git-local project into a git project once its checkout
// has an origin remote.
func (s *Service) PromoteGit(ctx context.Context, req rpc.ProjectPromoteGitParams) (any, error) {
	project, err := s.ownedProject(ctx, req.OrganizationID, req.ProjectID)
	if err != nil {
		return nil, err
	}
	if project.SourceType != "git-local" {
		return nil, invalidParams("only git-local projects can be promoted")
	}
	remoteURL := strings.TrimSpace(req.RemoteURL)
	source, err := inferRepoSource(remoteURL)
	if err != nil {
		return nil, invalidParams(err.Error())
	}
	sourceType := "git"
	update := sqlite.ProjectUpdate{SourceType: &sourceType, RepoURL: &remoteURL, RepoProvider: &source.Provider, RepoKey: &source.Key}
	updated, err := s.store().Update(ctx, project.ID, update)
	if err != nil {
		return nil, toRPCError(err, project.ID)
	}
	return updated, nil
}

// EnsureTaskPrefix assigns a legacy project's task prefix locally.
func (s *Service) EnsureTaskPrefix(ctx context.Context, req rpc.ProjectRefParams) (any, error) {
	project, err := s.ownedProject(ctx, req.OrganizationID, req.ProjectID)
	if err != nil {
		return nil, err
	}
	return s.ensureTaskPrefix(ctx, project)
}

// ownedProject loads a project and checks it belongs to organizationID.
func (s *Service) ownedProject(ctx context.Context, organizationID string, projectID string) (sqlite.Project, error) {
	projectID = strings.TrimSpace(projectID)
	if projectID == "" || s.deps.Database == nil {
		return sqlite.Project{}, invalidParams("projectId is required")
	}
	project, err := s.store().Get(ctx, projectID)
	if err != nil {
		return sqlite.Project{}, toRPCError(err, projectID)
	}
	if organizationID = strings.TrimSpace(organizationID); organizationID != "" && project.OrganizationID != organizationID {
		return sqlite.Project{}, projectNotFound(projectID)
	}
	return project, nil
}

func (s *Service) loadWithWorkspaces(ctx context.Context, projectID string) (any, error) {
	project, err := s.store().Get(ctx, projectID)
	if err != nil {
		return nil, toRPCError(err, projectID)
	}
	return s.withWorkspaces(ctx, project)
}
