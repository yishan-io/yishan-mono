package sqlite

// ProjectCommand is a named shell command configured for a project.
type ProjectCommand struct {
	Name    string `json:"name"`
	Command string `json:"command"`
}

// Project is the daemon-owned local project record.
type Project struct {
	ID              string           `json:"id"`
	Name            string           `json:"name"`
	TaskPrefix      *string          `json:"taskPrefix"`
	SourceType      string           `json:"sourceType"`
	RepoProvider    *string          `json:"repoProvider,omitempty"`
	RepoURL         *string          `json:"repoUrl,omitempty"`
	RepoKey         *string          `json:"repoKey,omitempty"`
	Icon            string           `json:"icon"`
	Color           string           `json:"color"`
	SetupScript     string           `json:"setupScript"`
	PostScript      string           `json:"postScript"`
	Commands        []ProjectCommand `json:"commands"`
	ContextEnabled  bool             `json:"contextEnabled"`
	OrganizationID  string           `json:"organizationId"`
	CreatedByUserID *string          `json:"createdByUserId,omitempty"`
	CreatedAt       string           `json:"createdAt"`
	UpdatedAt       string           `json:"updatedAt"`
}
