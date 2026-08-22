package localtask

import (
	"context"
	"errors"
	"testing"

	domain "yishan/apps/cli/internal/localtask"
	"yishan/apps/cli/internal/rpc"
)

func TestService_RequiredIdentifiersReturnDomainValidationErrors(t *testing.T) {
	service, _, _ := newTestService(t)
	tests := []struct {
		name string
		call func() error
	}{
		{"get task", func() error { _, err := service.Get(context.Background(), rpc.LocalTaskIDParams{}); return err }},
		{"update task", func() error { _, err := service.Update(context.Background(), rpc.LocalTaskUpdateParams{}); return err }},
		{"unlink workspace", func() error {
			_, err := service.UnlinkWorkspace(context.Background(), rpc.LocalTaskLinkIDParams{})
			return err
		}},
		{"set primary task", func() error {
			_, err := service.SetPrimary(context.Background(), rpc.LocalTaskSetPrimaryParams{})
			return err
		}},
		{"list workspace links", func() error {
			_, err := service.ListWorkspaceLinks(context.Background(), rpc.LocalTaskWorkspaceIDParams{})
			return err
		}},
		{"list task links", func() error {
			_, err := service.ListTaskLinks(context.Background(), rpc.LocalTaskIDParams{})
			return err
		}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if err := test.call(); !errors.Is(err, domain.ErrInvalidTask) {
				t.Fatalf("error = %v, want invalid task", err)
			}
		})
	}
}

func TestService_ListRejectsInvalidPriorityAndWorkspaceFilters(t *testing.T) {
	service, _, _ := newTestService(t)
	invalidPriority := domain.Priority("urgent")
	_, err := service.List(context.Background(), rpc.LocalTaskListParams{Priority: &invalidPriority})
	if !errors.Is(err, domain.ErrInvalidTask) {
		t.Fatalf("invalid priority error = %v", err)
	}
	blankWorkspaceID := "  "
	_, err = service.List(context.Background(), rpc.LocalTaskListParams{WorkspaceID: &blankWorkspaceID})
	if !errors.Is(err, domain.ErrInvalidTask) {
		t.Fatalf("blank workspace error = %v", err)
	}
	missingWorkspaceID := "missing"
	_, err = service.List(context.Background(), rpc.LocalTaskListParams{WorkspaceID: &missingWorkspaceID})
	assertWorkspaceNotFound(t, err)
}
