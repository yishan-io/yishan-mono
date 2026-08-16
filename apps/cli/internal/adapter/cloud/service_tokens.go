package cloud

// Service-token endpoints and their DTOs.

type ServiceToken struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	TokenPrefix string  `json:"tokenPrefix"`
	Scopes      string  `json:"scopes,omitempty"`
	Token       string  `json:"token,omitempty"`
	LastUsedAt  *string `json:"lastUsedAt"`
	ExpiresAt   *string `json:"expiresAt"`
	RevokedAt   *string `json:"revokedAt"`
	CreatedAt   string  `json:"createdAt"`
}

type CreateServiceTokenResponse struct {
	ServiceToken ServiceToken `json:"serviceToken"`
}

type ListServiceTokensResponse struct {
	ServiceTokens []ServiceToken `json:"serviceTokens"`
}

type CreateServiceTokenInput struct {
	Name          string
	ExpiresInDays *int
}

func (c *Client) CreateServiceToken(input CreateServiceTokenInput) (CreateServiceTokenResponse, error) {
	payload := map[string]any{
		"name": input.Name,
	}
	if input.ExpiresInDays != nil {
		payload["expiresInDays"] = *input.ExpiresInDays
	}

	var response CreateServiceTokenResponse
	err := c.DoDecode("POST", "/service-tokens", payload, &response)
	return response, err
}

func (c *Client) ListServiceTokens() (ListServiceTokensResponse, error) {
	var response ListServiceTokensResponse
	err := c.DoDecode("GET", "/service-tokens", nil, &response)
	return response, err
}

func (c *Client) RevokeServiceToken(tokenID string) (OKResponse, error) {
	var response OKResponse
	err := c.DoDecode("DELETE", "/service-tokens/"+tokenID, nil, &response)
	return response, err
}
