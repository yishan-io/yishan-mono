// Package project is the Node application service for the project.* RPC
// namespace. Projects are daemon-owned and per node: the local SQLite row is
// the only copy. api-service is read once per organization to import the
// projects that existed there before. It receives a small dependency set and
// never imports the composition root or the daemon.
package project

import (
	"context"
	"database/sql"
	"fmt"
	"sync"

	"yishan/apps/cli/internal/adapter/cloud/session"
	"yishan/apps/cli/internal/adapter/sqlite"
	"yishan/apps/cli/internal/rpc"
)

// Deps are the explicit dependencies of the project application service.
type Deps struct {
	// Session provides the cloud API client used by the one-time import.
	Session *session.Session
	// Database holds the local projects and workspaces tables.
	Database *sql.DB
	// NodeID identifies this daemon; primary workspaces are recorded per node.
	NodeID string
}

// Service implements the project.* RPC namespace.
type Service struct {
	deps Deps

	// importMu serializes the one-time per-organization import.
	importMu sync.Mutex

	// router is the namespace routing table for tests (callRPCForTest routes
	// through the same path rpc.Server uses for live connections). Production
	// composes the router in internal/app and leaves this nil.
	router *rpc.Router
}

// NewService builds the project application service.
func NewService(deps Deps) *Service {
	return &Service{deps: deps}
}

// projectWithWorkspaces is the project + live workspaces shape returned by
// project.listWithWorkspaces and the project mutations.
type projectWithWorkspaces struct {
	sqlite.Project
	Workspaces []sqlite.Workspace `json:"workspaces"`
}

func (s *Service) store() *sqlite.ProjectStore {
	return sqlite.NewProjectStore(s.deps.Database)
}

func (s *Service) apiConfigured() bool {
	return s.deps.Session != nil && s.deps.Session.APIConfigured()
}

// List returns the organization's local projects.
func (s *Service) List(ctx context.Context, req rpc.ProjectListParams) (any, error) {
	if s.deps.Database == nil {
		return []sqlite.Project{}, nil
	}
	s.EnsureImported(ctx, req.OrganizationID)
	projects, err := s.store().ListByOrganization(ctx, req.OrganizationID)
	if err != nil {
		return nil, fmt.Errorf("list projects: %w", err)
	}
	return projects, nil
}

// ListWithWorkspaces returns the organization's local projects with this
// host's live workspaces.
func (s *Service) ListWithWorkspaces(ctx context.Context, req rpc.ProjectListWithWorkspacesParams) (any, error) {
	if s.deps.Database == nil {
		return []projectWithWorkspaces{}, nil
	}
	s.EnsureImported(ctx, req.OrganizationID)
	projects, err := s.store().ListByOrganization(ctx, req.OrganizationID)
	if err != nil {
		return nil, fmt.Errorf("list projects: %w", err)
	}
	results := make([]projectWithWorkspaces, 0, len(projects))
	for _, project := range projects {
		withWorkspaces, err := s.withWorkspaces(ctx, project)
		if err != nil {
			return nil, err
		}
		results = append(results, withWorkspaces)
	}
	return results, nil
}

func (s *Service) withWorkspaces(ctx context.Context, project sqlite.Project) (projectWithWorkspaces, error) {
	workspaces, err := sqlite.NewWorkspaceStore(s.deps.Database).ListLiveByProject(ctx, project.ID)
	if err != nil {
		return projectWithWorkspaces{}, fmt.Errorf("list workspaces for project %q: %w", project.ID, err)
	}
	return projectWithWorkspaces{Project: project, Workspaces: workspaces}, nil
}

// Project returns one local project (used by the workspace and Local
// Task services).
func (s *Service) Project(ctx context.Context, projectID string) (sqlite.Project, bool, error) {
	if s.deps.Database == nil {
		return sqlite.Project{}, false, nil
	}
	project, err := s.store().Get(ctx, projectID)
	if err != nil {
		if isNotFound(err) {
			return sqlite.Project{}, false, nil
		}
		return sqlite.Project{}, false, err
	}
	return project, true, nil
}
