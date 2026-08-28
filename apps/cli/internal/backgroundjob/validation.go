package backgroundjob

import "strings"

// ValidateJob validates a new durable workspace task run.
func ValidateJob(job Job) error {
	if !hasRequiredFields(job) || job.Kind != KindWorkspaceTaskRun || job.Runtime != RuntimeDSH || job.Status != StatusQueued {
		return ErrInvalidJob
	}
	if job.Outcome() != (Outcome{}) {
		return ErrInvalidJob
	}
	return nil
}

// ValidateOutcome validates bounded final result fields.
func ValidateOutcome(outcome Outcome) error {
	if len(outcome.ResultText) > MaxResultTextBytes || len(outcome.ErrorCode) > MaxErrorCodeBytes || len(outcome.ErrorMessage) > MaxErrorMessageBytes {
		return ErrInvalidJob
	}
	return nil
}

func hasRequiredFields(job Job) bool {
	for _, field := range []string{job.ID, job.WorkspaceID, job.ProjectID, job.OrganizationID, job.OwnerNodeID, job.SessionID, job.CWD, job.Prompt, job.Model} {
		if strings.TrimSpace(field) == "" || strings.TrimSpace(field) != field {
			return false
		}
	}
	return true
}

// Outcome returns the final result fields from job.
func (job Job) Outcome() Outcome {
	return Outcome{ResultText: job.ResultText, ErrorCode: job.ErrorCode, ErrorMessage: job.ErrorMessage}
}
