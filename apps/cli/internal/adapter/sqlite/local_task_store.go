package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"

	"yishan/apps/cli/internal/localtask"
)

const localTaskColumns = `id, project_id, title, description, status, priority, created_at, updated_at, completed_at`
const localTaskLinkColumns = `id, local_task_id, workspace_id, role, status, linked_at, unlinked_at`

// LocalTaskStore persists Local Task metadata and local workspace links.
type LocalTaskStore struct {
	database *sql.DB
}

// NewLocalTaskStore creates a Local Task store backed by database.
func NewLocalTaskStore(database *sql.DB) *LocalTaskStore {
	return &LocalTaskStore{database: database}
}

// Create persists a Local Task and assigns an ID when omitted.
func (store *LocalTaskStore) Create(ctx context.Context, task localtask.Task) (localtask.Task, error) {
	if task.ID == "" {
		task.ID = uuid.NewString()
	}
	if err := localtask.ValidateTask(task); err != nil {
		return localtask.Task{}, err
	}
	return store.insertTask(ctx, task)
}

func (store *LocalTaskStore) insertTask(ctx context.Context, task localtask.Task) (localtask.Task, error) {
	_, err := store.database.ExecContext(ctx, `INSERT INTO local_tasks (`+localTaskColumns+`)
		VALUES (?, ?, ?, ?, ?, ?, COALESCE(NULLIF(?, ''), datetime('now')), datetime('now'),
		CASE WHEN ? = 'completed' THEN COALESCE(NULLIF(?, ''), datetime('now')) ELSE NULL END)`, task.ID,
		task.ProjectID, task.Title, task.Description, task.Status, task.Priority, task.CreatedAt, task.Status, task.CompletedAt)
	if err != nil {
		return localtask.Task{}, fmt.Errorf("create local task: %w", err)
	}
	return store.Get(ctx, task.ID)
}

// Get loads one Local Task by ID.
func (store *LocalTaskStore) Get(ctx context.Context, taskID string) (localtask.Task, error) {
	task, err := scanLocalTask(store.database.QueryRowContext(ctx,
		`SELECT `+localTaskColumns+` FROM local_tasks WHERE id = ?`, taskID))
	return handleLocalTaskGet(taskID, task, err)
}

// List loads Local Tasks matching filter in most-recently-updated order.
func (store *LocalTaskStore) List(ctx context.Context, filter localtask.TaskFilter) ([]localtask.Task, error) {
	query, arguments := buildLocalTaskListQuery(filter)
	rows, err := store.database.QueryContext(ctx, query, arguments...)
	if err != nil {
		return nil, fmt.Errorf("list local tasks: %w", err)
	}
	defer rows.Close()
	return scanLocalTasks(rows)
}

// Update applies supplied Local Task metadata and lifecycle updates.
func (store *LocalTaskStore) Update(ctx context.Context, taskID string, update localtask.TaskUpdate) (localtask.Task, error) {
	if err := localtask.ValidateTaskUpdate(update); err != nil {
		return localtask.Task{}, err
	}
	query, arguments := buildLocalTaskUpdate(update)
	if query == "" {
		return store.Get(ctx, taskID)
	}
	arguments = append(arguments, taskID)
	if err := store.updateTask(ctx, query, arguments...); err != nil {
		return localtask.Task{}, err
	}
	return store.Get(ctx, taskID)
}

func (store *LocalTaskStore) updateTask(ctx context.Context, query string, arguments ...any) error {
	result, err := store.database.ExecContext(ctx, query, arguments...)
	if err != nil {
		return fmt.Errorf("update local task: %w", err)
	}
	return requireLocalTaskUpdated(result)
}

// Search searches Local Task titles and descriptions with SQLite FTS5.
func (store *LocalTaskStore) Search(ctx context.Context, query string, filter localtask.TaskFilter) ([]localtask.SearchResult, error) {
	if strings.TrimSpace(query) == "" {
		return nil, nil
	}
	searchQuery, arguments := buildLocalTaskSearchQuery(query, filter)
	rows, err := store.database.QueryContext(ctx, searchQuery, arguments...)
	if err != nil {
		return nil, fmt.Errorf("search local tasks: %w", err)
	}
	defer rows.Close()
	return scanLocalTaskSearchResults(rows)
}

// LinkWorkspace creates a historical link from a Local Task to a local workspace.
func (store *LocalTaskStore) LinkWorkspace(ctx context.Context, link localtask.WorkspaceLink) (localtask.WorkspaceLink, error) {
	if link.ID == "" {
		link.ID = uuid.NewString()
	}
	if err := localtask.ValidateWorkspaceLink(link); err != nil {
		return localtask.WorkspaceLink{}, err
	}
	return store.insertWorkspaceLink(ctx, link)
}

