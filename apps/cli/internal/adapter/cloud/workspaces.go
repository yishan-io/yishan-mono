package cloud

// Workspace is api-service's workspace DTO. Workspace records live in the
// daemon now; the type remains for the one-time project import (the
// withWorkspaces project list) and for CLI list rendering.
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

// ListWorkspacesResponse is a list of workspaces.
type ListWorkspacesResponse struct {
	Workspaces []Workspace `json:"workspaces"`
}
