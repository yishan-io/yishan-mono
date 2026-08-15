// Package apiclient owns conversion between the cloud API workspace DTO and
// the workspace domain record. Created in Phase 1 of the CLI/daemon refactor
// as the named mapper boundary; Phase 5 moves all remaining API DTO
// conversion (request building, cache sync) into this adapter.
package apiclient

import (
	"yishan/apps/cli/internal/api"
	"yishan/apps/cli/internal/workspace"
)

// WorkspaceToDomain converts a cloud API workspace DTO to the domain record.
// The domain record carries lifecycle fields only; fields with no domain
// counterpart (UserID, LocalPath, timestamps) are dropped. Runtime state and
// health are not part of the record — they live in instance.Runtime.
func WorkspaceToDomain(record api.Workspace) workspace.Record {
	return workspace.Record{
		ID:        workspace.ID(record.ID),
		ProjectID: record.ProjectID,
		NodeID:    record.NodeID,
		Kind:      workspace.Kind(record.Kind),
		Status:    workspace.Status(record.Status),
		Branch:    record.Branch,
	}
}
