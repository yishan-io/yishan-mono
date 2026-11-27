package sqlite

import "errors"

// ErrProjectNotFound reports a missing local project.
var ErrProjectNotFound = errors.New("project not found")

// ErrProjectConflict reports a local uniqueness violation: the task prefix or
// the repository is already used by another project in the organization.
var ErrProjectConflict = errors.New("project conflicts with an existing project")

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

// ProjectUpdate lists the mutable project fields; nil leaves a field as is.
type ProjectUpdate struct {
	Name           *string
	Icon           *string
	Color          *string
	SetupScript    *string
	PostScript     *string
	Commands       *[]ProjectCommand
	ContextEnabled *bool
	TaskPrefix     *string
	SourceType     *string
	RepoProvider   *string
	RepoURL        *string
	RepoKey        *string
}

// PrimaryWorkspaceInput is the host-local primary checkout of a project.
type PrimaryWorkspaceInput struct {
	ID        string
	NodeID    string
	LocalPath string
}
