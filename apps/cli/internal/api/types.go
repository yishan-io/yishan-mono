package api

type OKResponse struct {
	OK bool `json:"ok"`
}

type HealthResponse struct {
	OK bool `json:"ok"`
}

type MeResponse struct {
	User User `json:"user"`
}

type User struct {
	ID        string `json:"id"`
	Email     string `json:"email"`
	Name      string `json:"name"`
	AvatarURL string `json:"avatarUrl"`
}

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

type Node struct {
	ID             string         `json:"id"`
	OrganizationID string         `json:"organizationId"`
	Name           string         `json:"name"`
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

type Project struct {
	ID             string `json:"id"`
	OrganizationID string `json:"organizationId"`
	NodeID         string `json:"nodeId"`
	Name           string `json:"name"`
	SourceType     string `json:"sourceType"`
	RepoProvider   string `json:"repoProvider"`
	RepoURL        string `json:"repoUrl"`
	RepoKey        string `json:"repoKey"`
	LocalPath      string `json:"localPath"`
	ContextEnabled bool   `json:"contextEnabled"`
	CreatedAt      string `json:"createdAt"`
	UpdatedAt      string `json:"updatedAt"`
}

type ListProjectsResponse struct {
	Projects []Project `json:"projects"`
}

type CreateProjectResponse struct {
	Project Project `json:"project"`
}

type Workspace struct {
	ID             string `json:"id"`
	OrganizationID string `json:"organizationId"`
	ProjectID      string `json:"projectId"`
	NodeID         string `json:"nodeId"`
	Kind           string `json:"kind"`
	Branch         string `json:"branch"`
	LocalPath      string `json:"localPath"`
	CreatedAt      string `json:"createdAt"`
	UpdatedAt      string `json:"updatedAt"`
}

type ListWorkspacesResponse struct {
	Workspaces []Workspace `json:"workspaces"`
}

type CreateWorkspaceResponse struct {
	Workspace Workspace `json:"workspace"`
}

type RefreshTokenResponse struct {
	TokenType             string `json:"tokenType"`
	AccessToken           string `json:"accessToken"`
	RefreshToken          string `json:"refreshToken"`
	AccessTokenExpiresAt  string `json:"accessTokenExpiresAt"`
	RefreshTokenExpiresAt string `json:"refreshTokenExpiresAt"`
}
