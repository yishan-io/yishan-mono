package api

type CreateOrganizationInput struct {
	Name          string
	MemberUserIDs []string
}

type CreateProjectInput struct {
	Name           string
	SourceTypeHint string
	RepoURL        string
	NodeID         string
	LocalPath      string
}

type RegisterNodeInput struct {
	NodeID         string
	Name           string
	Endpoint       string
	Metadata       map[string]any
	Scope          string
	UpdateIfExists *bool
}

type CreateWorkspaceInput struct {
	ID           string
	NodeID       string
	LocalPath    string
	Kind         string
	Branch       string
	SourceBranch string
}

type CloseWorkspaceInput struct {
	NodeID    string
	LocalPath string
	Kind      string
	Branch    string
}

func (c *Client) Health() (HealthResponse, error) {
	var response HealthResponse
	err := c.DoDecode("GET", "/health", nil, &response)
	return response, err
}

func (c *Client) WhoAmI() (MeResponse, error) {
	var response MeResponse
	err := c.DoDecode("GET", "/me", nil, &response)
	return response, err
}

func (c *Client) ListOrganizations() (ListOrganizationsResponse, error) {
	var response ListOrganizationsResponse
	err := c.DoDecode("GET", "/orgs", nil, &response)
	return response, err
}

func (c *Client) CreateOrganization(input CreateOrganizationInput) (CreateOrganizationResponse, error) {
	var response CreateOrganizationResponse
	err := c.DoDecode("POST", "/orgs", map[string]any{
		"name":          input.Name,
		"memberUserIds": input.MemberUserIDs,
	}, &response)
	return response, err
}

func (c *Client) DeleteOrganization(orgID string) (OKResponse, error) {
	var response OKResponse
	err := c.DoDecode("DELETE", "/orgs/"+orgID, nil, &response)
	return response, err
}

func (c *Client) AddOrganizationMember(orgID string, userID string, role string) (AddOrganizationMemberResponse, error) {
	var response AddOrganizationMemberResponse
	err := c.DoDecode("POST", "/orgs/"+orgID+"/members", map[string]string{
		"userId": userID,
		"role":   role,
	}, &response)
	return response, err
}

func (c *Client) RemoveOrganizationMember(orgID string, userID string) (OKResponse, error) {
	var response OKResponse
	err := c.DoDecode("DELETE", "/orgs/"+orgID+"/members/"+userID, nil, &response)
	return response, err
}

func (c *Client) ListNodes(orgID string) (ListNodesResponse, error) {
	var response ListNodesResponse
	err := c.DoDecode("GET", "/orgs/"+orgID+"/nodes", nil, &response)
	return response, err
}

func (c *Client) DeleteNode(orgID string, nodeID string) (OKResponse, error) {
	var response OKResponse
	err := c.DoDecode("DELETE", "/orgs/"+orgID+"/nodes/"+nodeID, nil, &response)
	return response, err
}

