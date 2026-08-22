package rpc

import "yishan/apps/cli/internal/localtask"

// LocalTaskCreateParams contains Local Task creation metadata.
type LocalTaskCreateParams struct {
	ProjectID   *string            `json:"projectId,omitempty"`
	Title       string             `json:"title"`
	Description string             `json:"description,omitempty"`
	Priority    localtask.Priority `json:"priority,omitempty"`
}

// LocalTaskIDParams identifies one Local Task.
type LocalTaskIDParams struct {
	ID string `json:"id"`
}

// LocalTaskListParams contains optional Local Task filters.
type LocalTaskListParams struct {
	ProjectID   *string             `json:"projectId,omitempty"`
	Status      *localtask.Status   `json:"status,omitempty"`
	Priority    *localtask.Priority `json:"priority,omitempty"`
	WorkspaceID *string             `json:"workspaceId,omitempty"`
}

// LocalTaskUpdateParams contains mutable Local Task metadata.
type LocalTaskUpdateParams struct {
	ID          string              `json:"id"`
	Title       *string             `json:"title,omitempty"`
	Description *string             `json:"description,omitempty"`
	Status      *localtask.Status   `json:"status,omitempty"`
	Priority    *localtask.Priority `json:"priority,omitempty"`
}

// LocalTaskSearchParams contains a metadata search and optional filters.
type LocalTaskSearchParams struct {
	Query string `json:"query"`
	LocalTaskListParams
}

// LocalTaskLinkWorkspaceParams creates a related workspace link.
type LocalTaskLinkWorkspaceParams struct {
	TaskID      string             `json:"taskId"`
	WorkspaceID string             `json:"workspaceId"`
	Role        localtask.LinkRole `json:"role,omitempty"`
}

// LocalTaskLinkIDParams identifies one workspace link.
type LocalTaskLinkIDParams struct {
	LinkID string `json:"linkId"`
}

// LocalTaskUpdateLinkStatusParams changes a workspace link lifecycle status.
type LocalTaskUpdateLinkStatusParams struct {
	LinkID string           `json:"linkId"`
	Status localtask.Status `json:"status"`
}

// LocalTaskSetPrimaryParams selects the active primary task for a workspace.
type LocalTaskSetPrimaryParams struct {
	TaskID      string `json:"taskId"`
	WorkspaceID string `json:"workspaceId"`
}

// LocalTaskWorkspaceIDParams identifies one local workspace.
type LocalTaskWorkspaceIDParams struct {
	WorkspaceID string `json:"workspaceId"`
}
