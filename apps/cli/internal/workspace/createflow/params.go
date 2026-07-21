package createflow

import "yishan/apps/cli/internal/workspace"

type WorkspaceCreateParams struct {
	ID             string                   `json:"id,omitempty"`
	OrganizationID string                   `json:"organizationId,omitempty"`
	NodeID         string                   `json:"nodeId,omitempty"`
	ProjectID      string                   `json:"projectId,omitempty"`
	RepoKey        string                   `json:"repoKey,omitempty"`
	WorkspaceName  string                   `json:"workspaceName,omitempty"`
	SourcePath     string                   `json:"sourcePath,omitempty"`
	TargetBranch   string                   `json:"targetBranch,omitempty"`
	SourceBranch   string                   `json:"sourceBranch,omitempty"`
	ContextEnabled bool                     `json:"contextEnabled,omitempty"`
	SetupHook      string                   `json:"setupHook,omitempty"`
	TaskRun        *workspace.TaskRunConfig `json:"taskRun,omitempty"`
	Kind           string                   `json:"kind,omitempty"`
	Branch         string                   `json:"branch,omitempty"`
	ReplyNodeID    string                   `json:"replyNodeId,omitempty"`
}

type WorkspaceCreateStartedEvent struct {
	WorkspaceID    string `json:"workspaceId"`
	OrganizationID string `json:"organizationId"`
	ProjectID      string `json:"projectId"`
	WorkspaceName  string `json:"workspaceName"`
	SourceBranch   string `json:"sourceBranch"`
	Branch         string `json:"branch"`
	NodeID         string `json:"nodeId,omitempty"`
}

type WorkspaceCreateFailedEvent struct {
	WorkspaceID string `json:"workspaceId"`
	Message     string `json:"message"`
}

type RelayWorkspaceCreateEnvelope struct {
	OrganizationID string                         `json:"organizationId,omitempty"`
	ProjectID      string                         `json:"projectId,omitempty"`
	WorkspaceID    string                         `json:"workspaceId,omitempty"`
	SourceNodeID   string                         `json:"sourceNodeId,omitempty"`
	TargetNodeID   string                         `json:"targetNodeId,omitempty"`
	Change         string                         `json:"change,omitempty"`
	Started        *WorkspaceCreateStartedEvent   `json:"started,omitempty"`
	Request        *WorkspaceCreateParams         `json:"request,omitempty"`
	Progress       *workspace.CreateProgressEvent `json:"progress,omitempty"`
	Completed      map[string]any                 `json:"completed,omitempty"`
	Failed         *WorkspaceCreateFailedEvent    `json:"failed,omitempty"`
}
