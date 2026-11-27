package sqlite

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

const projectColumns = `id, organization_id, name, source_type, repo_provider, repo_url, repo_key,
	icon, color, setup_script, post_script, commands, context_enabled, task_prefix,
	created_by_user_id, created_at, updated_at`

// ProjectStore persists daemon-owned projects and their host-local primary
// workspace rows.
type ProjectStore struct {
	database *sql.DB
}

// NewProjectStore creates a project store backed by database.
func NewProjectStore(database *sql.DB) *ProjectStore {
	return &ProjectStore{database: database}
}

// Create inserts project and, when primary is non-nil, its primary workspace
// row in one transaction. Uniqueness violations return ErrProjectConflict.
func (store *ProjectStore) Create(ctx context.Context, project Project, primary *PrimaryWorkspaceInput) error {
	return store.withTx(ctx, func(tx *sql.Tx) error {
		if err := insertProject(ctx, tx, project, false); err != nil {
			return err
		}
		if primary == nil {
			return nil
		}
		return upsertPrimaryWorkspace(ctx, tx, project, *primary)
	})
}

// Import inserts projects (and their primary rows) that are not stored yet.
// Existing rows are left untouched so a re-run never overwrites local edits.
func (store *ProjectStore) Import(ctx context.Context, projects []Project, primaries map[string]PrimaryWorkspaceInput) error {
	return store.withTx(ctx, func(tx *sql.Tx) error {
		for _, project := range projects {
			if err := insertProject(ctx, tx, project, true); err != nil {
				return err
			}
			primary, ok := primaries[project.ID]
			if !ok {
				continue
			}
			if err := insertPrimaryWorkspaceIfMissing(ctx, tx, project, primary); err != nil {
				return err
			}
		}
		return nil
	})
}

// Get returns a project by ID.
func (store *ProjectStore) Get(ctx context.Context, projectID string) (Project, error) {
	project, err := scanProject(store.database.QueryRowContext(ctx,
		`SELECT `+projectColumns+` FROM projects WHERE id = ?`, projectID))
	if errors.Is(err, sql.ErrNoRows) {
		return Project{}, fmt.Errorf("get project %q: %w", projectID, ErrProjectNotFound)
	}
	if err != nil {
		return Project{}, fmt.Errorf("get project %q: %w", projectID, err)
	}
	return project, nil
}

// ListByOrganization returns the organization's projects in creation order.
func (store *ProjectStore) ListByOrganization(ctx context.Context, organizationID string) ([]Project, error) {
	return store.list(ctx, `SELECT `+projectColumns+` FROM projects
		WHERE organization_id = ? ORDER BY created_at, id`, organizationID)
}

// Update applies update to a project.
func (store *ProjectStore) Update(ctx context.Context, projectID string, update ProjectUpdate) (Project, error) {
	assignments, arguments, err := projectUpdateAssignments(update)
	if err != nil {
		return Project{}, err
	}
	assignments = append(assignments, "updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')")
	arguments = append(arguments, projectID)
	result, err := store.database.ExecContext(ctx, `UPDATE projects SET `+strings.Join(assignments, ", ")+
		` WHERE id = ?`, arguments...)
	if err != nil {
		return Project{}, wrapProjectWriteError("update project", err)
	}
	if err := requireAffected(result, projectID); err != nil {
		return Project{}, err
	}
	return store.Get(ctx, projectID)
}

