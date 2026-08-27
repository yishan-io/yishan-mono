package backgroundjob

import (
	"errors"
	"strings"
	"testing"
)

func TestValidateJob_AcceptsQueuedDSHWorkspaceTaskRun(t *testing.T) {
	if err := ValidateJob(testJob()); err != nil {
		t.Fatalf("ValidateJob() error = %v", err)
	}
}

func TestValidateJob_RejectsInvalidRequiredFieldsAndContractValues(t *testing.T) {
	tests := []Job{
		withJob(func(job *Job) { job.ID = "" }),
		withJob(func(job *Job) { job.SessionID = " session-1" }),
		withJob(func(job *Job) { job.Kind = "other" }),
		withJob(func(job *Job) { job.Runtime = "other" }),
		withJob(func(job *Job) { job.Status = StatusRunning }),
		withJob(func(job *Job) { job.ResultText = "not yet" }),
	}
	for _, job := range tests {
		if err := ValidateJob(job); !errors.Is(err, ErrInvalidJob) {
			t.Errorf("ValidateJob(%#v) error = %v", job, err)
		}
	}
}

func TestValidateOutcome_RejectsValuesPastBounds(t *testing.T) {
	tests := []Outcome{
		{ResultText: strings.Repeat("a", MaxResultTextBytes+1)},
		{ErrorCode: strings.Repeat("a", MaxErrorCodeBytes+1)},
		{ErrorMessage: strings.Repeat("a", MaxErrorMessageBytes+1)},
	}
	for _, outcome := range tests {
		if err := ValidateOutcome(outcome); !errors.Is(err, ErrInvalidJob) {
			t.Errorf("ValidateOutcome(%#v) error = %v", outcome, err)
		}
	}
}

func testJob() Job {
	return Job{ID: "job-1", Kind: KindWorkspaceTaskRun, Runtime: RuntimeDSH, WorkspaceID: "workspace-1",
		ProjectID: "project-1", OrganizationID: "org-1", OwnerNodeID: "node-1", SessionID: "session-1",
		CWD: "/tmp/workspace", Prompt: "Fix it", Model: "model-1", Status: StatusQueued}
}

func withJob(update func(*Job)) Job {
	job := testJob()
	update(&job)
	return job
}
