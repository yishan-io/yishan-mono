package cloud

import (
	"context"
	"encoding/json"
	"errors"
	"time"
)

// Scheduled-job run endpoints and the job DTO.

type ScheduledJob struct {
	ID               string `json:"id"`
	OrganizationID   string `json:"organizationId"`
	ProjectID        string `json:"projectId"`
	NodeID           string `json:"nodeId"`
	Name             string `json:"name"`
	AgentKind        string `json:"agentKind"`
	Prompt           string `json:"prompt"`
	Model            string `json:"model,omitempty"`
	Command          string `json:"command,omitempty"`
	CronExpression   string `json:"cronExpression"`
	Timezone         string `json:"timezone"`
	Status           string `json:"status"`
	NextRunAt        string `json:"nextRunAt"`
	LastScheduledFor string `json:"lastScheduledFor"`
	LastRunAt        string `json:"lastRunAt"`
	LastRunStatus    string `json:"lastRunStatus"`
	LastErrorCode    string `json:"lastErrorCode"`
	LastErrorMessage string `json:"lastErrorMessage"`
	CreatedByUserID  string `json:"createdByUserId"`
	CreatedAt        string `json:"createdAt"`
	UpdatedAt        string `json:"updatedAt"`
}

// ClaimScheduledJobInput identifies the scheduled job occurrence to claim.
type ClaimScheduledJobInput struct {
	JobID             string
	ExpectedNextRunAt time.Time
}

// ClaimScheduledJobResponse is a claimed occurrence ready for local execution.
type ClaimScheduledJobResponse struct {
	RunID        string       `json:"runId"`
	ScheduledFor string       `json:"scheduledFor"`
	ProjectPath  string       `json:"projectPath"`
	Job          ScheduledJob `json:"job"`
}

// ClaimScheduledJobContext atomically claims a due job occurrence while honoring ctx.
func (c *Client) ClaimScheduledJobContext(ctx context.Context, nodeID string, input ClaimScheduledJobInput) (ClaimScheduledJobResponse, error) {
	var response ClaimScheduledJobResponse
	err := c.DoDecodeContext(ctx, "POST", "/nodes/"+nodeID+"/scheduled-jobs/claim", map[string]string{
		"jobId":             input.JobID,
		"expectedNextRunAt": input.ExpectedNextRunAt.UTC().Format(utcMillisecondsFormat),
	}, &response)
	return response, err
}

const utcMillisecondsFormat = "2006-01-02T15:04:05.000Z"

// ProtectedScheduledJob identifies an armed or claiming occurrence that reconciliation must retain.
type ProtectedScheduledJob struct {
	JobID     string
	NextRunAt time.Time
}

// ReconcileScheduledJobsInput specifies occurrences protected from reconciliation advancement.
type ReconcileScheduledJobsInput struct {
	ProtectedJobs []ProtectedScheduledJob
}

// ListScheduledJobsResponse is the active scheduled-job snapshot for a node.
type ListScheduledJobsResponse struct {
	Jobs []ScheduledJob `json:"jobs"`
}

// ReconcileScheduledJobsContext fetches the active scheduled-job snapshot while protecting known occurrences.
func (c *Client) ReconcileScheduledJobsContext(ctx context.Context, nodeID string, input ReconcileScheduledJobsInput) (ListScheduledJobsResponse, error) {
	protectedJobs := make([]map[string]string, len(input.ProtectedJobs))
	for index, protectedJob := range input.ProtectedJobs {
		protectedJobs[index] = map[string]string{
			"jobId":     protectedJob.JobID,
			"nextRunAt": protectedJob.NextRunAt.UTC().Format(utcMillisecondsFormat),
		}
	}
	var response ListScheduledJobsResponse
	err := c.DoDecodeContext(ctx, "POST", "/nodes/"+nodeID+"/scheduled-jobs/reconcile", map[string]any{
		"protectedJobs": protectedJobs,
	}, &response)
	return response, err
}

type StartScheduledJobRunInput struct {
	RunID     string
	StartedAt string
}

