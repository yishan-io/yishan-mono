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

type CreateOrganizationResponse struct {
	Organization Organization `json:"organization"`
}

type AddOrganizationMemberResponse struct {
	Member OrganizationMember `json:"member"`
}

type CreateOrganizationInput struct {
	Name          string
	MemberUserIDs []string
}

func (c *Client) ListOrganizations() (ListOrganizationsResponse, error) {
	return c.ListOrganizationsContext(context.Background())
}

// ListOrganizationsContext lists organizations using the supplied request context.
func (c *Client) ListOrganizationsContext(ctx context.Context) (ListOrganizationsResponse, error) {
	var response ListOrganizationsResponse
	err := c.DoDecodeContext(ctx, "GET", "/orgs", nil, &response)
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
