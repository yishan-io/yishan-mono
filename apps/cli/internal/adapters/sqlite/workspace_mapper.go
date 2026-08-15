// Package sqlite owns conversion between the local SQLite workspace row and
// the workspace domain record. Created in Phase 1 of the CLI/daemon refactor
// as the named mapper boundary; Phase 5 moves all remaining SQLite row
// conversion (state/health updates, folder rows) into this adapter.
package sqlite

import (
	localdb "yishan/apps/cli/internal/db"
	"yishan/apps/cli/internal/workspace"
)

// WorkspaceToDomain converts a local SQLite row to the domain record. The
// domain record carries lifecycle fields only: state, health, name, and
// timestamps are dropped (state/health live in instance.Runtime).
func WorkspaceToDomain(row localdb.Workspace) workspace.Record {
	return workspace.Record{
		ID:        workspace.ID(row.ID),
		ProjectID: row.ProjectID,
		NodeID:    row.NodeID,
		Kind:      workspace.Kind(row.Kind),
		Status:    workspace.Status(row.Status),
		Branch:    optionalStringValue(row.Branch),
	}
}

// WorkspaceFromDomain converts a domain record to a local SQLite row. Only the
// lifecycle fields are set; mutable runtime fields (state, health) and
// timestamps are left for the caller / store defaults.
func WorkspaceFromDomain(record workspace.Record) localdb.Workspace {
	return localdb.Workspace{
		ID:        string(record.ID),
		ProjectID: record.ProjectID,
		NodeID:    record.NodeID,
		Kind:      string(record.Kind),
		Status:    string(record.Status),
		Branch:    optionalString(record.Branch),
	}
}

func optionalString(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

func optionalStringValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
