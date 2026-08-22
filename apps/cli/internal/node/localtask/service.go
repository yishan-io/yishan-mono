// Package localtask is the Node application service for localTask.* RPCs.
package localtask

import (
	"context"
	"path/filepath"

	"github.com/google/uuid"

	domain "yishan/apps/cli/internal/localtask"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
)

// WorkspaceRegistry exposes open local workspaces on this node.
type WorkspaceRegistry interface {
	Get(workspaceID string) (workspace.Workspace, bool)
	List() []workspace.Workspace
}

// Deps are the explicit dependencies of the Local Task application service.
type Deps struct {
	Repository          domain.Repository
	Registry            WorkspaceRegistry
	WorkspaceStore      workspace.WorkspaceStore
	TaskContextsChanged func()
	TaskTitleChanged    func(context.Context, string, string)
}

// Service validates and orchestrates Local Task lifecycle operations.
type Service struct {
	deps Deps
}

// NewService builds the Local Task application service.
func NewService(deps Deps) *Service {
	return &Service{deps: deps}
}

// Create validates and persists a new Local Task.
func (s *Service) Create(ctx context.Context, req rpc.LocalTaskCreateParams) (any, error) {
	task := domain.Task{
		ID: uuid.NewString(), ProjectID: req.ProjectID, Title: req.Title, Description: req.Description,
		Status: domain.StatusActive, Priority: req.Priority,
	}
	if task.Priority == "" {
		task.Priority = domain.PriorityMedium
	}
	if err := domain.ValidateTask(task); err != nil {
		return nil, err
	}
	created, err := s.deps.Repository.Create(ctx, task)
	if err != nil {
		return nil, err
	}
	if s.deps.TaskContextsChanged != nil {
		s.deps.TaskContextsChanged()
	}
	return created, nil
}

// Get loads one Local Task.
func (s *Service) Get(ctx context.Context, req rpc.LocalTaskIDParams) (any, error) {
	taskID, err := requireIdentifier(req.ID, "id")
	if err != nil {
		return nil, err
	}
	task, err := s.deps.Repository.Get(ctx, taskID)
	return task, err
}

// List loads Local Tasks matching optional filters.
func (s *Service) List(ctx context.Context, req rpc.LocalTaskListParams) (any, error) {
	filter := taskFilter(req)
	if err := s.validateFilter(ctx, filter); err != nil {
		return nil, err
	}
	tasks, err := s.deps.Repository.List(ctx, filter)
	return tasks, err
}

// Update validates and applies Local Task metadata and lifecycle changes.
func (s *Service) Update(ctx context.Context, req rpc.LocalTaskUpdateParams) (any, error) {
	taskID, err := requireIdentifier(req.ID, "id")
	if err != nil {
		return nil, err
	}
	update := domain.TaskUpdate{
		Title: req.Title, Description: req.Description, Status: req.Status, Priority: req.Priority,
	}
	if err := domain.ValidateTaskUpdate(update); err != nil {
		return nil, err
	}
	updated, err := s.deps.Repository.Update(ctx, taskID, update)
	if err != nil {
		return nil, err
	}
	if req.Title != nil && s.deps.TaskTitleChanged != nil {
		s.deps.TaskTitleChanged(ctx, updated.ID, updated.Title)
	}
	return updated, nil
}

// Search searches Local Task metadata with optional filters.
func (s *Service) Search(ctx context.Context, req rpc.LocalTaskSearchParams) (any, error) {
	query, err := requireIdentifier(req.Query, "query")
	if err != nil {
		return nil, err
	}
	filter := taskFilter(req.LocalTaskListParams)
	if err := s.validateFilter(ctx, filter); err != nil {
		return nil, err
	}
	results, err := s.deps.Repository.Search(ctx, query, filter)
	return results, err
}

// GetContextDetails derives approved v1 document paths for one Local Task.
func (s *Service) GetContextDetails(ctx context.Context, req rpc.LocalTaskIDParams) (any, error) {
	taskID, err := requireIdentifier(req.ID, "id")
	if err != nil {
		return nil, err
	}
	task, err := s.deps.Repository.Get(ctx, taskID)
	if err != nil {
		return nil, err
	}
	directory, err := s.resolveContextDirectory(task)
	if err != nil {
		return nil, err
	}
	return buildContextDetails(directory), nil
}

func (s *Service) resolveContextDirectory(task domain.Task) (string, error) {
	workspaces := make([]domain.ContextWorkspace, 0)
	if s.deps.Registry != nil {
		for _, localWorkspace := range s.deps.Registry.List() {
			workspaces = append(workspaces, domain.ContextWorkspace{
				ProjectID: localWorkspace.ProjectID, WorktreePath: localWorkspace.Path,
			})
		}
	}
	return domain.ResolveTaskContextPath(task, workspaces)
}

func buildContextDetails(directory string) domain.ContextDetails {
	return domain.ContextDetails{
		Directory: directory, PlanPath: filepath.Join(directory, "plan.md"),
		NotesPath: filepath.Join(directory, "notes.md"), OutcomePath: filepath.Join(directory, "outcome.md"),
	}
}
