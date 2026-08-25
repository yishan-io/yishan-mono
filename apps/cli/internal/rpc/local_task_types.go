package rpc

import "yishan/apps/cli/internal/localtask"

// LocalTaskCreateParams contains Local Task creation metadata.
type LocalTaskCreateParams struct {
	ProjectID      *string            `json:"projectId,omitempty"`
	OrganizationID *string            `json:"organizationId,omitempty"`
	Title          string             `json:"title"`
	Description    string             `json:"description,omitempty"`
	Priority       localtask.Priority `json:"priority,omitempty"`
	Tags           []string           `json:"tags,omitempty"`
	TagRefs        []localtask.TagRef `json:"tagRefs,omitempty"`
}

// LocalTaskIDParams identifies one Local Task.
type LocalTaskIDParams struct {
	ID string `json:"id"`
}

// LocalTaskListProjectionParams contains Task Hub filters for the display-ready list projection.
type LocalTaskListProjectionParams struct {
	LocalTaskListParams
	Query  string `json:"query,omitempty"`
	Offset int    `json:"offset,omitempty"`
	Limit  int    `json:"limit,omitempty"`
}

// LocalTaskListParams contains optional Local Task filters.
type LocalTaskListParams struct {
	ProjectID   *string             `json:"projectId,omitempty"`
	Status      *localtask.Status   `json:"status,omitempty"`
	Priority    *localtask.Priority `json:"priority,omitempty"`
	WorkspaceID *string             `json:"workspaceId,omitempty"`
	Tags        []string            `json:"tags,omitempty"`
	TagIDs      []string            `json:"tagIds,omitempty"`
}

// LocalTaskUpdateTagColorParams changes a global Local Task tag catalog color.
// Color is the canonical uppercase #RRGGBB hex value, or null to clear.
type LocalTaskUpdateTagColorParams struct {
	ID    string  `json:"id,omitempty"`
	Tag   string  `json:"tag,omitempty"`
	Key   string  `json:"key,omitempty"`
	Color *string `json:"color"`
}

// LocalTaskCreateTagParams creates one Local Task tag by display name.
type LocalTaskCreateTagParams struct {
	Name string `json:"name"`
}

// LocalTaskRenameTagParams changes one stable Local Task tag ID's display name.
type LocalTaskRenameTagParams struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// LocalTaskDeleteTagParams identifies one stable Local Task tag ID to remove.
type LocalTaskDeleteTagParams struct {
	ID string `json:"id"`
}

// LocalTaskRenameTagResult reports the canonical tag and a source ID removed by a merge.
type LocalTaskRenameTagResult struct {
	Tag          localtask.Tag `json:"tag"`
	RemovedTagID *string       `json:"removedTagId,omitempty"`
}

// LocalTaskDeleteTagResult identifies the stable Local Task tag ID that was deleted.
type LocalTaskDeleteTagResult struct {
	DeletedTagID string `json:"deletedTagId"`
}

// LocalTaskUpdateParams contains mutable Local Task metadata.
type LocalTaskUpdateParams struct {
	ID          string              `json:"id"`
	Title       *string             `json:"title,omitempty"`
	Description *string             `json:"description,omitempty"`
	Status      *localtask.Status   `json:"status,omitempty"`
	Priority    *localtask.Priority `json:"priority,omitempty"`
	Tags        *[]string           `json:"tags,omitempty"`
	TagRefs     *[]localtask.TagRef `json:"tagRefs,omitempty"`
}

// LocalTaskSearchParams contains a metadata search and optional filters.
type LocalTaskSearchParams struct {
	Query string `json:"query"`
	LocalTaskListParams
}

// LocalTaskLinkWorkspaceParams creates a workspace link.
type LocalTaskLinkWorkspaceParams struct {
	TaskID      string `json:"taskId"`
	WorkspaceID string `json:"workspaceId"`
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

// LocalTaskWorkspaceIDParams identifies one local workspace.
type LocalTaskWorkspaceIDParams struct {
	WorkspaceID string `json:"workspaceId"`
}
