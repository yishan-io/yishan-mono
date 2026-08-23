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
const localTaskLinkColumns = `id, local_task_id, workspace_id, status, linked_at, unlinked_at`

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
	normalizedTags, err := localtask.NormalizeTags(task.Tags)
	if err != nil {
		return localtask.Task{}, err
	}
	task.Tags = normalizedTags
	transaction, err := store.database.BeginTx(ctx, nil)
	if err != nil {
		return localtask.Task{}, fmt.Errorf("begin create local task: %w", err)
	}
	if _, err := transaction.ExecContext(ctx, `INSERT INTO local_tasks (`+localTaskColumns+`)
		VALUES (?, ?, ?, ?, ?, ?, COALESCE(NULLIF(?, ''), datetime('now')), datetime('now'),
		CASE WHEN ? = 'completed' THEN COALESCE(NULLIF(?, ''), datetime('now')) ELSE NULL END)`, task.ID,
		task.ProjectID, task.Title, task.Description, task.Status, task.Priority, task.CreatedAt, task.Status, task.CompletedAt); err != nil {
		_ = transaction.Rollback() // best-effort cleanup; the operation error is authoritative
		return localtask.Task{}, fmt.Errorf("create local task: %w", err)
	}
	if err := insertLocalTaskTags(ctx, transaction, task.ID, task.Tags); err != nil {
		_ = transaction.Rollback() // best-effort cleanup; the operation error is authoritative
		return localtask.Task{}, err
	}
	created, err := getLocalTask(ctx, transaction, task.ID)
	if err != nil {
		_ = transaction.Rollback() // best-effort cleanup; the operation error is authoritative
		return localtask.Task{}, err
	}
	if err := transaction.Commit(); err != nil {
		return localtask.Task{}, fmt.Errorf("commit create local task: %w", err)
	}
	return created, nil
}

// Get loads one Local Task by ID.
func (store *LocalTaskStore) Get(ctx context.Context, taskID string) (localtask.Task, error) {
	return getLocalTask(ctx, store.database, taskID)
}

// List loads Local Tasks matching filter in most-recently-updated order.
func (store *LocalTaskStore) List(ctx context.Context, filter localtask.TaskFilter) ([]localtask.Task, error) {
	query, arguments := buildLocalTaskListQuery(filter)
	rows, err := store.database.QueryContext(ctx, query, arguments...)
	if err != nil {
		return nil, fmt.Errorf("list local tasks: %w", err)
	}
	tasks, err := scanLocalTasks(rows)
	if err != nil {
		_ = rows.Close() // best-effort cleanup; the scan error is authoritative
		return nil, err
	}
	if err := rows.Close(); err != nil {
		return nil, fmt.Errorf("close local task rows: %w", err)
	}
	return store.hydrateTasks(ctx, tasks)
}

// Update applies supplied Local Task metadata and lifecycle updates.
func (store *LocalTaskStore) Update(ctx context.Context, taskID string, update localtask.TaskUpdate) (localtask.Task, error) {
	if err := localtask.ValidateTaskUpdate(update); err != nil {
		return localtask.Task{}, err
	}
	query, arguments := buildLocalTaskUpdate(update)
	if query == "" && update.Tags == nil {
		return store.Get(ctx, taskID)
	}
	transaction, err := store.database.BeginTx(ctx, nil)
	if err != nil {
		return localtask.Task{}, fmt.Errorf("begin update local task: %w", err)
	}
	if query != "" {
		arguments = append(arguments, taskID)
		if err := updateLocalTask(ctx, transaction, query, arguments...); err != nil {
			_ = transaction.Rollback() // best-effort cleanup; the operation error is authoritative
			return localtask.Task{}, err
		}
	} else if err := updateLocalTask(ctx, transaction, `UPDATE local_tasks SET updated_at = datetime('now') WHERE id = ?`, taskID); err != nil {
		_ = transaction.Rollback() // best-effort cleanup; the operation error is authoritative
		return localtask.Task{}, err
	}
	if update.Tags != nil {
		tags, err := localtask.NormalizeTags(*update.Tags)
		if err != nil {
			_ = transaction.Rollback() // best-effort cleanup; the operation error is authoritative
			return localtask.Task{}, err
		}
		if err := replaceLocalTaskTags(ctx, transaction, taskID, tags); err != nil {
			_ = transaction.Rollback() // best-effort cleanup; the operation error is authoritative
			return localtask.Task{}, err
		}
	}
	updated, err := getLocalTask(ctx, transaction, taskID)
	if err != nil {
		_ = transaction.Rollback() // best-effort cleanup; the operation error is authoritative
		return localtask.Task{}, err
	}
	if err := transaction.Commit(); err != nil {
		return localtask.Task{}, fmt.Errorf("commit update local task: %w", err)
	}
	return updated, nil
}

func updateLocalTask(ctx context.Context, queryer localTaskQueryer, query string, arguments ...any) error {
	result, err := queryer.ExecContext(ctx, query, arguments...)
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
	results, err := scanLocalTaskSearchResults(rows)
	if err != nil {
		_ = rows.Close() // best-effort cleanup; the scan error is authoritative
		return nil, err
	}
	if err := rows.Close(); err != nil {
		return nil, fmt.Errorf("close local task search rows: %w", err)
	}
	if err := hydrateLocalTaskSearchResultTags(ctx, store.database, results); err != nil {
		return nil, err
	}
	return results, nil
}

