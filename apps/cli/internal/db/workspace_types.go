package db

// Workspace is the daemon-owned local workspace record.
type Workspace struct {
	ID             string  `json:"id"`
	OrganizationID string  `json:"organizationId"`
	ProjectID      string  `json:"projectId"`
	NodeID         string  `json:"nodeId"`
	Kind           string  `json:"kind"`
	Status         string  `json:"status"`
	Branch         *string `json:"branch,omitempty"`
	SourceBranch   *string `json:"sourceBranch,omitempty"`
	LocalPath      string  `json:"localPath"`
	State          string  `json:"state"`
	Health         *string `json:"health,omitempty"`
	CreatedAt      string  `json:"createdAt"`
	UpdatedAt      string  `json:"updatedAt"`
}

// WorkspaceUpdate contains the mutable fields of a local workspace.
type WorkspaceUpdate struct {
	Status    *string
	State     *string
	Health    *string
	LocalPath *string
	Branch    *string
}

// WorkspacePullRequest is a pull request observed for a local workspace.
type WorkspacePullRequest struct {
	ID             string  `json:"id"`
	WorkspaceID    string  `json:"workspaceId"`
	OrganizationID string  `json:"organizationId"`
	PRID           string  `json:"prId"`
	Title          *string `json:"title,omitempty"`
	URL            *string `json:"url,omitempty"`
	Branch         *string `json:"branch,omitempty"`
	BaseBranch     *string `json:"baseBranch,omitempty"`
	State          string  `json:"state"`
	Metadata       *string `json:"metadata,omitempty"`
	DetectedAt     string  `json:"detectedAt"`
	ResolvedAt     *string `json:"resolvedAt,omitempty"`
	CreatedAt      string  `json:"createdAt"`
	UpdatedAt      string  `json:"updatedAt"`
}
