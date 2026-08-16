package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
)

var ErrWorkspaceNotFound = errors.New("workspace not found")

const workspaceColumns = `id, organization_id, project_id, node_id, kind, status, branch,
	source_branch, local_path, state, health, name, created_at, updated_at`
const workspacePullRequestColumns = `id, workspace_id, organization_id, pr_id, title, url,
	branch, base_branch, state, metadata, detected_at, resolved_at, created_at, updated_at`

// WorkspaceStore provides workspace and workspace pull-request persistence.
type WorkspaceStore struct {
	database *sql.DB
}

// NewWorkspaceStore creates a workspace store backed by database.
func NewWorkspaceStore(database *sql.DB) *WorkspaceStore {
	return &WorkspaceStore{database: database}
}

// Create inserts workspace and assigns an ID when one is not supplied.
func (store *WorkspaceStore) Create(ctx context.Context, workspace *Workspace) error {
	if workspace.ID == "" {
		workspace.ID = uuid.NewString()
	}
	_, err := store.database.ExecContext(ctx, `INSERT INTO workspaces (`+workspaceColumns+`)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
		workspace.ID, workspace.OrganizationID, workspace.ProjectID, workspace.NodeID,
		defaultWorkspaceKind(workspace.Kind), defaultWorkspaceStatus(workspace.Status), workspace.Branch,
		workspace.SourceBranch, workspace.LocalPath, defaultWorkspaceState(workspace.State), workspace.Health,
		workspace.Name)
	if err != nil {
		return fmt.Errorf("create workspace: %w", err)
	}
	return nil
}

// CreateFolder inserts a local-only folder workspace with NULL project_id and
// organization_id. It never exists remotely and is keyed purely by its local
// path and daemon node.
func (store *WorkspaceStore) CreateFolder(ctx context.Context, input FolderWorkspaceInput) (Workspace, error) {
	id := input.ID
	if id == "" {
		id = uuid.NewString()
	}
	var name any
	if trimmedName := strings.TrimSpace(input.Name); trimmedName != "" {
		name = trimmedName
	}
	_, err := store.database.ExecContext(ctx, `INSERT INTO workspaces
		(id, organization_id, project_id, node_id, kind, status, branch, source_branch, local_path, state, health, name, created_at, updated_at)
		VALUES (?, NULL, NULL, ?, 'folder', 'active', NULL, NULL, ?, 'active', NULL, ?, datetime('now'), datetime('now'))`,
		id, input.NodeID, input.LocalPath, name)
	if err != nil {
		return Workspace{}, fmt.Errorf("create folder workspace: %w", err)
	}
	var createdName *string
	if trimmedName := strings.TrimSpace(input.Name); trimmedName != "" {
		createdName = stringPointer(trimmedName)
	}
	return Workspace{
		ID: id, OrganizationID: "", ProjectID: "", NodeID: input.NodeID, Kind: "folder",
		Status: "active", LocalPath: input.LocalPath, State: "active", Name: createdName,
	}, nil
}

// ListFolders returns all local-only folder workspaces in creation order.
func (store *WorkspaceStore) ListFolders(ctx context.Context) ([]Workspace, error) {
	return store.list(ctx, `SELECT `+workspaceColumns+` FROM workspaces
		WHERE project_id IS NULL AND kind = 'folder' ORDER BY created_at, id`)
}

// List returns all local workspaces in creation order.
func (store *WorkspaceStore) List(ctx context.Context) ([]Workspace, error) {
	return store.list(ctx, `SELECT `+workspaceColumns+` FROM workspaces ORDER BY created_at, id`)
}

// ListLiveByProject returns local workspaces for projectID with live statuses.
func (store *WorkspaceStore) ListLiveByProject(ctx context.Context, projectID string) ([]Workspace, error) {
	return store.list(ctx, `SELECT `+workspaceColumns+` FROM workspaces WHERE project_id = ? AND status IN ('active', 'provisioning') ORDER BY created_at, id`, projectID)
}

// ListByProject returns local workspaces for projectID.
func (store *WorkspaceStore) ListByProject(ctx context.Context, projectID string) ([]Workspace, error) {
	return store.list(ctx, `SELECT `+workspaceColumns+` FROM workspaces WHERE project_id = ? ORDER BY created_at, id`, projectID)
}

// ListByOrg returns local workspaces for organizationID.
func (store *WorkspaceStore) ListByOrg(ctx context.Context, organizationID string) ([]Workspace, error) {
	return store.list(ctx, `SELECT `+workspaceColumns+` FROM workspaces WHERE organization_id = ? ORDER BY created_at, id`, organizationID)
}

// Get returns a workspace by ID.
func (store *WorkspaceStore) Get(ctx context.Context, workspaceID string) (Workspace, error) {
	workspace, err := scanWorkspace(store.database.QueryRowContext(ctx,
		`SELECT `+workspaceColumns+` FROM workspaces WHERE id = ?`, workspaceID))
	return handleWorkspaceGet(workspaceID, workspace, err)
}

// GetByPath returns a workspace by its local filesystem path.
func (store *WorkspaceStore) GetByPath(ctx context.Context, localPath string) (Workspace, error) {
	workspace, err := scanWorkspace(store.database.QueryRowContext(ctx,
		`SELECT `+workspaceColumns+` FROM workspaces WHERE local_path = ?`, localPath))
	return handleWorkspaceGet(localPath, workspace, err)
}

// Update applies supplied mutable fields to a workspace.
func (store *WorkspaceStore) Update(ctx context.Context, workspaceID string, update WorkspaceUpdate) error {
	query, arguments := buildWorkspaceUpdate(update)
	if query == "" {
		return nil
	}
	arguments = append(arguments, workspaceID)
	result, err := store.database.ExecContext(ctx, query, arguments...)
	if err != nil {
		return fmt.Errorf("update workspace %q: %w", workspaceID, err)
	}
	return requireWorkspaceUpdated(workspaceID, result)
}

// Delete removes a local workspace and its persisted pull requests.
func (store *WorkspaceStore) Delete(ctx context.Context, workspaceID string) error {
	result, err := store.database.ExecContext(ctx, `DELETE FROM workspaces WHERE id = ?`, workspaceID)
	if err != nil {
		return fmt.Errorf("delete workspace %q: %w", workspaceID, err)
	}
	return requireWorkspaceUpdated(workspaceID, result)
}

// UpsertPR creates or refreshes a pull request observed for a workspace.
func (store *WorkspaceStore) UpsertPR(ctx context.Context, pullRequest *WorkspacePullRequest) error {
	if pullRequest.ID == "" {
		pullRequest.ID = uuid.NewString()
	}
	_, err := store.database.ExecContext(ctx, `INSERT INTO workspace_pull_requests (`+workspacePullRequestColumns+`)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
		ON CONFLICT(workspace_id, pr_id) DO UPDATE SET title = excluded.title, url = excluded.url,
		branch = excluded.branch, base_branch = excluded.base_branch, state = excluded.state,
		metadata = excluded.metadata, detected_at = excluded.detected_at, resolved_at = excluded.resolved_at,
		updated_at = datetime('now')`, pullRequest.ID, pullRequest.WorkspaceID, pullRequest.OrganizationID,
		pullRequest.PRID, pullRequest.Title, pullRequest.URL, pullRequest.Branch, pullRequest.BaseBranch,
		pullRequest.State, pullRequest.Metadata, pullRequest.DetectedAt, pullRequest.ResolvedAt)
	if err != nil {
		return fmt.Errorf("upsert workspace pull request: %w", err)
	}
	return nil
}

// ListPRsByWorkspace returns persisted pull requests for workspaceID.
func (store *WorkspaceStore) ListPRsByWorkspace(ctx context.Context, workspaceID string) ([]WorkspacePullRequest, error) {
	rows, err := store.database.QueryContext(ctx, `SELECT `+workspacePullRequestColumns+`
		FROM workspace_pull_requests WHERE workspace_id = ? ORDER BY detected_at DESC, id`, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("list workspace pull requests: %w", err)
	}
	defer rows.Close()
	return scanWorkspacePullRequests(rows)
}

// ResolvePR records that a pull request is no longer active.
func (store *WorkspaceStore) ResolvePR(ctx context.Context, workspaceID string, pullRequestID string) error {
	result, err := store.database.ExecContext(ctx, `UPDATE workspace_pull_requests
		SET resolved_at = datetime('now'), updated_at = datetime('now') WHERE workspace_id = ? AND pr_id = ?`,
		workspaceID, pullRequestID)
	if err != nil {
		return fmt.Errorf("resolve workspace pull request: %w", err)
	}
	return requirePullRequestUpdated(workspaceID, pullRequestID, result)
}

func (store *WorkspaceStore) list(ctx context.Context, query string, arguments ...any) ([]Workspace, error) {
	rows, err := store.database.QueryContext(ctx, query, arguments...)
	if err != nil {
		return nil, fmt.Errorf("list workspaces: %w", err)
	}
	defer rows.Close()
	return scanWorkspaces(rows)
}

func scanWorkspaces(rows *sql.Rows) ([]Workspace, error) {
	workspaces := make([]Workspace, 0)
	for rows.Next() {
		workspace, err := scanWorkspace(rows)
		if err != nil {
			return nil, fmt.Errorf("scan workspace: %w", err)
		}
		workspaces = append(workspaces, workspace)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate workspaces: %w", err)
	}
	return workspaces, nil
}

func scanWorkspace(scanner interface{ Scan(...any) error }) (Workspace, error) {
	var workspace Workspace
	var organizationID, projectID, name sql.NullString
	err := scanner.Scan(&workspace.ID, &organizationID, &projectID, &workspace.NodeID,
		&workspace.Kind, &workspace.Status, &workspace.Branch, &workspace.SourceBranch, &workspace.LocalPath,
		&workspace.State, &workspace.Health, &name, &workspace.CreatedAt, &workspace.UpdatedAt)
	if err != nil {
		return Workspace{}, err
	}
	workspace.OrganizationID = organizationID.String
	workspace.ProjectID = projectID.String
	if name.Valid {
		workspace.Name = stringPointer(name.String)
	}
	return workspace, nil
}

func handleWorkspaceGet(identifier string, workspace Workspace, err error) (Workspace, error) {
	if errors.Is(err, sql.ErrNoRows) {
		return Workspace{}, fmt.Errorf("get workspace %q: %w", identifier, ErrWorkspaceNotFound)
	}
	if err != nil {
		return Workspace{}, fmt.Errorf("get workspace %q: %w", identifier, err)
	}
	return workspace, nil
}

func buildWorkspaceUpdate(update WorkspaceUpdate) (string, []any) {
	assignments := make([]string, 0, 5)
	arguments := make([]any, 0, 5)
	if update.Status != nil {
		assignments = append(assignments, "status = ?")
		arguments = append(arguments, *update.Status)
	}
	if update.State != nil {
		assignments = append(assignments, "state = ?")
		arguments = append(arguments, *update.State)
	}
	if update.Health != nil {
		assignments = append(assignments, "health = ?")
		arguments = append(arguments, *update.Health)
	}
	if update.LocalPath != nil {
		assignments = append(assignments, "local_path = ?")
		arguments = append(arguments, *update.LocalPath)
	}
	if update.Branch != nil {
		assignments = append(assignments, "branch = ?")
		arguments = append(arguments, *update.Branch)
	}
	if len(assignments) == 0 {
		return "", nil
	}
	return `UPDATE workspaces SET ` + strings.Join(assignments, ", ") + `, updated_at = datetime('now') WHERE id = ?`, arguments
}

func requireWorkspaceUpdated(workspaceID string, result sql.Result) error {
	updated, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("read affected workspace rows: %w", err)
	}
	if updated == 0 {
		return fmt.Errorf("workspace %q: %w", workspaceID, ErrWorkspaceNotFound)
	}
	return nil
}

func scanWorkspacePullRequests(rows *sql.Rows) ([]WorkspacePullRequest, error) {
	pullRequests := make([]WorkspacePullRequest, 0)
	for rows.Next() {
		pullRequest, err := scanWorkspacePullRequest(rows)
		if err != nil {
			return nil, fmt.Errorf("scan workspace pull request: %w", err)
		}
		pullRequests = append(pullRequests, pullRequest)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate workspace pull requests: %w", err)
	}
	return pullRequests, nil
}

func scanWorkspacePullRequest(scanner interface{ Scan(...any) error }) (WorkspacePullRequest, error) {
	var pullRequest WorkspacePullRequest
	err := scanner.Scan(&pullRequest.ID, &pullRequest.WorkspaceID, &pullRequest.OrganizationID,
		&pullRequest.PRID, &pullRequest.Title, &pullRequest.URL, &pullRequest.Branch,
		&pullRequest.BaseBranch, &pullRequest.State, &pullRequest.Metadata, &pullRequest.DetectedAt,
		&pullRequest.ResolvedAt, &pullRequest.CreatedAt, &pullRequest.UpdatedAt)
	if err != nil {
		return WorkspacePullRequest{}, err
	}
	return pullRequest, nil
}

func requirePullRequestUpdated(workspaceID string, pullRequestID string, result sql.Result) error {
	updated, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("read affected pull request rows: %w", err)
	}
	if updated == 0 {
		return fmt.Errorf("pull request %q for workspace %q not found", pullRequestID, workspaceID)
	}
	return nil
}

func defaultWorkspaceKind(kind string) string {
	if kind == "" {
		return "primary"
	}
	return kind
}
func defaultWorkspaceStatus(status string) string {
	if status == "" {
		return "active"
	}
	return status
}
func defaultWorkspaceState(state string) string {
	if state == "" {
		return "active"
	}
	return state
}
