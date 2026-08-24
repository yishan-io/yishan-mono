package sqlite

import (
	"context"
	"errors"

	"yishan/apps/cli/internal/workspace"
)

// Store implements workspace.WorkspaceStore over the raw SQLite store,
// converting between the domain Stored* types and the sqlite rows. The
// workspace layer depends on this adapter through the interface, never on the
// database package directly.
type Store struct {
	raw *WorkspaceStore
}

// NewStore wraps a raw SQLite workspace store.
func NewStore(raw *WorkspaceStore) *Store {
	return &Store{raw: raw}
}

func (s *Store) List(ctx context.Context) ([]workspace.StoredWorkspace, error) {
	rows, err := s.raw.List(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]workspace.StoredWorkspace, 0, len(rows))
	for _, row := range rows {
		out = append(out, storedWorkspaceFromRow(row))
	}
	return out, nil
}

func (s *Store) Update(ctx context.Context, workspaceID string, update workspace.StoredWorkspaceUpdate) error {
	err := s.raw.Update(ctx, workspaceID, storedUpdateFromDomain(update))
	if errors.Is(err, ErrWorkspaceNotFound) {
		return workspace.ErrWorkspaceNotFound
	}
	return err
}

func (s *Store) ListPRsByWorkspace(ctx context.Context, workspaceID string) ([]workspace.StoredPullRequest, error) {
	rows, err := s.raw.ListPRsByWorkspace(ctx, workspaceID)
	if err != nil {
		return nil, err
	}
	out := make([]workspace.StoredPullRequest, 0, len(rows))
	for _, row := range rows {
		out = append(out, storedPullRequestFromRow(row))
	}
	return out, nil
}

func (s *Store) UpsertPR(ctx context.Context, pullRequest *workspace.StoredPullRequest) error {
	return s.raw.UpsertPR(ctx, storedPullRequestToRow(pullRequest))
}

func (s *Store) ResolvePR(ctx context.Context, workspaceID string, pullRequestID string) error {
	return s.raw.ResolvePR(ctx, workspaceID, pullRequestID)
}

// storedWorkspaceFromRow converts a raw SQLite row to the domain view.
func storedWorkspaceFromRow(row Workspace) workspace.StoredWorkspace {
	return workspace.StoredWorkspace{
		ID:             row.ID,
		OrganizationID: row.OrganizationID,
		ProjectID:      row.ProjectID,
		NodeID:         row.NodeID,
		Kind:           row.Kind,
		Status:         row.Status,
		Branch:         row.Branch,
		SourceBranch:   row.SourceBranch,
		LocalPath:      row.LocalPath,
		State:          row.State,
		Health:         row.Health,
		Name:           row.Name,
	}
}

// storedUpdateFromDomain converts the domain update to the raw row update.
func storedUpdateFromDomain(update workspace.StoredWorkspaceUpdate) WorkspaceUpdate {
	return WorkspaceUpdate{
		Status:    update.Status,
		State:     update.State,
		Health:    update.Health,
		LocalPath: update.LocalPath,
		Branch:    update.Branch,
	}
}

// storedPullRequestFromRow converts a raw PR row to the domain view.
func storedPullRequestFromRow(row WorkspacePullRequest) workspace.StoredPullRequest {
	return workspace.StoredPullRequest{
		ID:             row.ID,
		WorkspaceID:    row.WorkspaceID,
		OrganizationID: row.OrganizationID,
		PRID:           row.PRID,
		Title:          row.Title,
		URL:            row.URL,
		Branch:         row.Branch,
		BaseBranch:     row.BaseBranch,
		State:          row.State,
		Metadata:       row.Metadata,
		DetectedAt:     row.DetectedAt,
		ResolvedAt:     row.ResolvedAt,
	}
}

// storedPullRequestToRow converts the domain PR to a raw row.
func storedPullRequestToRow(pr *workspace.StoredPullRequest) *WorkspacePullRequest {
	if pr == nil {
		return nil
	}
	return &WorkspacePullRequest{
		ID:             pr.ID,
		WorkspaceID:    pr.WorkspaceID,
		OrganizationID: pr.OrganizationID,
		PRID:           pr.PRID,
		Title:          pr.Title,
		URL:            pr.URL,
		Branch:         pr.Branch,
		BaseBranch:     pr.BaseBranch,
		State:          pr.State,
		Metadata:       pr.Metadata,
		DetectedAt:     pr.DetectedAt,
		ResolvedAt:     pr.ResolvedAt,
	}
}
