package app

import (
	"context"
	"fmt"

	"github.com/rs/zerolog/log"

	"yishan/apps/cli/internal/memory"
	nodelocaltask "yishan/apps/cli/internal/node/localtask"
)

func refreshTaskContextRegistrations(ctx context.Context, memorySvc *memory.Service, localTaskSvc *nodelocaltask.Service) {
	if err := loadTaskContextRegistrations(ctx, memorySvc, localTaskSvc); err != nil {
		log.Warn().Err(err).Msg("failed to refresh Local Task context registrations")
	}
}

func refreshTaskContextTitle(ctx context.Context, memorySvc *memory.Service, localTaskSvc *nodelocaltask.Service, taskID string, taskTitle string) {
	refreshTaskContextRegistrations(ctx, memorySvc, localTaskSvc)
	if memorySvc == nil {
		return
	}
	if err := memorySvc.UpdateTaskContextTitle(taskID, taskTitle); err != nil {
		log.Warn().Err(err).Str("taskId", taskID).Msg("failed to update indexed Local Task title")
	}
}

func loadTaskContextRegistrations(ctx context.Context, memorySvc *memory.Service, localTaskSvc *nodelocaltask.Service) error {
	if memorySvc == nil || localTaskSvc == nil {
		return nil
	}
	roots, err := localTaskSvc.ListContextRoots(ctx)
	if err != nil {
		return fmt.Errorf("list context roots: %w", err)
	}
	refs := make([]memory.TaskContextRef, 0, len(roots))
	for _, root := range roots {
		refs = append(refs, memory.TaskContextRef{
			Directory: root.Directory, TaskID: root.TaskID, TaskTitle: root.TaskTitle, ProjectID: root.ProjectID,
		})
	}
	memorySvc.RegisterTaskContexts(refs)
	return nil
}
