// Package localtask is the Node application service for localTask.* RPCs.
package localtask

import (
	"context"
	"os"
	"path/filepath"

	"github.com/google/uuid"

	eventbus "yishan/apps/cli/internal/events"
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
	ProjectResolver     domain.ProjectResolver
	Events              *eventbus.Hub
	TaskContextsChanged func()
	TaskTitleChanged    func(context.Context, string, string)
	TemplateStore       *TemplateStore
}

// Service validates and orchestrates Local Task lifecycle operations.
type Service struct {
	deps Deps
}

// NewService builds the Local Task application service.
func NewService(deps Deps) *Service {
	return &Service{deps: deps}
}

// publishTaskChanged emits a localTaskChanged event to the frontend event hub.
func (s *Service) publishTaskChanged() {
	if s.deps.Events == nil {
		return
	}
	s.deps.Events.Publish(eventbus.Event{
		Topic:   "localTaskChanged",
		Payload: map[string]any{},
	})
}

// GetTaskTemplates returns the current template collection and agent default.
func (s *Service) GetTaskTemplates(ctx context.Context, _ struct{}) (any, error) {
	if s.deps.TemplateStore == nil {
		return rpc.LocalTaskTemplatesResult{Templates: defaultTemplateList(), AgentDefaultID: builtInTemplateID}, nil
	}
	templates, err := s.deps.TemplateStore.Load()
	if err != nil {
		return nil, err
	}
	return rpc.LocalTaskTemplatesResult{Templates: templates.Templates, AgentDefaultID: templates.AgentDefaultID}, nil
}

// SetTaskTemplates replaces the full custom template collection.
func (s *Service) SetTaskTemplates(ctx context.Context, req rpc.LocalTaskSetTemplatesParams) (any, error) {
	if s.deps.TemplateStore == nil {
		return nil, ErrInvalidTemplates
	}
	if err := s.deps.TemplateStore.Save(domain.TemplatesData{
		Templates: req.Templates, AgentDefaultID: req.AgentDefaultID,
	}); err != nil {
		return nil, err
	}
	return s.GetTaskTemplates(ctx, struct{}{})
}

// Create validates and persists a new Local Task.
func (s *Service) Create(ctx context.Context, req rpc.LocalTaskCreateParams) (any, error) {
	task := domain.Task{
		ID: uuid.NewString(), ProjectID: req.ProjectID, OrganizationID: req.OrganizationID, Title: req.Title, Description: req.Description,
		Status: domain.StatusNew, Priority: req.Priority, Tags: req.Tags, TagRefs: req.TagRefs,
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
	s.publishTaskChanged()
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
		Title: req.Title, Description: req.Description, Status: req.Status, Priority: req.Priority, Tags: req.Tags, TagRefs: req.TagRefs,
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
	s.publishTaskChanged()
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

// ListTags returns global Local Task tag suggestions.
func (s *Service) ListTags(ctx context.Context) (any, error) {
	tags, err := s.deps.Repository.ListTags(ctx)
	if err != nil {
		return nil, err
	}
	return tagNames(tags), nil
}

// ListTagCatalog returns global Local Task tag catalog entries including their colors.
func (s *Service) ListTagCatalog(ctx context.Context) (any, error) {
	tags, err := s.deps.Repository.ListTags(ctx)
	if err != nil {
		return nil, err
	}
	return tags, nil
}

// UpdateTagColor validates and changes a global Local Task tag catalog color.
func (s *Service) UpdateTagColor(ctx context.Context, req rpc.LocalTaskUpdateTagColorParams) (any, error) {
	update := domain.TagColorUpdate{Color: req.Color}
	selectorCount := 0
	for _, selector := range []string{req.ID, req.Tag, req.Key} {
		if selector != "" {
			selectorCount++
		}
	}
	if selectorCount != 1 {
		return nil, domain.ErrInvalidTag
	}
	id := req.ID
	if id != "" {
		if err := domain.ValidateTagID(id); err != nil {
			return nil, err
		}
	}
	if req.Tag != "" {
		displayName, err := domain.NormalizeTag(req.Tag)
		if err != nil {
			return nil, err
		}
		update.DisplayName = &displayName
	} else if req.Key != "" {
		if err := domain.ValidateTagKey(req.Key); err != nil {
			return nil, err
		}
	} else if id == "" {
		return nil, domain.ErrInvalidTag
	}
	if err := domain.ValidateTagColor(update.Color); err != nil {
		return nil, err
	}
	if id == "" {
		id = req.Key
	}
	return s.deps.Repository.UpdateTagColor(ctx, id, update)
}

// CreateTag validates and creates one stable Local Task tag.
func (s *Service) CreateTag(ctx context.Context, req rpc.LocalTaskCreateTagParams) (any, error) {
	name, err := domain.NormalizeTag(req.Name)
	if err != nil {
		return nil, err
	}
	return s.deps.Repository.CreateTag(ctx, domain.TagCreate{Name: name})
}

// RenameTag validates and renames one stable Local Task tag, reporting a merge when one occurs.
func (s *Service) RenameTag(ctx context.Context, req rpc.LocalTaskRenameTagParams) (any, error) {
	id := req.ID
	if err := domain.ValidateTagID(id); err != nil {
		return nil, err
	}
	name, err := domain.NormalizeTag(req.Name)
	if err != nil {
		return nil, err
	}
	tag, err := s.deps.Repository.RenameTag(ctx, id, name)
	if err != nil {
		return nil, err
	}
	response := rpc.LocalTaskRenameTagResult{Tag: tag}
	if tag.ID != id {
		response.RemovedTagID = &id
	}
	return response, nil
}

// DeleteTag validates and deletes one stable Local Task tag.
func (s *Service) DeleteTag(ctx context.Context, req rpc.LocalTaskDeleteTagParams) (any, error) {
	id := req.ID
	if err := domain.ValidateTagID(id); err != nil {
		return nil, err
	}
	if err := s.deps.Repository.DeleteTag(ctx, id); err != nil {
		return nil, err
	}
	return rpc.LocalTaskDeleteTagResult{DeletedTagID: id}, nil
}

func tagNames(tags []domain.Tag) []string {
	names := make([]string, len(tags))
	for index, tag := range tags {
		names[index] = tag.Name
	}
	return names
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

var contextDocumentNames = []string{"plan.md", "notes.md", "outcome.md"}

func buildContextDetails(directory string) domain.ContextDetails {
	details := domain.ContextDetails{Directory: directory, Files: make([]domain.ContextFile, 0)}
	for _, name := range contextDocumentNames {
		path := filepath.Join(directory, name)
		if isRegularFile(path) {
			details.Files = append(details.Files, domain.ContextFile{Name: name, Path: path})
		}
	}
	return details
}

func isRegularFile(path string) bool {
	fileInfo, err := os.Stat(path)
	return err == nil && fileInfo.Mode().IsRegular()
}
