package api

// ProjectCommand is a named shell command exported with a project row.
type ProjectCommand struct {
	Name    string `json:"name"`
	Command string `json:"command"`
}

// OrganizationExportProject is a project row parsed from the organization export CSV.
type OrganizationExportProject struct {
	ID              string
	Name            string
	SourceType      string
	RepoProvider    *string
	RepoURL         *string
	RepoKey         *string
	Icon            string
	Color           string
	SetupScript     string
	PostScript      string
	Commands        []ProjectCommand
	ContextEnabled  bool
	OrganizationID  string
	CreatedByUserID *string
	CreatedAt       string
	UpdatedAt       string
}

// OrganizationExportWorkspace is a workspace row parsed from the organization export CSV.
type OrganizationExportWorkspace struct {
	ID             string
	OrganizationID string
	ProjectID      string
	NodeID         string
	Kind           string
	Status         string
	Branch         *string
	SourceBranch   *string
	LocalPath      string
	CreatedAt      string
	UpdatedAt      string
}