func (store *LocalTaskStore) insertWorkspaceLink(ctx context.Context, link localtask.WorkspaceLink) (localtask.WorkspaceLink, error) {
	_, err := store.database.ExecContext(ctx, `INSERT INTO local_task_workspace_links (`+localTaskLinkColumns+`)
		VALUES (?, ?, ?, ?, ?, datetime('now'), ?)`, link.ID, link.LocalTaskID, link.WorkspaceID,
		link.Role, link.Status, link.UnlinkedAt)
	if err != nil {
		return localtask.WorkspaceLink{}, fmt.Errorf("link local task to workspace: %w", err)
	}
	return store.getWorkspaceLink(ctx, link.ID)
}

// UnlinkWorkspace keeps link history while removing the current association.
func (store *LocalTaskStore) UnlinkWorkspace(ctx context.Context, linkID string) error {
	result, err := store.database.ExecContext(ctx, `UPDATE local_task_workspace_links
		SET status = 'completed', unlinked_at = datetime('now') WHERE id = ? AND unlinked_at IS NULL`, linkID)
	if err != nil {
		return fmt.Errorf("unlink local task from workspace: %w", err)
	}
	return requireWorkspaceLinkUpdated(result)
}

// UpdateWorkspaceLinkStatus changes a link lifecycle status transactionally.
func (store *LocalTaskStore) UpdateWorkspaceLinkStatus(ctx context.Context, linkID string, status localtask.Status) (localtask.WorkspaceLink, error) {
	if err := localtask.ValidateLinkStatus(status); err != nil {
		return localtask.WorkspaceLink{}, err
	}
	transaction, err := store.database.BeginTx(ctx, nil)
	if err != nil {
		return localtask.WorkspaceLink{}, fmt.Errorf("begin update workspace link status: %w", err)
	}
	link, err := updateWorkspaceLinkStatus(ctx, transaction, linkID, status)
	if err != nil {
		_ = transaction.Rollback() // best-effort cleanup; the operation error is authoritative
		return localtask.WorkspaceLink{}, err
	}
	if err := transaction.Commit(); err != nil {
		return localtask.WorkspaceLink{}, fmt.Errorf("commit workspace link status: %w", err)
	}
	return link, nil
}

func updateWorkspaceLinkStatus(ctx context.Context, transaction *sql.Tx, linkID string, status localtask.Status) (localtask.WorkspaceLink, error) {
	link, err := getWorkspaceLinkInTx(ctx, transaction, linkID)
	if err != nil {
		return localtask.WorkspaceLink{}, err
	}
	if link.UnlinkedAt != nil {
		return localtask.WorkspaceLink{}, localtask.ErrInvalidLink
	}
	if link.Role == localtask.LinkRolePrimary && status == localtask.StatusActive {
		if err := demoteOtherPrimaryWorkspaceTask(ctx, transaction, link.WorkspaceID, link.ID); err != nil {
			return localtask.WorkspaceLink{}, err
		}
	}
	row := transaction.QueryRowContext(ctx, `UPDATE local_task_workspace_links SET status = ? WHERE id = ?
		RETURNING `+localTaskLinkColumns, status, linkID)
	updated, err := scanWorkspaceLink(row)
	if err != nil {
		return localtask.WorkspaceLink{}, fmt.Errorf("update workspace link status: %w", err)
	}
	return updated, nil
}

func getWorkspaceLinkInTx(ctx context.Context, transaction *sql.Tx, linkID string) (localtask.WorkspaceLink, error) {
	link, err := scanWorkspaceLink(transaction.QueryRowContext(ctx,
		`SELECT `+localTaskLinkColumns+` FROM local_task_workspace_links WHERE id = ?`, linkID))
	if errors.Is(err, sql.ErrNoRows) {
		return localtask.WorkspaceLink{}, localtask.ErrLinkNotFound
	}
	if err != nil {
		return localtask.WorkspaceLink{}, fmt.Errorf("get local task workspace link: %w", err)
	}
	return link, nil
}

func demoteOtherPrimaryWorkspaceTask(ctx context.Context, transaction *sql.Tx, workspaceID string, linkID string) error {
	_, err := transaction.ExecContext(ctx, `UPDATE local_task_workspace_links SET role = 'related'
		WHERE workspace_id = ? AND id <> ? AND role = 'primary' AND status = 'active' AND unlinked_at IS NULL`, workspaceID, linkID)
	if err != nil {
		return fmt.Errorf("replace active primary local task: %w", err)
	}
	return nil
}

// ListWorkspaceLinks loads all task links for a workspace, newest first.
func (store *LocalTaskStore) ListWorkspaceLinks(ctx context.Context, workspaceID string) ([]localtask.WorkspaceLink, error) {
	return store.listWorkspaceLinks(ctx, `SELECT `+localTaskLinkColumns+` FROM local_task_workspace_links
		WHERE workspace_id = ? ORDER BY linked_at DESC, id`, workspaceID)
}

