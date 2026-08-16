package cloud

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

type StartScheduledJobRunInput struct {
	RunID     string
	StartedAt string
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

func (c *Client) StartScheduledJobRun(nodeID string, input StartScheduledJobRunInput) (OKResponse, error) {
	payload := map[string]any{
		"runId": input.RunID,
	}
	if input.StartedAt != "" {
		payload["startedAt"] = input.StartedAt
	}

	var response OKResponse
	err := c.DoDecode("PUT", "/nodes/"+nodeID+"/scheduled-jobs/runs/start", payload, &response)
	return response, err
}

func (c *Client) CompleteScheduledJobRun(nodeID string, input CompleteScheduledJobRunInput) (OKResponse, error) {
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

	var response OKResponse
	err := c.DoDecode("PUT", "/nodes/"+nodeID+"/scheduled-jobs/runs/complete", payload, &response)
	return response, err
}
