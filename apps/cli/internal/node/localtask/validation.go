package localtask

import (
	"context"
	"fmt"
	"strings"

	domain "yishan/apps/cli/internal/localtask"
	"yishan/apps/cli/internal/rpc"
)

func requireIdentifier(identifier string, field string) (string, error) {
	identifier = strings.TrimSpace(identifier)
	if identifier == "" {
		return "", fmt.Errorf("%s is required: %w", field, domain.ErrInvalidTask)
	}
	return identifier, nil
}

func taskFilter(req rpc.LocalTaskListParams) domain.TaskFilter {
	filter := domain.TaskFilter{
		ProjectID: req.ProjectID, Status: req.Status, Priority: req.Priority,
	}
	if req.WorkspaceID != nil {
		workspaceID := strings.TrimSpace(*req.WorkspaceID)
		filter.WorkspaceID = &workspaceID
	}
	return filter
}

func (s *Service) validateFilter(ctx context.Context, filter domain.TaskFilter) error {
	if filter.Status != nil && !isValidStatus(*filter.Status) {
		return fmt.Errorf("invalid status: %w", domain.ErrInvalidTask)
	}
	if filter.Priority != nil && !isValidPriority(*filter.Priority) {
		return fmt.Errorf("invalid priority: %w", domain.ErrInvalidTask)
	}
	if filter.WorkspaceID == nil {
		return nil
	}
	workspaceID, err := requireIdentifier(*filter.WorkspaceID, "workspaceId")
	if err != nil {
		return err
	}
	return s.requireLocalWorkspace(ctx, workspaceID)
}

func isValidStatus(status domain.Status) bool {
	return status == domain.StatusActive || status == domain.StatusPaused || status == domain.StatusCompleted
}

func isValidPriority(priority domain.Priority) bool {
	return priority == domain.PriorityLow || priority == domain.PriorityMedium || priority == domain.PriorityHigh
}
