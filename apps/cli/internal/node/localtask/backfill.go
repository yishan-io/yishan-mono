package localtask

import (
	"context"
	"errors"
	"fmt"

	domain "yishan/apps/cli/internal/localtask"
)

// BackfillTaskKeys reserves and persists keys for legacy Local Tasks.
// It is safe to retry: the cloud reservation uses the stable local task ID,
// and SQLite only writes a key while the row is still unkeyed.
func (s *Service) BackfillTaskKeys(ctx context.Context) error {
	tasks, err := s.deps.Repository.ListWithoutTaskKey(ctx)
	if err != nil {
		return err
	}
	var backfillErrors []error
	for _, task := range tasks {
		if ctx.Err() != nil {
			return errors.Join(append(backfillErrors, ctx.Err())...)
		}
		if err := s.backfillTaskKey(ctx, task); err != nil {
			backfillErrors = append(backfillErrors, fmt.Errorf("backfill Local Task key for %q: %w", task.ID, err))
		}
	}
	return errors.Join(backfillErrors...)
}

func (s *Service) backfillTaskKey(ctx context.Context, task domain.Task) error {
	key, err := s.allocateTaskKey(ctx, task)
	if err != nil {
		return err
	}
	_, err = s.deps.Repository.SetTaskKeyIfEmpty(ctx, task.ID, *key)
	if err != nil {
		return fmt.Errorf("persist reserved Local Task key: %w", err)
	}
	return nil
}
