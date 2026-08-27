package backgroundjob

// PublicJob is the bounded RPC-safe projection of a background job.
type PublicJob struct {
	ID          string       `json:"id"`
	WorkspaceID string       `json:"workspaceId"`
	Prompt      string       `json:"prompt"`
	Model       string       `json:"model"`
	Status      Status       `json:"status"`
	Result      PublicResult `json:"result"`
	CreatedAt   string       `json:"createdAt"`
	UpdatedAt   string       `json:"updatedAt"`
	StartedAt   *string      `json:"startedAt,omitempty"`
	FinishedAt  *string      `json:"finishedAt,omitempty"`
}

// PublicResult is the bounded final output of a background job.
type PublicResult struct {
	Text         string `json:"text,omitempty"`
	ErrorCode    string `json:"errorCode,omitempty"`
	ErrorMessage string `json:"errorMessage,omitempty"`
}

// PublicJobFrom projects a durable job without its execution control fields.
func PublicJobFrom(job Job) PublicJob {
	return PublicJob{
		ID: job.ID, WorkspaceID: job.WorkspaceID, Prompt: job.Prompt, Model: job.Model, Status: job.Status,
		Result:    PublicResult{Text: job.ResultText, ErrorCode: job.ErrorCode, ErrorMessage: job.ErrorMessage},
		CreatedAt: job.CreatedAt, UpdatedAt: job.UpdatedAt, StartedAt: job.StartedAt, FinishedAt: job.FinishedAt,
	}
}
