package daemon

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"sync"
	"time"
)

const workspaceCleanupFileName = "pending-workspace-cleanups.json"

type pendingWorkspaceCleanup struct {
	WorkspaceID   string `json:"workspaceId"`
	Path          string `json:"path"`
	Branch        string `json:"branch,omitempty"`
	RemoveBranch  bool   `json:"removeBranch,omitempty"`
	ForceWorktree bool   `json:"forceWorktree,omitempty"`
	ForceBranch   bool   `json:"forceBranch,omitempty"`
	PostHook      string `json:"postHook,omitempty"`
	CreatedAt     string `json:"createdAt"`
	UpdatedAt     string `json:"updatedAt"`
	Attempts      int    `json:"attempts"`
	LastError     string `json:"lastError,omitempty"`
}

type pendingWorkspaceCleanupFile struct {
	Items []pendingWorkspaceCleanup `json:"items"`
}

// workspaceCleanupStore persists the pending workspace cleanup retry queue.
// Data lives in the pending_workspace_cleanups SQLite table; the legacy JSON
// file is imported once on construction and then removed.
type workspaceCleanupStore struct {
	mu sync.Mutex
	db *sql.DB
}

func newWorkspaceCleanupStore(database *sql.DB, legacyFilePath string) (*workspaceCleanupStore, error) {
	store := &workspaceCleanupStore{db: database}
	if err := store.importLegacyFile(legacyFilePath); err != nil {
		return nil, err
	}
	return store, nil
}

func (s *workspaceCleanupStore) importLegacyFile(path string) error {
	raw, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("read legacy workspace cleanup file %q: %w", path, err)
	}
	if len(raw) == 0 {
		return nil
	}
	var file pendingWorkspaceCleanupFile
	if err := json.Unmarshal(raw, &file); err != nil {
		return fmt.Errorf("parse legacy workspace cleanup file %q: %w", path, err)
	}
	for _, item := range file.Items {
		if err := s.Add(item); err != nil {
			return fmt.Errorf("import legacy workspace cleanup %q: %w", item.WorkspaceID, err)
		}
	}
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("remove legacy workspace cleanup file %q: %w", path, err)
	}
	return nil
}

func (s *workspaceCleanupStore) Add(item pendingWorkspaceCleanup) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UTC().Format(time.RFC3339Nano)
	item.UpdatedAt = now
	if item.CreatedAt == "" {
		item.CreatedAt = now
	}

	// Preserve the retry history of an existing entry (same as the old JSON store).
	var attempts int
	var lastError string
	err := s.db.QueryRow(
		`SELECT attempts, last_error FROM pending_workspace_cleanups WHERE workspace_id = ?`,
		item.WorkspaceID,
	).Scan(&attempts, &lastError)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	if err == nil {
		item.Attempts = attempts
		item.LastError = lastError
	}

	_, err = s.db.Exec(`
		INSERT INTO pending_workspace_cleanups (
			workspace_id, path, branch, remove_branch, force_worktree, force_branch,
			post_hook, created_at, updated_at, attempts, last_error
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(workspace_id) DO UPDATE SET
			path = excluded.path,
			branch = excluded.branch,
			remove_branch = excluded.remove_branch,
			force_worktree = excluded.force_worktree,
			force_branch = excluded.force_branch,
			post_hook = excluded.post_hook,
			created_at = excluded.created_at,
			updated_at = excluded.updated_at,
			attempts = excluded.attempts,
			last_error = excluded.last_error
	`,
		item.WorkspaceID, item.Path, nullableString(item.Branch), boolToInt(item.RemoveBranch),
		boolToInt(item.ForceWorktree), boolToInt(item.ForceBranch), nullableString(item.PostHook),
		item.CreatedAt, item.UpdatedAt, item.Attempts, nullableString(item.LastError),
	)
	return err
}

func (s *workspaceCleanupStore) Remove(workspaceID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.Exec(`DELETE FROM pending_workspace_cleanups WHERE workspace_id = ?`, workspaceID)
	return err
}

func (s *workspaceCleanupStore) List() ([]pendingWorkspaceCleanup, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	rows, err := s.db.Query(`
		SELECT workspace_id, path, branch, remove_branch, force_worktree, force_branch,
			post_hook, created_at, updated_at, attempts, last_error
		FROM pending_workspace_cleanups
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []pendingWorkspaceCleanup
	for rows.Next() {
		var item pendingWorkspaceCleanup
		var removeBranch, forceWorktree, forceBranch int
		var branch, postHook, lastError sql.NullString
		if err := rows.Scan(
			&item.WorkspaceID, &item.Path, &branch, &removeBranch, &forceWorktree, &forceBranch,
			&postHook, &item.CreatedAt, &item.UpdatedAt, &item.Attempts, &lastError,
		); err != nil {
			return nil, err
		}
		item.Branch = branch.String
		item.RemoveBranch = removeBranch != 0
		item.ForceWorktree = forceWorktree != 0
		item.ForceBranch = forceBranch != 0
		item.PostHook = postHook.String
		item.LastError = lastError.String
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if items == nil {
		items = []pendingWorkspaceCleanup{}
	}
	return items, nil
}

func (s *workspaceCleanupStore) MarkFailure(workspaceID string, cleanupErr error) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.Exec(`
		UPDATE pending_workspace_cleanups
		SET attempts = attempts + 1, updated_at = ?, last_error = ?
		WHERE workspace_id = ?
	`, time.Now().UTC().Format(time.RFC3339Nano), cleanupErr.Error(), workspaceID)
	return err
}

func boolToInt(value bool) int {
	if value {
		return 1
	}
	return 0
}

func nullableString(value string) any {
	if value == "" {
		return nil
	}
	return value
}
