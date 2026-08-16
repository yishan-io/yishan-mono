package cloud

// Node endpoints and their DTOs.

type Node struct {
	ID             string         `json:"id"`
	OrganizationID string         `json:"organizationId"`
	Name           string         `json:"name"`
	Kind           string         `json:"kind"`
	Scope          string         `json:"scope"`
	Endpoint       string         `json:"endpoint"`
	Metadata       map[string]any `json:"metadata"`
	CreatedAt      string         `json:"createdAt"`
	UpdatedAt      string         `json:"updatedAt"`
}

type ListNodesResponse struct {
	Nodes []Node `json:"nodes"`
}

type CreateNodeResponse struct {
	Node Node `json:"node"`
}

type RegisterNodeResponse struct {
	Node Node `json:"node"`
}

type UpdateNodeScopeResponse struct {
	Node Node `json:"node"`
}

type RelayTokenResponse struct {
	Token     string `json:"token"`
	ExpiresAt string `json:"expiresAt"`
}

type RegisterNodeInput struct {
	NodeID         string
	Name           string
	Kind           string
	Endpoint       string
	Metadata       map[string]any
	Scope          string
	UpdateIfExists *bool
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

func (c *Client) UpdateNodeScope(orgID string, nodeID string, scope string) (UpdateNodeScopeResponse, error) {
	var response UpdateNodeScopeResponse
	err := c.DoDecode("PATCH", "/orgs/"+orgID+"/nodes/"+nodeID+"/scope", map[string]string{
		"scope": scope,
	}, &response)
	return response, err
}

func (c *Client) RegisterNode(input RegisterNodeInput) (RegisterNodeResponse, error) {
	payload := map[string]any{
		"nodeId": input.NodeID,
		"name":   input.Name,
		"scope":  input.Scope,
	}
	if input.Kind != "" {
		payload["kind"] = input.Kind
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

func (c *Client) RelayToken(nodeID string) (RelayTokenResponse, error) {
	var response RelayTokenResponse
	err := c.DoDecode("POST", "/nodes/"+nodeID+"/relay-token", nil, &response)
	return response, err
}
