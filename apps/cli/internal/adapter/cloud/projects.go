package cloud

import "context"

// Project endpoints and their DTOs.

// ProjectCommand is a named shell command configured for a project.
type ProjectCommand struct {
	Name    string `json:"name"`
	Command string `json:"command"`
}

type Project struct {
	ID              string           `json:"id"`
	OrganizationID  string           `json:"organizationId"`
	NodeID          string           `json:"nodeId"`
	Name            string           `json:"name"`
	TaskPrefix      *string          `json:"taskPrefix"`
	SourceType      string           `json:"sourceType"`
	RepoProvider    string           `json:"repoProvider"`
	RepoURL         string           `json:"repoUrl"`
	RepoKey         string           `json:"repoKey"`
	Icon            string           `json:"icon"`
	Color           string           `json:"color"`
	Commands        []ProjectCommand `json:"commands"`
	ContextEnabled  bool             `json:"contextEnabled"`
	SetupScript     string           `json:"setupScript"`
	PostScript      string           `json:"postScript"`
	CreatedByUserID string           `json:"createdByUserId"`
	CreatedAt       string           `json:"createdAt"`
	UpdatedAt       string           `json:"updatedAt"`
}

type ListProjectsResponse struct {
	Projects []Project `json:"projects"`
}

type ProjectWithWorkspaces struct {
	Project
	Workspaces []Workspace `json:"workspaces"`
}

type ListProjectsWithWorkspacesResponse struct {
	Projects []ProjectWithWorkspaces `json:"projects"`
}

// ListProjectsWithWorkspacesContext lists an org's projects with the actor's
// live workspaces using the supplied request context.
func (c *Client) ListProjectsWithWorkspacesContext(ctx context.Context, orgID string) (ListProjectsWithWorkspacesResponse, error) {
	var response ListProjectsWithWorkspacesResponse
	err := c.DoDecodeContext(ctx, "GET", "/orgs/"+orgID+"/projects?withWorkspaces=true", nil, &response)
	return response, err
}

func (c *Client) ListProjects(orgID string) (ListProjectsResponse, error) {
	return c.ListProjectsContext(context.Background(), orgID)
}

// ListProjectsContext lists an organization's projects using the supplied request context.
func (c *Client) ListProjectsContext(ctx context.Context, orgID string) (ListProjectsResponse, error) {
	var response ListProjectsResponse
	err := c.DoDecodeContext(ctx, "GET", "/orgs/"+orgID+"/projects", nil, &response)
	return response, err
}
