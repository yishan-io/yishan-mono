package cloud

import (
	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/application"
)

// Request builders for the cloud workspace record operations. The daemon's
// records port implementation uses these so all API DTO construction lives in
// this adapter.

// CreateWorkspaceInput builds the provisioning-record request from a create
// registration.
func BuildCreateWorkspaceInput(registration application.Registration, sourceNodeID string) CreateWorkspaceInput {
	return CreateWorkspaceInput{
		ID:           registration.ID,
		NodeID:       registration.NodeID,
		Kind:         string(registration.Kind),
		Branch:       registration.Branch,
		SourceBranch: registration.SourceBranch,
		SourceNodeID: sourceNodeID,
	}
}

// UpdateWorkspaceInput builds the provisioning→active update request (records
// the final worktree path).
func BuildUpdateWorkspaceInput(registration application.Registration, localPath string, sourceNodeID string) UpdateWorkspaceInput {
	return UpdateWorkspaceInput{
		WorkspaceID:  registration.ID,
		LocalPath:    localPath,
		SourceNodeID: sourceNodeID,
	}
}

// CloseWorkspaceInput builds the close request for the remote record (closing
// before teardown, closed after).
func BuildCloseWorkspaceInput(workspaceID string, sourceNodeID string, status workspace.Status) CloseWorkspaceInput {
	return CloseWorkspaceInput{
		WorkspaceID:  workspaceID,
		SourceNodeID: sourceNodeID,
		Status:       string(status),
	}
}