// StartScheduledJobRunResponse records whether this caller won the start transition.
type StartScheduledJobRunResponse struct {
	OK      bool `json:"ok"`
	Started bool `json:"started"`
}

// CompleteScheduledJobRunResponse records whether the server accepted the supplied terminal result.
type CompleteScheduledJobRunResponse struct {
	OK       bool `json:"ok"`
	Accepted bool `json:"accepted"`
}

type CompleteScheduledJobRunInput struct {
	RunID        string
	FinishedAt   string
	Status       string
	ResponseBody string
	ErrorCode    string
	ErrorMessage string
	ErrorDetails map[string]any
}

// StartScheduledJobRunContext marks a scheduled run started while honoring ctx.
func (c *Client) StartScheduledJobRunContext(ctx context.Context, nodeID string, input StartScheduledJobRunInput) (StartScheduledJobRunResponse, error) {
	payload := map[string]any{
		"runId": input.RunID,
	}
	if input.StartedAt != "" {
		payload["startedAt"] = input.StartedAt
	}

	var response StartScheduledJobRunResponse
	err := c.DoDecodeContext(ctx, "PUT", "/nodes/"+nodeID+"/scheduled-jobs/runs/start", payload, &response)
	return response, err
}

// StartScheduledJobRun marks a scheduled run started with a background context.
func (c *Client) StartScheduledJobRun(nodeID string, input StartScheduledJobRunInput) (StartScheduledJobRunResponse, error) {
	return c.StartScheduledJobRunContext(context.Background(), nodeID, input)
}

// CompleteScheduledJobRunContext records a terminal scheduled run result while honoring ctx.
func (c *Client) CompleteScheduledJobRunContext(ctx context.Context, nodeID string, input CompleteScheduledJobRunInput) (CompleteScheduledJobRunResponse, error) {
	payload := map[string]any{
		"runId":  input.RunID,
		"status": input.Status,
	}
	if input.FinishedAt != "" {
		payload["finishedAt"] = input.FinishedAt
	}
	if input.ResponseBody != "" {
		payload["responseBody"] = input.ResponseBody
	}
	if input.ErrorCode != "" {
		payload["errorCode"] = input.ErrorCode
	}
	if input.ErrorMessage != "" {
		payload["errorMessage"] = input.ErrorMessage
	}
	if len(input.ErrorDetails) > 0 {
		payload["errorDetails"] = input.ErrorDetails
	}

	var response CompleteScheduledJobRunResponse
	err := c.DoDecodeContext(ctx, "PUT", "/nodes/"+nodeID+"/scheduled-jobs/runs/complete", payload, &response)
	return response, err
}

// CompleteScheduledJobRun records a terminal scheduled run result with a background context.
func (c *Client) CompleteScheduledJobRun(nodeID string, input CompleteScheduledJobRunInput) (CompleteScheduledJobRunResponse, error) {
	return c.CompleteScheduledJobRunContext(context.Background(), nodeID, input)
}

const scheduledJobRunTransitionUnavailableCode = "SCHEDULED_JOB_RUN_TRANSITION_UNAVAILABLE"

// IsScheduledJobRunStartRejected reports whether the API authoritatively rejected a run start transition.
func IsScheduledJobRunStartRejected(err error) bool {
	var apiErr *APIError
	if !errors.As(err, &apiErr) || apiErr == nil || apiErr.StatusCode != 409 {
		return false
	}
	var response struct {
		Code string `json:"code"`
	}
	return json.Unmarshal(apiErr.Body, &response) == nil && response.Code == scheduledJobRunTransitionUnavailableCode
}

// IsScheduledJobRunRetryable reports whether a scheduled-job API failure can be retried.
func IsScheduledJobRunRetryable(err error) bool {
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return false
	}
	var refreshErr *TokenRefreshError
	if errors.As(err, &refreshErr) {
		return !refreshErr.Permanent
	}
	var apiErr *APIError
	if errors.As(err, &apiErr) {
		return apiErr.StatusCode < 400 || apiErr.StatusCode >= 500
	}
	return true
}
