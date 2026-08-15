package dbconv

import (
	localdb "yishan/apps/cli/internal/db"
	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/application"
)

// Row builders for the workspace record operations. The daemon's records port
// implementation uses these so all SQLite row conversion lives in this
// adapter.

// ProvisioningRow builds the local row written before a local create starts
// (status provisioning, empty path, active runtime state).
func ProvisioningRow(registration application.Registration) localdb.Workspace {
	return localdb.Workspace{
		ID:             registration.ID,
		OrganizationID: registration.OrganizationID,
		ProjectID:      registration.ProjectID,
		NodeID:         registration.NodeID,
		Kind:           string(registration.Kind),
		Status:         string(workspace.StatusProvisioning),
		Branch:         optionalWorkspaceString(registration.Branch),
		SourceBranch:   optionalWorkspaceString(registration.SourceBranch),
		LocalPath:      "",
		State:          string(workspace.StateActive),
	}
}

// ActiveUpdate builds the row update that finalizes a create (status active,
// runtime state, worktree path).
func ActiveUpdate(created workspace.Workspace) localdb.WorkspaceUpdate {
	status := string(workspace.StatusActive)
	state := string(created.State)
	return localdb.WorkspaceUpdate{
		Status:    &status,
		State:     &state,
		LocalPath: &created.Path,
	}
}

// StatusUpdate builds a row update that only flips the lifecycle status.
func StatusUpdate(status string) localdb.WorkspaceUpdate {
	return localdb.WorkspaceUpdate{Status: &status}
}

// StateUpdate builds a row update that persists runtime state and health.
func StateUpdate(state string, health string) localdb.WorkspaceUpdate {
	return localdb.WorkspaceUpdate{State: &state, Health: &health}
}

func optionalWorkspaceString(value string) *string {
	trimmedValue := value
	if trimmedValue == "" {
		return nil
	}
	return &trimmedValue
}