func (c *Client) RegisterNode(input RegisterNodeInput) (RegisterNodeResponse, error) {
	payload := map[string]any{
		"nodeId": input.NodeID,
		"name":   input.Name,
		"scope":  input.Scope,
	}
	if input.Endpoint != "" {
		payload["endpoint"] = input.Endpoint
	}
	if len(input.Metadata) > 0 {
		payload["metadata"] = input.Metadata
	}
	if input.UpdateIfExists != nil {
		payload["updateIfExists"] = *input.UpdateIfExists
	}

	var response RegisterNodeResponse
	err := c.DoDecode("POST", "/nodes/register", payload, &response)
	return response, err
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

func (c *Client) ListWorkspaces(orgID string, projectID string) (ListWorkspacesResponse, error) {
	var response ListWorkspacesResponse
	err := c.DoDecode("GET", "/orgs/"+orgID+"/projects/"+projectID+"/workspaces", nil, &response)
	return response, err
}

func (c *Client) CreateWorkspace(orgID string, projectID string, input CreateWorkspaceInput) (CreateWorkspaceResponse, error) {
	payload := map[string]string{
		"nodeId":    input.NodeID,
		"localPath": input.LocalPath,
		"kind":      input.Kind,
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

	var response CreateWorkspaceResponse
	err := c.DoDecode("POST", "/orgs/"+orgID+"/projects/"+projectID+"/workspaces", payload, &response)
	return response, err
}

type UpsertWorkspacePullRequestInput struct {
	PrID        string         `json:"prId"`
	Title       string         `json:"title,omitempty"`
	URL         string         `json:"url,omitempty"`
	Branch      string         `json:"branch,omitempty"`
	BaseBranch  string         `json:"baseBranch,omitempty"`
	State       string         `json:"state"`
	Metadata    map[string]any `json:"metadata,omitempty"`
	DetectedAt  string         `json:"detectedAt"`
	ResolvedAt  string         `json:"resolvedAt,omitempty"`
}

func (c *Client) UpsertWorkspacePullRequest(orgID string, projectID string, workspaceID string, input UpsertWorkspacePullRequestInput) (OKResponse, error) {
	var response OKResponse
	err := c.DoDecode("PUT", "/orgs/"+orgID+"/projects/"+projectID+"/workspaces/"+workspaceID+"/pull-requests", input, &response)
	return response, err
}

func (c *Client) CloseWorkspace(orgID string, projectID string, input CloseWorkspaceInput) (CreateWorkspaceResponse, error) {
	payload := map[string]string{
		"nodeId":    input.NodeID,
		"localPath": input.LocalPath,
		"kind":      input.Kind,
	}
	if input.Branch != "" {
		payload["branch"] = input.Branch
	}

	var response CreateWorkspaceResponse
	err := c.DoDecode("PATCH", "/orgs/"+orgID+"/projects/"+projectID+"/workspaces/close", payload, &response)
	return response, err
}

func (c *Client) RelayToken(nodeID string) (RelayTokenResponse, error) {
	var response RelayTokenResponse
	err := c.DoDecode("POST", "/nodes/"+nodeID+"/relay-token", nil, &response)
	return response, err
}

func (c *Client) RefreshToken(refreshToken string) (RefreshTokenResponse, error) {
	var response RefreshTokenResponse
	err := c.DoDecode("POST", "/auth/refresh", map[string]string{
		"refreshToken": refreshToken,
	}, &response)
	return response, err
}

func (c *Client) RevokeToken(refreshToken string) (OKResponse, error) {
	var response OKResponse
	err := c.DoDecode("POST", "/auth/revoke", map[string]string{
		"refreshToken": refreshToken,
	}, &response)
	return response, err
}

type StartScheduledJobRunInput struct {
	RunID     string
	StartedAt string
}

type CompleteScheduledJobRunInput struct {
	RunID        string
	FinishedAt   string
	Status       string
	ResponseBody string
	ErrorCode    string
	ErrorMessage string
	ErrorDetails map[string]any
}

func (c *Client) StartScheduledJobRun(nodeID string, input StartScheduledJobRunInput) (OKResponse, error) {
	payload := map[string]any{
		"runId": input.RunID,
	}
	if input.StartedAt != "" {
		payload["startedAt"] = input.StartedAt
	}

	var response OKResponse
	err := c.DoDecode("PUT", "/nodes/"+nodeID+"/scheduled-jobs/runs/start", payload, &response)
	return response, err
}

func (c *Client) CompleteScheduledJobRun(nodeID string, input CompleteScheduledJobRunInput) (OKResponse, error) {
	payload := map[string]any{
		"runId":  input.RunID,
		"status": input.Status,
	}
	if input.FinishedAt != "" {
		payload["finishedAt"] = input.FinishedAt
	}
	if input.ResponseBody != "" {
		payload["responseBody"] = input.ResponseBody
	}
	if input.ErrorCode != "" {
		payload["errorCode"] = input.ErrorCode
	}
	if input.ErrorMessage != "" {
		payload["errorMessage"] = input.ErrorMessage
	}
	if len(input.ErrorDetails) > 0 {
		payload["errorDetails"] = input.ErrorDetails
	}

	var response OKResponse
	err := c.DoDecode("PUT", "/nodes/"+nodeID+"/scheduled-jobs/runs/complete", payload, &response)
	return response, err
}
