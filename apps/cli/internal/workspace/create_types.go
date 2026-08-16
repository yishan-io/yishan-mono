package workspace

import "time"

// Workspace create domain types: the runtime create request and its progress
// vocabulary. The provision engine (workspace/application) consumes these; the
// JSON-RPC layer converts its transport params into a CreateRequest.

// TaskRunConfig carries the optional agent task run attached to a workspace
// create.
type TaskRunConfig struct {
	AgentKind string `json:"agentKind"`
	Prompt    string `json:"prompt"`
	Model     string `json:"model,omitempty"`
}

// CreateRequest is the domain-shaped workspace create command consumed by the
// provision engine.
type CreateRequest struct {
	ID             string         `json:"id"`
	OrganizationID string         `json:"organizationId,omitempty"`
	NodeID         string         `json:"nodeId,omitempty"`
	ProjectID      string         `json:"projectId,omitempty"`
	RepoKey        string         `json:"repoKey"`
	WorkspaceName  string         `json:"workspaceName"`
	SourcePath     string         `json:"sourcePath"`
	TargetBranch   string         `json:"targetBranch"`
	SourceBranch   string         `json:"sourceBranch"`
	ContextEnabled bool           `json:"contextEnabled,omitempty"`
	SetupHook      string         `json:"setupHook,omitempty"`
	TaskRun        *TaskRunConfig `json:"taskRun,omitempty"`
}

// CreateProgressStatus is the status of one create step or of the overall
// create (publishable as workspaceCreateProgress events).
type CreateProgressStatus string

const (
	CreateProgressPending   CreateProgressStatus = "pending"
	CreateProgressRunning   CreateProgressStatus = "running"
	CreateProgressCompleted CreateProgressStatus = "completed"
	CreateProgressFailed    CreateProgressStatus = "failed"
	CreateProgressSkipped   CreateProgressStatus = "skipped"
	CreateProgressWarning   CreateProgressStatus = "warning"
)

// CreateProgressEvent is one step's progress report.
type CreateProgressEvent struct {
	WorkspaceID string               `json:"workspaceId"`
	StepID      string               `json:"stepId"`
	Label       string               `json:"label"`
	Status      CreateProgressStatus `json:"status"`
	Message     string               `json:"message,omitempty"`
	CreatedAt   string               `json:"createdAt"`
}

// CreateProgressReporter receives step progress events.
type CreateProgressReporter func(CreateProgressEvent)

// createStepTimeouts maps step IDs to their timeout durations.
type createStepTimeouts map[string]time.Duration
