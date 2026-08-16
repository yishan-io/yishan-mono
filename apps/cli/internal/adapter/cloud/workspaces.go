package cloud

import (
	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/application"
)

// Workspace endpoints, their DTOs, and the request builders the daemon's
// records port uses.

type Workspace struct {
	ID             string `json:"id"`
	OrganizationID string `json:"organizationId"`
	ProjectID      string `json:"projectId"`
	UserID         string `json:"userId"`
	NodeID         string `json:"nodeId"`
	Kind           string `json:"kind"`
	Status         string `json:"status"`
	Branch         string `json:"branch"`
	SourceBranch   string `json:"sourceBranch"`
	LocalPath      string `json:"localPath"`
	CreatedAt      string `json:"createdAt"`
	UpdatedAt      string `json:"updatedAt"`
}

type ListWorkspacesResponse struct {
	Workspaces []Workspace `json:"workspaces"`
}

type CreateWorkspaceResponse struct {
	Workspace Workspace `json:"workspace"`
}

type CreateWorkspaceInput struct {
	ID           string
	NodeID       string
	LocalPath    string
	Kind         string
	Branch       string
	SourceBranch string
	SourceNodeID string
}

type UpdateWorkspaceInput struct {
	WorkspaceID  string
	LocalPath    string
	SourceNodeID string
}

type CloseWorkspaceInput struct {
	WorkspaceID  string
	SourceNodeID string
	// Status marks the remote record: "closing" (before local teardown) or
	// "closed" (terminal, after cleanup). Empty defaults to "closed" server-side.
	Status string
}

// BuildCreateWorkspaceInput builds the provisioning-record request from a
// create registration.
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

// BuildUpdateWorkspaceInput builds the provisioning→active update request
// (records the final worktree path).
func BuildUpdateWorkspaceInput(registration application.Registration, localPath string, sourceNodeID string) UpdateWorkspaceInput {
	return UpdateWorkspaceInput{
		WorkspaceID:  registration.ID,
		LocalPath:    localPath,
		SourceNodeID: sourceNodeID,
	}
}

// BuildCloseWorkspaceInput builds the close request for the remote record
// (closing before teardown, closed after).
func BuildCloseWorkspaceInput(workspaceID string, sourceNodeID string, status workspace.Status) CloseWorkspaceInput {
	return CloseWorkspaceInput{
		WorkspaceID:  workspaceID,
		SourceNodeID: sourceNodeID,
		Status:       string(status),
	}
}

func (c *Client) ListWorkspaces(orgID string, projectID string) (ListWorkspacesResponse, error) {
	var response ListWorkspacesResponse
	err := c.DoDecode("GET", "/orgs/"+orgID+"/projects/"+projectID+"/workspaces", nil, &response)
	return response, err
}

func (c *Client) CreateWorkspace(orgID string, projectID string, input CreateWorkspaceInput) (CreateWorkspaceResponse, error) {
	payload := map[string]string{
		"kind": input.Kind,
	}
	if input.NodeID != "" {
		payload["nodeId"] = input.NodeID
	}
	if input.LocalPath != "" {
		payload["localPath"] = input.LocalPath
	}
	if input.ID != "" {
		payload["id"] = input.ID
	}
	if input.Branch != "" {
		payload["branch"] = input.Branch
	}
	if input.SourceBranch != "" {
		payload["sourceBranch"] = input.SourceBranch
	}
	if input.SourceNodeID != "" {
		payload["sourceNodeId"] = input.SourceNodeID
	}

	var response CreateWorkspaceResponse
	err := c.DoDecode("POST", "/orgs/"+orgID+"/projects/"+projectID+"/workspaces", payload, &response)
	return response, err
}

func (c *Client) CloseWorkspace(orgID string, projectID string, input CloseWorkspaceInput) (CreateWorkspaceResponse, error) {
	payload := map[string]string{
		"workspaceId": input.WorkspaceID,
	}
	if input.SourceNodeID != "" {
		payload["sourceNodeId"] = input.SourceNodeID
	}
	if input.Status != "" {
		payload["status"] = input.Status
	}

	var response CreateWorkspaceResponse
	err := c.DoDecode("PATCH", "/orgs/"+orgID+"/projects/"+projectID+"/workspaces/close", payload, &response)
	return response, err
}

func (c *Client) UpdateWorkspace(orgID string, projectID string, input UpdateWorkspaceInput) (CreateWorkspaceResponse, error) {
	payload := map[string]string{
		"localPath": input.LocalPath,
	}
	if input.SourceNodeID != "" {
		payload["sourceNodeId"] = input.SourceNodeID
	}

	var response CreateWorkspaceResponse
	err := c.DoDecode("PATCH", "/orgs/"+orgID+"/projects/"+projectID+"/workspaces/"+input.WorkspaceID, payload, &response)
	return response, err
}
