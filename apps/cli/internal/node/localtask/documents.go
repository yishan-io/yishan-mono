package localtask

import (
	"context"
	"fmt"
	"strings"

	domain "yishan/apps/cli/internal/localtask"
	"yishan/apps/cli/internal/rpc"
)

// FinishPartialError reports that the outcome document was persisted but the
// done transition failed, so a retry only needs to repeat the status update.
type FinishPartialError struct {
	TaskID string
	Cause  error
}

// Error describes the partial success and the safe retry.
func (err *FinishPartialError) Error() string {
	return "outcome for task " + err.TaskID + " was saved, but marking the task done failed: " +
		err.Cause.Error() + "; run finish again to mark it done"
}

// Unwrap exposes the status-update failure for errors.Is and errors.As.
func (err *FinishPartialError) Unwrap() error { return err.Cause }

// ReadDocument returns the body of one approved Task Context document.
func (s *Service) ReadDocument(ctx context.Context, req rpc.LocalTaskReadDocumentParams) (any, error) {
	task, directory, err := s.documentTarget(ctx, req.ID)
	if err != nil {
		return nil, err
	}
	document, err := domain.ParseTaskDocument(req.Document)
	if err != nil {
		return nil, err
	}
	content, err := domain.ReadDocument(directory, document)
	if err != nil {
		return nil, err
	}
	return rpc.LocalTaskDocumentResult{ID: task.ID, Document: string(document), Content: content}, nil
}

// WriteDocument replaces one approved Task Context document.
func (s *Service) WriteDocument(ctx context.Context, req rpc.LocalTaskWriteDocumentParams) (any, error) {
	task, directory, err := s.documentTarget(ctx, req.ID)
	if err != nil {
		return nil, err
	}
	document, err := domain.ParseTaskDocument(req.Document)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.Content) == "" {
		return nil, fmt.Errorf("content is required: %w", domain.ErrInvalidTask)
	}
	if err := domain.WriteDocument(directory, document, req.Content); err != nil {
		return nil, err
	}
	return rpc.LocalTaskDocumentWriteResult{ID: task.ID, Document: string(document)}, nil
}

// AppendNote appends content to one task's notes document.
func (s *Service) AppendNote(ctx context.Context, req rpc.LocalTaskAppendNoteParams) (any, error) {
	task, directory, err := s.documentTarget(ctx, req.ID)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.Content) == "" {
		return nil, fmt.Errorf("content is required: %w", domain.ErrInvalidTask)
	}
	if err := domain.AppendNote(directory, req.Content); err != nil {
		return nil, err
	}
	return rpc.LocalTaskDocumentWriteResult{ID: task.ID, Document: string(domain.DocumentNotes)}, nil
}

// Finish stores the outcome, then marks the task done. The outcome is written
// first so a failed status update is a recognizable, safely retryable partial
// success instead of a lost outcome.
func (s *Service) Finish(ctx context.Context, req rpc.LocalTaskFinishParams) (any, error) {
	task, directory, err := s.documentTarget(ctx, req.ID)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.Outcome) == "" {
		return nil, fmt.Errorf("outcome is required: %w", domain.ErrInvalidTask)
	}
	if err := domain.WriteDocument(directory, domain.DocumentOutcome, req.Outcome); err != nil {
		return nil, err
	}
	if task.Status == domain.StatusDone {
		return rpc.LocalTaskFinishResult{ID: task.ID, Status: task.Status}, nil
	}
	return s.markTaskDone(ctx, task.ID)
}

func (s *Service) markTaskDone(ctx context.Context, taskID string) (any, error) {
	status := domain.StatusDone
	updated, err := s.deps.Repository.Update(ctx, taskID, domain.TaskUpdate{Status: &status})
	if err != nil {
		return nil, &FinishPartialError{TaskID: taskID, Cause: err}
	}
	s.publishTaskChanged()
	return rpc.LocalTaskFinishResult{ID: updated.ID, Status: updated.Status}, nil
}

// documentTarget resolves one task and its daemon-derived context directory.
func (s *Service) documentTarget(ctx context.Context, rawID string) (domain.Task, string, error) {
	taskID, err := requireIdentifier(rawID, "id")
	if err != nil {
		return domain.Task{}, "", err
	}
	task, err := s.deps.Repository.Get(ctx, taskID)
	if err != nil {
		return domain.Task{}, "", err
	}
	directory, err := s.resolveContextDirectory(task)
	if err != nil {
		return domain.Task{}, "", err
	}
	if strings.TrimSpace(directory) == "" {
		return domain.Task{}, "", fmt.Errorf("empty context directory: %w", domain.ErrContextUnavailable)
	}
	return task, directory, nil
}
