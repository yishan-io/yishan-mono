package cloud

import "context"

// Organization endpoints and their DTOs.

type OrganizationMember struct {
	UserID    string `json:"userId"`
	Role      string `json:"role"`
	Email     string `json:"email"`
	Name      string `json:"name"`
	AvatarURL string `json:"avatarUrl"`
}

type Organization struct {
	ID        string               `json:"id"`
	Name      string               `json:"name"`
	CreatedAt string               `json:"createdAt"`
	UpdatedAt string               `json:"updatedAt"`
	Members   []OrganizationMember `json:"members"`
}

type ListOrganizationsResponse struct {
	Organizations []Organization `json:"organizations"`
}

// ListOrganizationsContext lists organizations using the supplied request context.
func (c *Client) ListOrganizationsContext(ctx context.Context) (ListOrganizationsResponse, error) {
	var response ListOrganizationsResponse
	err := c.DoDecodeContext(ctx, "GET", "/orgs", nil, &response)
	return response, err
}
