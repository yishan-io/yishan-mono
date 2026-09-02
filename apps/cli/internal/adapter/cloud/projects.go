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

type CreateProjectResponse struct {
	Project Project `json:"project"`
}

type CreateProjectInput struct {
	Name           string
	TaskPrefix     string
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
	return c.ListProjectsContext(context.Background(), orgID)
}

// ListProjectsContext lists an organization's projects using the supplied request context.
func (c *Client) ListProjectsContext(ctx context.Context, orgID string) (ListProjectsResponse, error) {
	var response ListProjectsResponse
	err := c.DoDecodeContext(ctx, "GET", "/orgs/"+orgID+"/projects", nil, &response)
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
		"name":       input.Name,
		"taskPrefix": input.TaskPrefix,
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

// AllocateLocalTaskKeyResponse contains an idempotently reserved task key.
type AllocateLocalTaskKeyResponse struct {
	Key string `json:"key"`
}

// AllocateProjectLocalTaskKey reserves a project-scoped key for one local task ID.
func (c *Client) AllocateProjectLocalTaskKey(orgID string, projectID string, localTaskID string) (AllocateLocalTaskKeyResponse, error) {
	return c.AllocateProjectLocalTaskKeyContext(context.Background(), orgID, projectID, localTaskID)
}

// AllocateProjectLocalTaskKeyContext reserves a project-scoped key bound to ctx.
func (c *Client) AllocateProjectLocalTaskKeyContext(ctx context.Context, orgID string, projectID string, localTaskID string) (AllocateLocalTaskKeyResponse, error) {
	var response AllocateLocalTaskKeyResponse
	err := c.DoDecodeContext(ctx, "POST", "/orgs/"+orgID+"/projects/"+projectID+"/local-tasks/key", map[string]string{"localTaskId": localTaskID}, &response)
	return response, err
}

// AllocatePersonalLocalTaskKey reserves a personal key for one local task ID.
func (c *Client) AllocatePersonalLocalTaskKey(localTaskID string) (AllocateLocalTaskKeyResponse, error) {
	return c.AllocatePersonalLocalTaskKeyContext(context.Background(), localTaskID)
}

// AllocatePersonalLocalTaskKeyContext reserves a personal key bound to ctx.
func (c *Client) AllocatePersonalLocalTaskKeyContext(ctx context.Context, localTaskID string) (AllocateLocalTaskKeyResponse, error) {
	var response AllocateLocalTaskKeyResponse
	err := c.DoDecodeContext(ctx, "POST", "/me/local-tasks/key", map[string]string{"localTaskId": localTaskID}, &response)
	return response, err
}
