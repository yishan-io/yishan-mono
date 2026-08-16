package cloud

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

type CreateProjectResponse struct {
	Project Project `json:"project"`
}

type CreateProjectInput struct {
	Name           string
	SourceTypeHint string
	RepoURL        string
	NodeID         string
	LocalPath      string
}

func (c *Client) DeleteProject(orgID string, projectID string) (OKResponse, error) {
	var response OKResponse
	err := c.DoDecode("DELETE", "/orgs/"+orgID+"/projects/"+projectID, nil, &response)
	return response, err
}

func (c *Client) ListProjects(orgID string) (ListProjectsResponse, error) {
	var response ListProjectsResponse
	err := c.DoDecode("GET", "/orgs/"+orgID+"/projects", nil, &response)
	return response, err
}

// ListProjectsWithWorkspaces lists an org's projects together with the actor's
// live (non-closed) workspaces, in one backend call.
func (c *Client) ListProjectsWithWorkspaces(orgID string) (ListProjectsWithWorkspacesResponse, error) {
	var response ListProjectsWithWorkspacesResponse
	err := c.DoDecode("GET", "/orgs/"+orgID+"/projects?withWorkspaces=true", nil, &response)
	return response, err
}

func (c *Client) CreateProject(orgID string, input CreateProjectInput) (CreateProjectResponse, error) {
	payload := map[string]string{
		"name": input.Name,
	}
	if input.SourceTypeHint != "" {
		payload["sourceTypeHint"] = input.SourceTypeHint
	}
	if input.RepoURL != "" {
		payload["repoUrl"] = input.RepoURL
	}
	if input.NodeID != "" {
		payload["nodeId"] = input.NodeID
	}
	if input.LocalPath != "" {
		payload["localPath"] = input.LocalPath
	}

	var response CreateProjectResponse
	err := c.DoDecode("POST", "/orgs/"+orgID+"/projects", payload, &response)
	return response, err
}