func (store *LocalTaskStore) hydrateTasks(ctx context.Context, tasks []localtask.Task) ([]localtask.Task, error) {
	taskPointers := make([]*localtask.Task, len(tasks))
	for index := range tasks {
		taskPointers[index] = &tasks[index]
	}
	if err := hydrateLocalTaskTags(ctx, store.database, taskPointers); err != nil {
		return nil, err
	}
	return tasks, nil
}

func hydrateLocalTaskSearchResultTags(ctx context.Context, queryer localTaskQueryer, results []localtask.SearchResult) error {
	taskPointers := make([]*localtask.Task, len(results))
	for index := range results {
		taskPointers[index] = &results[index].Task
	}
	return hydrateLocalTaskTags(ctx, queryer, taskPointers)
}

// ListTags returns globally retained Local Task tag catalog entries by normalized key.
func (store *LocalTaskStore) ListTags(ctx context.Context) ([]localtask.Tag, error) {
	rows, err := store.database.QueryContext(ctx, `SELECT catalog.normalized_tag, catalog.tag, catalog.color, catalog.custom_color, aliases.tag
	FROM local_task_tag_catalog AS catalog
	JOIN local_task_tag_catalog_aliases AS aliases ON aliases.normalized_tag = catalog.normalized_tag
	ORDER BY catalog.normalized_tag, aliases.tag`)
	if err != nil {
		return nil, fmt.Errorf("list local task tag catalog: %w", err)
	}
	defer rows.Close()
	tags := make([]localtask.Tag, 0)
	for rows.Next() {
		var key, name, alias string
		var color, customColor *string
		if err := rows.Scan(&key, &name, &color, &customColor, &alias); err != nil {
			return nil, fmt.Errorf("scan local task tag catalog: %w", err)
		}
		if len(tags) == 0 || tags[len(tags)-1].Key != key {
			tags = append(tags, localtask.Tag{Key: key, Name: name, Color: color, CustomColor: customColor, Aliases: make([]string, 0)})
		}
		tags[len(tags)-1].Aliases = append(tags[len(tags)-1].Aliases, alias)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate local task tag catalog: %w", err)
	}
	return tags, nil
}

// UpdateTagColor sets or clears a global Local Task tag catalog color.
func (store *LocalTaskStore) UpdateTagColor(ctx context.Context, key string, update localtask.TagColorUpdate) (localtask.Tag, error) {
	if err := localtask.ValidateTagColorUpdate(update); err != nil {
		return localtask.Tag{}, err
	}
	if update.DisplayName != nil {
		return store.ensureAndUpdateTagColor(ctx, *update.DisplayName, update)
	}
	if err := localtask.ValidateTagKey(key); err != nil {
		return localtask.Tag{}, err
	}
	return store.updateTagColor(ctx, store.database, key, update)
}

func (store *LocalTaskStore) ensureAndUpdateTagColor(ctx context.Context, displayName string, update localtask.TagColorUpdate) (localtask.Tag, error) {
	name, err := localtask.NormalizeTag(displayName)
	if err != nil {
		return localtask.Tag{}, err
	}
	key, err := localtask.NormalizeTagKey(name)
	if err != nil {
		return localtask.Tag{}, err
	}
	transaction, err := store.database.BeginTx(ctx, nil)
	if err != nil {
		return localtask.Tag{}, fmt.Errorf("begin local task tag color transaction: %w", err)
	}
	defer transaction.Rollback() // best-effort rollback unless commit succeeds
	if err := upsertLocalTaskTagCatalog(ctx, transaction, key, name); err != nil {
		return localtask.Tag{}, err
	}
	if _, err := store.updateTagColor(ctx, transaction, key, update); err != nil {
		return localtask.Tag{}, err
	}
	if err := transaction.Commit(); err != nil {
		return localtask.Tag{}, fmt.Errorf("commit local task tag color transaction: %w", err)
	}
	return store.getTagCatalogEntry(ctx, key)
}

func (store *LocalTaskStore) updateTagColor(ctx context.Context, queryer localTaskQueryer, key string, update localtask.TagColorUpdate) (localtask.Tag, error) {
	result, err := queryer.ExecContext(ctx, `UPDATE local_task_tag_catalog
		SET color = ?, custom_color = ?, updated_at = datetime('now') WHERE normalized_tag = ?`, update.Color, update.CustomColor, key)
	if err != nil {
		return localtask.Tag{}, fmt.Errorf("update local task tag color: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return localtask.Tag{}, fmt.Errorf("count local task tag catalog update: %w", err)
	}
	if affected == 0 {
		return localtask.Tag{}, localtask.ErrTagNotFound
	}
	if queryer != store.database {
		return localtask.Tag{Key: key}, nil
	}
	return store.getTagCatalogEntry(ctx, key)
}

func (store *LocalTaskStore) getTagCatalogEntry(ctx context.Context, key string) (localtask.Tag, error) {
	tags, err := store.ListTags(ctx)
	if err != nil {
		return localtask.Tag{}, err
	}
	for _, tag := range tags {
		if tag.Key == key {
			return tag, nil
		}
	}
	return localtask.Tag{}, localtask.ErrTagNotFound
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
		VALUES (?, ?, ?, ?, datetime('now'), ?)`, link.ID, link.LocalTaskID, link.WorkspaceID,
		link.Status, link.UnlinkedAt)
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
