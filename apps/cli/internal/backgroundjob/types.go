// Package backgroundjob defines daemon-owned durable workspace task runs.
package backgroundjob

import "errors"

const (
	// MaxResultTextBytes bounds the retained final result; transcripts are not retained.
	MaxResultTextBytes = 64 * 1024
	// MaxErrorCodeBytes bounds a machine-readable failure code.
	MaxErrorCodeBytes = 128
	// MaxErrorMessageBytes bounds a human-readable failure detail.
	MaxErrorMessageBytes = 4096
)

const (
	// KindWorkspaceTaskRun identifies a background workspace task run.
	KindWorkspaceTaskRun Kind = "workspace-task-run"
	// RuntimeDSH identifies DSH as the job runtime.
	RuntimeDSH Runtime = "dsh"
)

const (
	StatusQueued      Status = "queued"
	StatusRunning     Status = "running"
	StatusSucceeded   Status = "succeeded"
	StatusFailed      Status = "failed"
	StatusCancelled   Status = "cancelled"
	StatusInterrupted Status = "interrupted"
)

var (
	ErrJobNotFound       = errors.New("background job not found")
	ErrInvalidJob        = errors.New("invalid background job")
	ErrInvalidTransition = errors.New("invalid background job status transition")
)

// Kind classifies the job request.
type Kind string

// Runtime identifies the execution runtime.
type Runtime string

// Status is the durable background-job lifecycle state.
type Status string

// Job is a daemon-owned no-tab DSH workspace task run.
type Job struct {
	ID             string
	Kind           Kind
	Runtime        Runtime
	WorkspaceID    string
	ProjectID      string
	OrganizationID string
	OwnerNodeID    string
	SessionID      string
	CWD            string
	Prompt         string
	Model          string
	Status         Status
	ResultText     string
	ErrorCode      string
	ErrorMessage   string
	CreatedAt      string
	UpdatedAt      string
	StartedAt      *string
	FinishedAt     *string
}

// Outcome contains the bounded terminal output of a job.
type Outcome struct {
	ResultText   string
	ErrorCode    string
	ErrorMessage string
}
