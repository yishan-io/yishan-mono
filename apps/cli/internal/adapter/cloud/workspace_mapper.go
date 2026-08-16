// Package cloud owns access to the Yishan cloud HTTP API: the Client handles
// transport, token refresh, and response decoding, resource files hold the
// endpoint methods, and mapper files convert between cloud DTOs and domain
// records. Domain policy stays outside this package.
package cloud

import (
	"yishan/apps/cli/internal/workspace"
)

// WorkspaceToDomain converts a cloud API workspace DTO to the domain record.
// The domain record carries lifecycle fields only; fields with no domain
// counterpart (UserID, timestamps) are dropped. Runtime state and health are
// not part of the record — they live in instance.Runtime.
func WorkspaceToDomain(record Workspace) workspace.Record {
	return workspace.Record{
		ID:        workspace.ID(record.ID),
		ProjectID: record.ProjectID,
		NodeID:    record.NodeID,
		Kind:      workspace.Kind(record.Kind),
		Status:    workspace.Status(record.Status),
		Branch:    record.Branch,
		LocalPath: record.LocalPath,
	}
}
