package backgroundjob

import "context"

// Repository persists daemon-owned no-tab DSH workspace task runs.
type Repository interface {
	Create(context.Context, Job) (Job, error)
	Get(context.Context, string) (Job, error)
	ListByWorkspace(context.Context, string) ([]Job, error)
	CompareAndSwapStatus(context.Context, string, Status, Status, Outcome) (Job, bool, error)
	ListForStartupRecovery(context.Context) ([]Job, error)
}