// Delete removes a project with its primary workspace rows, task-key counter
// and scheduled jobs. Worktree rows are left to their own lifecycle.
func (store *ProjectStore) Delete(ctx context.Context, projectID string) error {
	return store.withTx(ctx, func(tx *sql.Tx) error {
		result, err := tx.ExecContext(ctx, `DELETE FROM projects WHERE id = ?`, projectID)
		if err != nil {
			return fmt.Errorf("delete project: %w", err)
		}
		if err := requireAffected(result, projectID); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM workspaces WHERE project_id = ? AND kind = 'primary'`, projectID); err != nil {
			return fmt.Errorf("delete primary workspaces: %w", err)
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM task_key_counters WHERE scope = ?`, ProjectTaskKeyScope(projectID)); err != nil {
			return fmt.Errorf("delete task key counter: %w", err)
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM scheduled_jobs WHERE project_id = ?`, projectID); err != nil {
			return fmt.Errorf("delete project scheduled jobs: %w", err)
		}
		return nil
	})
}

// PrimaryWorkspace returns the live primary workspace of projectID on nodeID.
func (store *ProjectStore) PrimaryWorkspace(ctx context.Context, projectID string, nodeID string) (Workspace, bool, error) {
	workspace, err := scanWorkspace(store.database.QueryRowContext(ctx, `SELECT `+workspaceColumns+` FROM workspaces
		WHERE project_id = ? AND node_id = ? AND kind = 'primary' AND status IN ('active', 'provisioning')
		ORDER BY created_at, id LIMIT 1`, projectID, nodeID))
	if errors.Is(err, sql.ErrNoRows) {
		return Workspace{}, false, nil
	}
	if err != nil {
		return Workspace{}, false, fmt.Errorf("get primary workspace: %w", err)
	}
	return workspace, true, nil
}

// SetPrimaryWorkspace creates or moves the project's primary workspace row.
func (store *ProjectStore) SetPrimaryWorkspace(ctx context.Context, project Project, primary PrimaryWorkspaceInput) error {
	return store.withTx(ctx, func(tx *sql.Tx) error {
		return upsertPrimaryWorkspace(ctx, tx, project, primary)
	})
}

func (store *ProjectStore) list(ctx context.Context, query string, arguments ...any) ([]Project, error) {
	rows, err := store.database.QueryContext(ctx, query, arguments...)
	if err != nil {
		return nil, fmt.Errorf("list projects: %w", err)
	}
	defer rows.Close()
	projects := make([]Project, 0)
	for rows.Next() {
		project, err := scanProject(rows)
		if err != nil {
			return nil, fmt.Errorf("scan project: %w", err)
		}
		projects = append(projects, project)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate projects: %w", err)
	}
	return projects, nil
}

func (store *ProjectStore) withTx(ctx context.Context, apply func(tx *sql.Tx) error) error {
	tx, err := store.database.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin project transaction: %w", err)
	}
	if err := apply(tx); err != nil {
		_ = tx.Rollback() // preserve the original error
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit project transaction: %w", err)
	}
	return nil
}

func insertProject(ctx context.Context, tx *sql.Tx, project Project, ignoreExisting bool) error {
	commands, err := encodeProjectCommands(project.Commands)
	if err != nil {
		return err
	}
	verb := "INSERT"
	if ignoreExisting {
		verb = "INSERT OR IGNORE"
	}
	_, err = tx.ExecContext(ctx, verb+` INTO projects (`+projectColumns+`)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
			COALESCE(NULLIF(?, ''), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
			COALESCE(NULLIF(?, ''), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))`,
		project.ID, project.OrganizationID, project.Name, defaultString(project.SourceType, "unknown"),
		project.RepoProvider, project.RepoURL, project.RepoKey, defaultString(project.Icon, "folder"),
		defaultString(project.Color, "#1E66F5"), project.SetupScript, project.PostScript, commands,
		project.ContextEnabled, project.TaskPrefix, project.CreatedByUserID, project.CreatedAt, project.UpdatedAt)
	return wrapProjectWriteError("insert project", err)
}

func upsertPrimaryWorkspace(ctx context.Context, tx *sql.Tx, project Project, primary PrimaryWorkspaceInput) error {
	result, err := tx.ExecContext(ctx, `UPDATE workspaces SET local_path = ?, state = 'active', health = NULL,
		updated_at = datetime('now') WHERE project_id = ? AND node_id = ? AND kind = 'primary'
		AND status IN ('active', 'provisioning')`, primary.LocalPath, project.ID, primary.NodeID)
	if err != nil {
		return fmt.Errorf("move primary workspace: %w", err)
	}
	if affected, err := result.RowsAffected(); err == nil && affected > 0 {
		return nil
	}
	return insertPrimaryWorkspaceIfMissing(ctx, tx, project, primary)
}

func insertPrimaryWorkspaceIfMissing(ctx context.Context, tx *sql.Tx, project Project, primary PrimaryWorkspaceInput) error {
	_, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO workspaces
		(id, organization_id, project_id, node_id, kind, status, branch, source_branch, local_path, state, health, name, created_at, updated_at)
		VALUES (?, ?, ?, ?, 'primary', 'active', NULL, NULL, ?, 'active', NULL, NULL, datetime('now'), datetime('now'))`,
		primary.ID, project.OrganizationID, project.ID, primary.NodeID, primary.LocalPath)
	if err != nil {
		return fmt.Errorf("insert primary workspace: %w", err)
	}
	return nil
}

func projectUpdateAssignments(update ProjectUpdate) ([]string, []any, error) {
	assignments := make([]string, 0, 12)
	arguments := make([]any, 0, 12)
	add := func(column string, value any) {
		assignments = append(assignments, column+" = ?")
		arguments = append(arguments, value)
	}
	for _, field := range []struct {
		column string
		value  *string
	}{
		{"name", update.Name}, {"icon", update.Icon}, {"color", update.Color},
		{"setup_script", update.SetupScript}, {"post_script", update.PostScript},
		{"task_prefix", update.TaskPrefix}, {"source_type", update.SourceType},
		{"repo_provider", update.RepoProvider}, {"repo_url", update.RepoURL}, {"repo_key", update.RepoKey},
	} {
		if field.value != nil {
			add(field.column, *field.value)
		}
	}
	if update.ContextEnabled != nil {
		add("context_enabled", *update.ContextEnabled)
	}
	if update.Commands != nil {
		commands, err := encodeProjectCommands(*update.Commands)
		if err != nil {
			return nil, nil, err
		}
		add("commands", commands)
	}
	return assignments, arguments, nil
}

func scanProject(scanner interface{ Scan(...any) error }) (Project, error) {
	var project Project
	var commands string
	err := scanner.Scan(&project.ID, &project.OrganizationID, &project.Name, &project.SourceType,
		&project.RepoProvider, &project.RepoURL, &project.RepoKey, &project.Icon, &project.Color,
		&project.SetupScript, &project.PostScript, &commands, &project.ContextEnabled, &project.TaskPrefix,
		&project.CreatedByUserID, &project.CreatedAt, &project.UpdatedAt)
	if err != nil {
		return Project{}, err
	}
	project.Commands = []ProjectCommand{}
	if strings.TrimSpace(commands) != "" {
		if err := json.Unmarshal([]byte(commands), &project.Commands); err != nil {
			return Project{}, fmt.Errorf("decode project commands: %w", err)
		}
	}
	return project, nil
}

func encodeProjectCommands(commands []ProjectCommand) (string, error) {
	if commands == nil {
		commands = []ProjectCommand{}
	}
	encoded, err := json.Marshal(commands)
	if err != nil {
		return "", fmt.Errorf("encode project commands: %w", err)
	}
	return string(encoded), nil
}

func wrapProjectWriteError(operation string, err error) error {
	if err == nil {
		return nil
	}
	if strings.Contains(err.Error(), "UNIQUE constraint failed: projects.") {
		return fmt.Errorf("%s: %w", operation, ErrProjectConflict)
	}
	return fmt.Errorf("%s: %w", operation, err)
}

func requireAffected(result sql.Result, projectID string) error {
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("read affected project rows: %w", err)
	}
	if affected == 0 {
		return fmt.Errorf("project %q: %w", projectID, ErrProjectNotFound)
	}
	return nil
}

func defaultString(value string, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}
