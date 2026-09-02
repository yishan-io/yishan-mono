package rpc

import (
	"bytes"
	"encoding/json"
	"fmt"

	localtasktemplates "yishan/apps/cli/internal/localtask"
)

// LocalTaskTemplatesResult is the response payload for localTask.getTemplates.
type LocalTaskTemplatesResult struct {
	Templates      []localtasktemplates.Template `json:"templates"`
	AgentDefaultID string                        `json:"agentDefaultId"`
}

// LocalTaskSetTemplatesParams replaces the full custom template collection.
type LocalTaskSetTemplatesParams struct {
	Templates      []localtasktemplates.Template `json:"templates"`
	AgentDefaultID string                        `json:"agentDefaultId"`
}

// LocalTaskCreateParams contains Local Task creation metadata.
type LocalTaskCreateParams struct {
	// ID is a caller-generated idempotency key and the stable local task ID.
	ID             string                      `json:"id,omitempty"`
	ProjectID      *string                     `json:"projectId,omitempty"`
	OrganizationID *string                     `json:"organizationId,omitempty"`
	Title          string                      `json:"title"`
	Description    string                      `json:"description,omitempty"`
	Priority       localtasktemplates.Priority `json:"priority,omitempty"`
	Tags           []string                    `json:"tags,omitempty"`
	TagRefs        []localtasktemplates.TagRef `json:"tagRefs,omitempty"`
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
	ProjectID *string `json:"projectId,omitempty"`
	// Status preserves scalar status filters from existing daemon clients.
	Status *localtasktemplates.Status `json:"status,omitempty"`
	// Statuses contains the status array accepted from Pi task tools.
	Statuses    []localtasktemplates.Status  `json:"-"`
	Priority    *localtasktemplates.Priority `json:"priority,omitempty"`
	WorkspaceID *string                      `json:"workspaceId,omitempty"`
	Tags        []string                     `json:"tags,omitempty"`
	TagIDs      []string                     `json:"tagIds,omitempty"`
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
	Tag          localtasktemplates.Tag `json:"tag"`
	RemovedTagID *string                `json:"removedTagId,omitempty"`
}

// LocalTaskDeleteTagResult identifies the stable Local Task tag ID that was deleted.
type LocalTaskDeleteTagResult struct {
	DeletedTagID string `json:"deletedTagId"`
}

// LocalTaskUpdateParams contains mutable Local Task metadata.
type LocalTaskUpdateParams struct {
	ID          string                       `json:"id"`
	Title       *string                      `json:"title,omitempty"`
	Description *string                      `json:"description,omitempty"`
	Status      *localtasktemplates.Status   `json:"status,omitempty"`
	Priority    *localtasktemplates.Priority `json:"priority,omitempty"`
	Tags        *[]string                    `json:"tags,omitempty"`
	TagRefs     *[]localtasktemplates.TagRef `json:"tagRefs,omitempty"`
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
	LinkID string                    `json:"linkId"`
	Status localtasktemplates.Status `json:"status"`
}

// LocalTaskWorkspaceIDParams identifies one local workspace.
type LocalTaskWorkspaceIDParams struct {
	WorkspaceID string `json:"workspaceId"`
}

// UnmarshalJSON accepts the current status array and the legacy scalar status filter.
func (params *LocalTaskListParams) UnmarshalJSON(payload []byte) error {
	var wire struct {
		ProjectID   *string                      `json:"projectId"`
		Status      json.RawMessage              `json:"status"`
		Priority    *localtasktemplates.Priority `json:"priority"`
		WorkspaceID *string                      `json:"workspaceId"`
		Tags        []string                     `json:"tags"`
		TagIDs      []string                     `json:"tagIds"`
	}
	if err := json.Unmarshal(payload, &wire); err != nil {
		return err
	}
	params.ProjectID, params.Priority, params.WorkspaceID = wire.ProjectID, wire.Priority, wire.WorkspaceID
	params.Tags, params.TagIDs, params.Status, params.Statuses = wire.Tags, wire.TagIDs, nil, nil
	if len(wire.Status) == 0 || bytes.Equal(wire.Status, []byte("null")) {
		return nil
	}
	if wire.Status[0] == '[' {
		statuses, err := decodeLocalTaskStatuses(wire.Status)
		if err != nil {
			return err
		}
		params.Statuses = statuses
		return nil
	}
	return json.Unmarshal(wire.Status, &params.Status)
}

const maxLocalTaskStatusFilters = 4

func decodeLocalTaskStatuses(payload json.RawMessage) ([]localtasktemplates.Status, error) {
	var statuses []localtasktemplates.Status
	if err := json.Unmarshal(payload, &statuses); err != nil {
		return nil, err
	}
	if len(statuses) == 0 {
		return nil, fmt.Errorf("status array must not be empty")
	}
	if len(statuses) > maxLocalTaskStatusFilters {
		return nil, fmt.Errorf("status array must contain at most %d entries", maxLocalTaskStatusFilters)
	}
	uniqueStatuses := make([]localtasktemplates.Status, 0, len(statuses))
	seenStatuses := make(map[localtasktemplates.Status]struct{}, len(statuses))
	for _, status := range statuses {
		if _, exists := seenStatuses[status]; exists {
			continue
		}
		seenStatuses[status] = struct{}{}
		uniqueStatuses = append(uniqueStatuses, status)
	}
	return uniqueStatuses, nil
}

// UnmarshalJSON preserves projection fields while accepting either status filter form.
func (params *LocalTaskListProjectionParams) UnmarshalJSON(payload []byte) error {
	var wire struct {
		Query  string `json:"query"`
		Offset int    `json:"offset"`
		Limit  int    `json:"limit"`
	}
	if err := json.Unmarshal(payload, &wire); err != nil {
		return err
	}
	if err := json.Unmarshal(payload, &params.LocalTaskListParams); err != nil {
		return err
	}
	params.Query, params.Offset, params.Limit = wire.Query, wire.Offset, wire.Limit
	return nil
}

// UnmarshalJSON preserves the search query while accepting either status filter form.
func (params *LocalTaskSearchParams) UnmarshalJSON(payload []byte) error {
	var wire struct {
		Query string `json:"query"`
	}
	if err := json.Unmarshal(payload, &wire); err != nil {
		return err
	}
	if err := json.Unmarshal(payload, &params.LocalTaskListParams); err != nil {
		return err
	}
	params.Query = wire.Query
	return nil
}
