package localtask

import (
	"context"
	"errors"
	"fmt"

	domain "yishan/apps/cli/internal/localtask"
)

// ListContextRoots derives Memory indexing roots from authoritative Local Task records.
func (s *Service) ListContextRoots(ctx context.Context) ([]domain.ContextRoot, error) {
	tasks, err := s.deps.Repository.List(ctx, domain.TaskFilter{})
	if err != nil {
		return nil, fmt.Errorf("list local tasks for context indexing: %w", err)
	}
	roots := make([]domain.ContextRoot, 0, len(tasks))
	for _, task := range tasks {
		root, resolveErr := s.contextRoot(task)
		if errors.Is(resolveErr, domain.ErrContextUnavailable) {
			continue
		}
		if resolveErr != nil {
			return nil, fmt.Errorf("resolve task context %s: %w", task.ID, resolveErr)
		}
		roots = append(roots, root)
	}
	return roots, nil
}

func (s *Service) contextRoot(task domain.Task) (domain.ContextRoot, error) {
	directory, err := s.resolveContextDirectory(task)
	if err != nil {
		return domain.ContextRoot{}, err
	}
	projectID := ""
	if task.ProjectID != nil {
		projectID = *task.ProjectID
	}
	return domain.ContextRoot{
		TaskID: task.ID, TaskTitle: task.Title, ProjectID: projectID, Directory: directory,
	}, nil
}
