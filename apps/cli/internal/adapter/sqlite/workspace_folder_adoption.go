package sqlite

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
)

// AdoptUnownedFolders assigns organizationID to every folder workspace that
// has no organization yet (legacy rows created before folders were
// org-scoped), together with the token usage rows attributed to those
// folders. Folder-project Local Tasks are deliberately untouched: the task
// domain requires folder tasks to carry no organization (localtask.ValidateTask).
// It runs in one transaction and returns the adopted folder IDs. Calling it
// again is a no-op once no unowned folders remain.
func (store *WorkspaceStore) AdoptUnownedFolders(ctx context.Context, organizationID string) ([]string, error) {
	organizationID = strings.TrimSpace(organizationID)
	if organizationID == "" {
		return nil, fmt.Errorf("adopt unowned folders: organization id is required")
	}
	tx, err := store.database.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin folder adoption: %w", err)
	}
	defer func() { _ = tx.Rollback() }() // no-op after a successful commit

	folderIDs, err := listUnownedFolderIDs(ctx, tx)
	if err != nil {
		return nil, err
	}
	if len(folderIDs) == 0 {
		return nil, nil
	}
	if err := adoptFolderRows(ctx, tx, organizationID, folderIDs); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit folder adoption: %w", err)
	}
	return folderIDs, nil
}

func listUnownedFolderIDs(ctx context.Context, tx *sql.Tx) ([]string, error) {
	rows, err := tx.QueryContext(ctx, `SELECT id FROM workspaces
		WHERE kind = 'folder' AND project_id IS NULL AND (organization_id IS NULL OR organization_id = '')
		ORDER BY created_at, id`)
	if err != nil {
		return nil, fmt.Errorf("list unowned folders: %w", err)
	}
	defer func() { _ = rows.Close() }() // read-only cursor; close error carries no data
	var folderIDs []string
	for rows.Next() {
		var folderID string
		if err := rows.Scan(&folderID); err != nil {
			return nil, fmt.Errorf("scan unowned folder: %w", err)
		}
		folderIDs = append(folderIDs, folderID)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate unowned folders: %w", err)
	}
	return folderIDs, nil
}

func adoptFolderRows(ctx context.Context, tx *sql.Tx, organizationID string, folderIDs []string) error {
	placeholders := strings.TrimSuffix(strings.Repeat("?,", len(folderIDs)), ",")
	statements := []struct {
		label string
		query string
	}{
		{"folders", `UPDATE workspaces SET organization_id = ?, updated_at = datetime('now')
			WHERE id IN (` + placeholders + `)`},
		{"folder token usage", `UPDATE token_usage_hourly SET organization_id = ?
			WHERE organization_id = '' AND workspace_id IN (` + placeholders + `)`},
	}
	args := make([]any, 0, len(folderIDs)+1)
	args = append(args, organizationID)
	for _, folderID := range folderIDs {
		args = append(args, folderID)
	}
	for _, statement := range statements {
		if _, err := tx.ExecContext(ctx, statement.query, args...); err != nil {
			return fmt.Errorf("adopt %s: %w", statement.label, err)
		}
	}
	return nil
}
