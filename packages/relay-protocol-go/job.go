package relayprotocol

// JobRunParams is the job.run notification params (server -> node).
type JobRunParams struct {
	RunID          string         `json:"runId"`
	JobID          string         `json:"jobId"`
	ScheduledFor   string         `json:"scheduledFor"`
	IdempotencyKey string         `json:"idempotencyKey"`
	Payload        map[string]any `json:"payload"`
}

// JobAckParams is the job.ack notification params (node -> server).
type JobAckParams struct {
	RunID  string `json:"runId"`
	Status string `json:"status"` // "accepted" | "rejected"
	Reason string `json:"reason,omitempty"`
}

// JobResultParams is the job.result notification params (node -> server).
type JobResultParams struct {
	RunID      string         `json:"runId"`
	Status     string         `json:"status"` // "completed" | "failed" | "cancelled"
	Output     map[string]any `json:"output,omitempty"`
	Error      *JobError      `json:"error,omitempty"`
	DurationMs int64          `json:"durationMs,omitempty"`
}

// JobError is the error payload within a job.result.
type JobError struct {
	Code    string `json:"code,omitempty"`
	Message string `json:"message"`
	Details any    `json:"details,omitempty"`
}
