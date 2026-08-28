package backgroundjob

import "context"

// Create persists a validated daemon-owned job and publishes its queued state.
func (s *Service) Create(ctx context.Context, job Job) (Job, error) {
	created, err := s.createAdmitted(ctx, job)
	if err != nil {
		return Job{}, err
	}
	s.notify(created)
	return created, nil
}

func (s *Service) createAdmitted(ctx context.Context, job Job) (Job, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.isClosed {
		return Job{}, errServiceClosed
	}
	if s.closing[job.WorkspaceID] {
		return Job{}, errWorkspaceClosing
	}
	return s.repository.Create(ctx, job)
}

// Get loads a durable background job.
func (s *Service) Get(ctx context.Context, jobID string) (Job, error) {
	return s.repository.Get(ctx, jobID)
}

// ListByWorkspace loads durable jobs for one workspace.
func (s *Service) ListByWorkspace(ctx context.Context, workspaceID string) ([]Job, error) {
	return s.repository.ListByWorkspace(ctx, workspaceID)
}
