package localtask

import (
	"context"
	"fmt"
	"strings"

	domain "yishan/apps/cli/internal/localtask"
)

// KeyAllocationRequest identifies the local task whose cloud display key is reserved.
type KeyAllocationRequest struct {
	TaskID         string
	ProjectID      *string
	OrganizationID *string
	ProjectKind    *domain.ProjectKind
}

// KeyAllocator reserves cloud-backed display keys for Local Tasks.
type KeyAllocator interface {
	AllocateTaskKey(context.Context, KeyAllocationRequest) (string, error)
}

// KeyAllocationError reports why a required cloud task-key reservation failed.
type KeyAllocationError struct{ Cause error }

// Error describes the action needed to create a Local Task.
func (err *KeyAllocationError) Error() string {
	return "reserve Local Task key (check your connection and sign-in): " + err.Cause.Error()
}

// Unwrap exposes the allocation failure for errors.Is and errors.As.
func (err *KeyAllocationError) Unwrap() error { return err.Cause }

func (s *Service) allocateTaskKey(ctx context.Context, task domain.Task) (*string, error) {
	if s.deps.KeyAllocator == nil {
		return nil, &KeyAllocationError{Cause: domain.ErrKeyAllocationUnavailable}
	}
	key, err := s.deps.KeyAllocator.AllocateTaskKey(ctx, KeyAllocationRequest{
		TaskID: task.ID, ProjectID: task.ProjectID, OrganizationID: task.OrganizationID, ProjectKind: task.ProjectKind,
	})
	if err != nil {
		return nil, &KeyAllocationError{Cause: err}
	}
	if strings.TrimSpace(key) == "" {
		return nil, &KeyAllocationError{Cause: fmt.Errorf("%w: empty key response", domain.ErrKeyAllocationUnavailable)}
	}
	return &key, nil
}
