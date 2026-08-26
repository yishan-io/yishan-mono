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
		ProjectID: req.ProjectID, Status: req.Status, Statuses: req.Statuses, Priority: req.Priority,
	}
	if req.WorkspaceID != nil {
		workspaceID := strings.TrimSpace(*req.WorkspaceID)
		filter.WorkspaceID = &workspaceID
	}
	filter.Tags = req.Tags
	filter.TagIDs = req.TagIDs
	return filter
}

func (s *Service) validateFilter(ctx context.Context, filter domain.TaskFilter) error {
	if _, err := domain.NormalizeTags(filter.Tags); err != nil {
		return err
	}
	if err := domain.ValidateTagIDs(filter.TagIDs); err != nil {
		return err
	}
	if err := s.requireKnownTagIDs(ctx, filter.TagIDs); err != nil {
		return err
	}
	if filter.Status != nil && !isValidStatus(*filter.Status) {
		return fmt.Errorf("invalid status: %w", domain.ErrInvalidTask)
	}
	for _, status := range filter.Statuses {
		if !isValidStatus(status) {
			return fmt.Errorf("invalid status: %w", domain.ErrInvalidTask)
		}
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
	return status == domain.StatusNew || status == domain.StatusProgressing || status == domain.StatusDone || status == domain.StatusCancelled
}

func isValidPriority(priority domain.Priority) bool {
	return priority == domain.PriorityLow || priority == domain.PriorityMedium || priority == domain.PriorityHigh
}

func (s *Service) requireKnownTagIDs(ctx context.Context, tagIDs []string) error {
	if len(tagIDs) == 0 {
		return nil
	}
	tags, err := s.deps.Repository.ListTags(ctx)
	if err != nil {
		return err
	}
	knownTagIDs := make(map[string]struct{}, len(tags))
	for _, tag := range tags {
		knownTagIDs[tag.ID] = struct{}{}
	}
	for _, tagID := range tagIDs {
		if _, exists := knownTagIDs[tagID]; !exists {
			return domain.ErrTagNotFound
		}
	}
	return nil
}
