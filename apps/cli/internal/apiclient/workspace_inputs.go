package apiclient

import (
	"yishan/apps/cli/internal/api"
	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/application"
)

// Request builders for the cloud workspace record operations. The daemon's
// records port implementation uses these so all API DTO construction lives in
// this adapter.

// CreateWorkspaceInput builds the provisioning-record request from a create
// registration.
func CreateWorkspaceInput(registration application.Registration, sourceNodeID string) api.CreateWorkspaceInput {
	return api.CreateWorkspaceInput{
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
func UpdateWorkspaceInput(registration application.Registration, localPath string, sourceNodeID string) api.UpdateWorkspaceInput {
	return api.UpdateWorkspaceInput{
		WorkspaceID:  registration.ID,
		LocalPath:    localPath,
		SourceNodeID: sourceNodeID,
	}
}

// CloseWorkspaceInput builds the close request for the remote record (closing
// before teardown, closed after).
func CloseWorkspaceInput(workspaceID string, sourceNodeID string, status workspace.Status) api.CloseWorkspaceInput {
	return api.CloseWorkspaceInput{
		WorkspaceID:  workspaceID,
		SourceNodeID: sourceNodeID,
		Status:       string(status),
	}
}
