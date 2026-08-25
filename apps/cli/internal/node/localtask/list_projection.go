package localtask

import (
	"context"
	"sort"
	"strings"

	domain "yishan/apps/cli/internal/localtask"
	"yishan/apps/cli/internal/rpc"
)

// ListProjection returns Task Hub rows with project display metadata resolved in bulk.
func (s *Service) ListProjection(ctx context.Context, req rpc.LocalTaskListProjectionParams) (any, error) {
	filter := taskFilter(req.LocalTaskListParams)
	if err := s.validateFilter(ctx, filter); err != nil {
		return nil, err
	}
	tasks, err := s.listProjectionTasks(ctx, req, filter)
	if err != nil {
		return nil, err
	}
	total := len(tasks)
	projectsByID, err := s.resolveListProjects(ctx, tasks)
	if err != nil {
		return nil, err
	}
	tasks = projectPage(tasks, req.Offset, req.Limit)
	return domain.ListProjection{Tasks: tasks, ProjectsByID: projectsByID, Total: total}, nil
}

func (s *Service) resolveListProjects(ctx context.Context, tasks []domain.Task) (map[string]domain.ProjectDisplay, error) {
	if s.deps.ProjectResolver == nil {
		return map[string]domain.ProjectDisplay{}, nil
	}
	projectIDsByOrganization := projectIDsByOrganization(tasks)
	if len(projectIDsByOrganization) == 0 {
		return map[string]domain.ProjectDisplay{}, nil
	}
	return s.deps.ProjectResolver.ResolveTaskProjects(ctx, projectIDsByOrganization)
}

func projectIDsByOrganization(tasks []domain.Task) map[string][]string {
	projectIDsByOrganization := make(map[string][]string)
	seenByOrganization := make(map[string]map[string]struct{})
	for _, task := range tasks {
		if task.ProjectID == nil || task.OrganizationID == nil {
			continue
		}
		organizationID := *task.OrganizationID
		if seenByOrganization[organizationID] == nil {
			seenByOrganization[organizationID] = make(map[string]struct{})
		}
		if _, exists := seenByOrganization[organizationID][*task.ProjectID]; exists {
			continue
		}
		seenByOrganization[organizationID][*task.ProjectID] = struct{}{}
		projectIDsByOrganization[organizationID] = append(projectIDsByOrganization[organizationID], *task.ProjectID)
	}
	for organizationID := range projectIDsByOrganization {
		sort.Strings(projectIDsByOrganization[organizationID])
	}
	return projectIDsByOrganization
}

func (s *Service) listProjectionTasks(ctx context.Context, req rpc.LocalTaskListProjectionParams, filter domain.TaskFilter) ([]domain.Task, error) {
	if strings.TrimSpace(req.Query) == "" {
		return s.deps.Repository.List(ctx, filter)
	}
	query, err := requireIdentifier(req.Query, "query")
	if err != nil {
		return nil, err
	}
	results, err := s.deps.Repository.Search(ctx, query, filter)
	if err != nil {
		return nil, err
	}
	tasks := make([]domain.Task, len(results))
	for index, result := range results {
		tasks[index] = result.Task
	}
	return tasks, nil
}

func projectPage(tasks []domain.Task, offset, limit int) []domain.Task {
	if offset < 0 || limit < 0 || offset >= len(tasks) {
		return []domain.Task{}
	}
	if limit == 0 || offset+limit > len(tasks) {
		return tasks[offset:]
	}
	return tasks[offset : offset+limit]
}
