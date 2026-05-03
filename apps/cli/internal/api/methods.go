package api

type CreateOrganizationInput struct {
	Name          string
	MemberUserIDs []string
}

type CreateNodeInput struct {
	Name     string
	Scope    string
	Endpoint string
	Metadata map[string]any
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

func (c *Client) CreateNode(orgID string, input CreateNodeInput) (CreateNodeResponse, error) {
	payload := map[string]any{
		"name":  input.Name,
		"scope": input.Scope,
	}
	if input.Endpoint != "" {
		payload["endpoint"] = input.Endpoint
	}
	if len(input.Metadata) > 0 {
		payload["metadata"] = input.Metadata
	}

	var response CreateNodeResponse
	err := c.DoDecode("POST", "/orgs/"+orgID+"/nodes", payload, &response)
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
