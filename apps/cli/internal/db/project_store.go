package db

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
)

var ErrProjectNotFound = errors.New("project not found")

const projectColumns = `id, name, source_type, repo_provider, repo_url, repo_key, icon, color,
	setup_script, post_script, commands, context_enabled, organization_id, created_by_user_id,
	created_at, updated_at`

// ProjectStore provides project persistence operations.
type ProjectStore struct {
	database *sql.DB
}

// NewProjectStore creates a project store backed by database.
func NewProjectStore(database *sql.DB) *ProjectStore {
	return &ProjectStore{database: database}
}

// Create inserts project and assigns an ID when one is not supplied.
func (store *ProjectStore) Create(ctx context.Context, project *Project) error {
	if project.ID == "" {
		project.ID = uuid.NewString()
	}
	commandsJSON, err := json.Marshal(project.Commands)
	if err != nil {
		return fmt.Errorf("marshal project commands: %w", err)
	}
	_, err = store.database.ExecContext(ctx, `INSERT INTO projects (`+projectColumns+`)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
		project.ID, project.Name, defaultSourceType(project.SourceType), project.RepoProvider,
		project.RepoURL, project.RepoKey, defaultIcon(project.Icon), defaultColor(project.Color),
		project.SetupScript, project.PostScript, string(commandsJSON), project.ContextEnabled,
		project.OrganizationID, project.CreatedByUserID)
	if err != nil {
		return fmt.Errorf("create project: %w", err)
	}
	return nil
}

// CreateOrBackfillImportedProject writes one remotely-exported project into local storage,
// backfilling only the legacy-missing script and command fields when the project
// already exists locally. A local project that is as new as or newer than the
// remote record is left untouched so the migration never clobbers local edits.
func (store *ProjectStore) CreateOrBackfillImportedProject(ctx context.Context, project *Project) error {
	existingProject, err := store.Get(ctx, project.ID)
	if errors.Is(err, ErrProjectNotFound) {
		return store.Create(ctx, project)
	}
	if err != nil {
		return fmt.Errorf("get imported project %q: %w", project.ID, err)
	}
	importedUpdatedAt := parseProjectUpdatedAt(project.UpdatedAt)
	if importedUpdatedAt.IsZero() {
		if project.UpdatedAt != "" {
			log.Warn().Str("projectId", project.ID).Str("updatedAt", project.UpdatedAt).Msg("cannot parse imported project updatedAt; skipping backfill")
		}
		return nil
	}
	if !parseProjectUpdatedAt(existingProject.UpdatedAt).Before(importedUpdatedAt) {
		if backfillWouldApply(buildImportedProjectConfigBackfillUpdate(existingProject, *project)) {
			log.Warn().Str("projectId", project.ID).Msg("skipping project backfill: local record is as new as or newer than the remote export")
		}
		return nil
	}
	return store.Update(ctx, project.ID, buildImportedProjectConfigBackfillUpdate(existingProject, *project))
}

// ListByOrg returns projects in name order for organizationID.
func (store *ProjectStore) ListByOrg(ctx context.Context, organizationID string) ([]Project, error) {
	rows, err := store.database.QueryContext(ctx, `SELECT `+projectColumns+`
		FROM projects WHERE organization_id = ? ORDER BY name, id`, organizationID)
	if err != nil {
		return nil, fmt.Errorf("list projects: %w", err)
	}
	defer rows.Close()
	return scanProjects(rows)
}

// Get returns a project by ID.
func (store *ProjectStore) Get(ctx context.Context, projectID string) (Project, error) {
	row := store.database.QueryRowContext(ctx, `SELECT `+projectColumns+` FROM projects WHERE id = ?`, projectID)
	project, err := scanProject(row)
	if errors.Is(err, sql.ErrNoRows) {
		return Project{}, fmt.Errorf("get project %q: %w", projectID, ErrProjectNotFound)
	}
	if err != nil {
		return Project{}, fmt.Errorf("get project %q: %w", projectID, err)
	}
	return project, nil
}

// Update applies the supplied mutable fields to a project.
func (store *ProjectStore) Update(ctx context.Context, projectID string, update ProjectUpdate) error {
	query, arguments, err := buildProjectUpdate(update)
	if err != nil {
		return err
	}
	if query == "" {
		return nil
	}
	arguments = append(arguments, projectID)
	result, err := store.database.ExecContext(ctx, query, arguments...)
	if err != nil {
		return fmt.Errorf("update project %q: %w", projectID, err)
	}
	return requireProjectUpdated(projectID, result)
}

// Delete removes a project and its dependent local workspaces.
func (store *ProjectStore) Delete(ctx context.Context, projectID string) error {
	result, err := store.database.ExecContext(ctx, `DELETE FROM projects WHERE id = ?`, projectID)
	if err != nil {
		return fmt.Errorf("delete project %q: %w", projectID, err)
	}
	return requireProjectUpdated(projectID, result)
}

func scanProjects(rows *sql.Rows) ([]Project, error) {
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

func scanProject(scanner interface{ Scan(...any) error }) (Project, error) {
	var project Project
	var commandsJSON string
	var contextEnabled int
	err := scanner.Scan(&project.ID, &project.Name, &project.SourceType, &project.RepoProvider,
		&project.RepoURL, &project.RepoKey, &project.Icon, &project.Color, &project.SetupScript,
		&project.PostScript, &commandsJSON, &contextEnabled, &project.OrganizationID,
		&project.CreatedByUserID, &project.CreatedAt, &project.UpdatedAt)
	if err != nil {
		return Project{}, err
	}
	if err := json.Unmarshal([]byte(commandsJSON), &project.Commands); err != nil {
		return Project{}, fmt.Errorf("parse project commands: %w", err)
	}
	project.ContextEnabled = contextEnabled != 0
	return project, nil
}

func buildImportedProjectConfigBackfillUpdate(existingProject Project, importedProject Project) ProjectUpdate {
	update := ProjectUpdate{}
	if existingProject.SetupScript == "" && importedProject.SetupScript != "" {
		setupScript := importedProject.SetupScript
		update.SetupScript = &setupScript
	}
	if existingProject.PostScript == "" && importedProject.PostScript != "" {
		postScript := importedProject.PostScript
		update.PostScript = &postScript
	}
	if len(existingProject.Commands) == 0 && len(importedProject.Commands) > 0 {
		commands := importedProject.Commands
		update.Commands = &commands
	}
	// One-way context repair: legacy-imported rows were written with context
	// disabled because the legacy migration never mapped ContextEnabled.
	// Only restore when the local value is false and the export says enabled:
	// an explicit local true (a deliberate user toggle) is never overwritten,
	// and by design a local false is indistinguishable from the legacy bug, so
	// it is re-enabled when the remote project says enabled.
	if !existingProject.ContextEnabled && importedProject.ContextEnabled {
		contextEnabled := true
		update.ContextEnabled = &contextEnabled
	}
	return update
}

func buildProjectUpdate(update ProjectUpdate) (string, []any, error) {
	assignments := make([]string, 0, 7)
	arguments := make([]any, 0, 8)
	if update.Name != nil {
		assignments = append(assignments, "name = ?")
		arguments = append(arguments, *update.Name)
	}
	if update.Icon != nil {
		assignments = append(assignments, "icon = ?")
		arguments = append(arguments, *update.Icon)
	}
	if update.Color != nil {
		assignments = append(assignments, "color = ?")
		arguments = append(arguments, *update.Color)
	}
	if update.SetupScript != nil {
		assignments = append(assignments, "setup_script = ?")
		arguments = append(arguments, *update.SetupScript)
	}
	if update.PostScript != nil {
		assignments = append(assignments, "post_script = ?")
		arguments = append(arguments, *update.PostScript)
	}
	return finishProjectUpdate(assignments, arguments, update)
}

func finishProjectUpdate(assignments []string, arguments []any, update ProjectUpdate) (string, []any, error) {
	if update.Commands != nil {
		commandsJSON, err := json.Marshal(*update.Commands)
		if err != nil {
			return "", nil, fmt.Errorf("marshal project command update: %w", err)
		}
		assignments = append(assignments, "commands = ?")
		arguments = append(arguments, string(commandsJSON))
	}
	if update.ContextEnabled != nil {
		assignments = append(assignments, "context_enabled = ?")
		arguments = append(arguments, *update.ContextEnabled)
	}
	if len(assignments) == 0 {
		return "", nil, nil
	}
	query := `UPDATE projects SET ` + strings.Join(assignments, ", ") + `, updated_at = datetime('now') WHERE id = ?`
	return query, arguments, nil
}

func requireProjectUpdated(projectID string, result sql.Result) error {
	affectedRows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("read affected project rows: %w", err)
	}
	if affectedRows == 0 {
		return fmt.Errorf("project %q: %w", projectID, ErrProjectNotFound)
	}
	return nil
}

// backfillWouldApply reports whether the computed backfill update would change
// anything, used to make a guard skip observable.
func backfillWouldApply(update ProjectUpdate) bool {
	return update.SetupScript != nil || update.PostScript != nil || update.Commands != nil || update.ContextEnabled != nil
}

func defaultSourceType(sourceType string) string {
	if sourceType == "" {
		return "unknown"
	}
	return sourceType
}

func defaultIcon(icon string) string {
	if icon == "" {
		return "folder"
	}
	return icon
}

func defaultColor(color string) string {
	if color == "" {
		return "#1E66F5"
	}
	return color
}

// parseProjectUpdatedAt parses either an RFC3339 remote timestamp or a local
// SQLite datetime('now') value into a comparable time. Unparseable values
// yield the zero time.
func parseProjectUpdatedAt(value string) time.Time {
	for _, layout := range []string{time.RFC3339Nano, time.RFC3339, "2006-01-02 15:04:05"} {
		if t, err := time.Parse(layout, value); err == nil {
			return t
		}
	}
	return time.Time{}
}