// ListTaskLinks loads all workspace links for a Local Task, newest first.
func (store *LocalTaskStore) ListTaskLinks(ctx context.Context, taskID string) ([]localtask.WorkspaceLink, error) {
	return store.listWorkspaceLinks(ctx, `SELECT `+localTaskLinkColumns+` FROM local_task_workspace_links
		WHERE local_task_id = ? ORDER BY linked_at DESC, id`, taskID)
}

func (store *LocalTaskStore) listWorkspaceLinks(ctx context.Context, query string, identifier string) ([]localtask.WorkspaceLink, error) {
	rows, err := store.database.QueryContext(ctx, query, identifier)
	if err != nil {
		return nil, fmt.Errorf("list local task workspace links: %w", err)
	}
	defer rows.Close()
	return scanWorkspaceLinks(rows)
}

// SetPrimaryWorkspaceTask atomically replaces a workspace's active primary task.
func (store *LocalTaskStore) SetPrimaryWorkspaceTask(ctx context.Context, taskID string, workspaceID string) (localtask.WorkspaceLink, error) {
	transaction, err := store.database.BeginTx(ctx, nil)
	if err != nil {
		return localtask.WorkspaceLink{}, fmt.Errorf("begin set primary local task: %w", err)
	}
	link, err := store.setPrimaryWorkspaceTask(ctx, transaction, taskID, workspaceID)
	if err != nil {
		_ = transaction.Rollback() // best-effort cleanup; the operation error is authoritative
		return localtask.WorkspaceLink{}, err
	}
	if err := transaction.Commit(); err != nil {
		return localtask.WorkspaceLink{}, fmt.Errorf("commit set primary local task: %w", err)
	}
	return link, nil
}

func (store *LocalTaskStore) setPrimaryWorkspaceTask(ctx context.Context, transaction *sql.Tx, taskID string, workspaceID string) (localtask.WorkspaceLink, error) {
	if err := demotePrimaryWorkspaceTask(ctx, transaction, workspaceID); err != nil {
		return localtask.WorkspaceLink{}, err
	}
	link, err := activatePrimaryWorkspaceLink(ctx, transaction, taskID, workspaceID)
	if errors.Is(err, sql.ErrNoRows) {
		return createPrimaryWorkspaceLink(ctx, transaction, taskID, workspaceID)
	}
	if err != nil {
		return localtask.WorkspaceLink{}, fmt.Errorf("activate primary local task link: %w", err)
	}
	return link, nil
}

func demotePrimaryWorkspaceTask(ctx context.Context, transaction *sql.Tx, workspaceID string) error {
	_, err := transaction.ExecContext(ctx, `UPDATE local_task_workspace_links SET role = 'related'
		WHERE workspace_id = ? AND role = 'primary' AND status = 'active' AND unlinked_at IS NULL`, workspaceID)
	if err != nil {
		return fmt.Errorf("demote primary local task: %w", err)
	}
	return nil
}

func activatePrimaryWorkspaceLink(ctx context.Context, transaction *sql.Tx, taskID string, workspaceID string) (localtask.WorkspaceLink, error) {
	row := transaction.QueryRowContext(ctx, `UPDATE local_task_workspace_links SET role = 'primary', status = 'active'
		WHERE local_task_id = ? AND workspace_id = ? AND unlinked_at IS NULL RETURNING `+localTaskLinkColumns, taskID, workspaceID)
	return scanWorkspaceLink(row)
}

func createPrimaryWorkspaceLink(ctx context.Context, transaction *sql.Tx, taskID string, workspaceID string) (localtask.WorkspaceLink, error) {
	linkID := uuid.NewString()
	row := transaction.QueryRowContext(ctx, `INSERT INTO local_task_workspace_links (`+localTaskLinkColumns+`)
		VALUES (?, ?, ?, 'primary', 'active', datetime('now'), NULL) RETURNING `+localTaskLinkColumns, linkID, taskID, workspaceID)
	link, err := scanWorkspaceLink(row)
	if err != nil {
		return localtask.WorkspaceLink{}, fmt.Errorf("create primary local task link: %w", err)
	}
	return link, nil
}

func (store *LocalTaskStore) getWorkspaceLink(ctx context.Context, linkID string) (localtask.WorkspaceLink, error) {
	link, err := scanWorkspaceLink(store.database.QueryRowContext(ctx,
		`SELECT `+localTaskLinkColumns+` FROM local_task_workspace_links WHERE id = ?`, linkID))
	if errors.Is(err, sql.ErrNoRows) {
		return localtask.WorkspaceLink{}, localtask.ErrLinkNotFound
	}
	if err != nil {
		return localtask.WorkspaceLink{}, fmt.Errorf("get local task workspace link: %w", err)
	}
	return link, nil
}
