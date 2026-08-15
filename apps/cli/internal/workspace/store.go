package workspace

import (
	"context"
	"errors"
)

// ErrWorkspaceNotFound is returned by WorkspaceStore operations when the
// persisted row does not exist. The SQLite adapter maps the underlying
// database sentinel to this error so the workspace layer stays decoupled
// from the database package.
var ErrWorkspaceNotFound = errors.New("workspace not found")

// StoredWorkspace is the domain view of a persisted workspace row. The SQLite
// adapter (internal/dbconv) converts between this and the raw row; the
// workspace layer never imports the database package.
type StoredWorkspace struct {
	ID             string
	OrganizationID string
	ProjectID      string
	NodeID         string
	Kind           string
	Status         string
	Branch         *string
	SourceBranch   *string
	LocalPath      string
	State          string
	Health         *string
}

// StoredWorkspaceUpdate carries the mutable fields of a persisted workspace row.
type StoredWorkspaceUpdate struct {
	Status    *string
	State     *string
	Health    *string
	LocalPath *string
	Branch    *string
}

// StoredPullRequest is the domain view of a persisted workspace pull request.
type StoredPullRequest struct {
	ID             string
	WorkspaceID    string
	OrganizationID string
	PRID           string
	Title          *string
	URL            *string
	Branch         *string
	BaseBranch     *string
	State          string
	Metadata       *string
	DetectedAt     string
	ResolvedAt     *string
}

// WorkspaceStore is the durable storage the workspace layer needs: workspace
// rows and observed pull requests. The daemon injects the SQLite adapter
// (internal/dbconv.Store).
type WorkspaceStore interface {
	List(ctx context.Context) ([]StoredWorkspace, error)
	Update(ctx context.Context, workspaceID string, update StoredWorkspaceUpdate) error
	ListPRsByWorkspace(ctx context.Context, workspaceID string) ([]StoredPullRequest, error)
	UpsertPR(ctx context.Context, pullRequest *StoredPullRequest) error
	ResolvePR(ctx context.Context, workspaceID string, pullRequestID string) error
}
