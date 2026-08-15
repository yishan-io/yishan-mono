package workspace

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/rs/zerolog/log"
	"yishan/apps/cli/internal/git"
	"yishan/apps/cli/internal/terminal"
	"yishan/apps/cli/internal/worktree"
)

type Workspace struct {
	ID              string                `json:"id"`
	Path            string                `json:"path"`
	OrgID           string                `json:"orgId,omitempty"`
	ProjectID       string                `json:"projectId,omitempty"`
	State           State                 `json:"state"`
	Health          Health                `json:"health,omitempty"`
	SetupHookResult *HookResult           `json:"setupHookResult,omitempty"`
	PullRequest     *WorkspacePullRequest `json:"pullRequest,omitempty"`
}

type WorkspacePullRequest struct {
	Number         int                            `json:"number"`
	Title          string                         `json:"title,omitempty"`
	URL            string                         `json:"url,omitempty"`
	Branch         string                         `json:"branch,omitempty"`
	BaseBranch     string                         `json:"baseBranch,omitempty"`
	GitHubState    string                         `json:"githubState,omitempty"`
	Status         string                         `json:"status,omitempty"`
	ReviewDecision string                         `json:"reviewDecision,omitempty"`
	IsDraft        bool                           `json:"isDraft,omitempty"`
	Complete       bool                           `json:"complete,omitempty"`
	UpdatedAt      string                         `json:"updatedAt,omitempty"`
	Checks         []git.GitPullRequestCheck      `json:"checks,omitempty"`
	Deployments    []git.GitPullRequestDeployment `json:"deployments,omitempty"`
}

type Manager struct {
	instances InstanceRegistry
	gits      *git.GitService
	terminals *terminal.Manager
	store     WorkspaceStore
}

func NewManager() *Manager {
	return NewManagerWithRegistry(newMemoryRegistry())
}

// NewManagerWithStore creates a manager with optional durable workspace storage.
func NewManagerWithStore(store WorkspaceStore) *Manager {
	return NewManagerWithRegistryAndStore(newMemoryRegistry(), store)
}

// NewManagerWithRegistry creates a manager backed by the given instance
// registry (the daemon injects the instance-package registry).
func NewManagerWithRegistry(registry InstanceRegistry) *Manager {
	return NewManagerWithRegistryAndStore(registry, nil)
}

// NewManagerWithRegistryAndStore wires both the instance registry and durable
// workspace storage.
func NewManagerWithRegistryAndStore(registry InstanceRegistry, store WorkspaceStore) *Manager {
	return &Manager{
		instances: registry,
		gits:      git.NewGitService(),
		terminals: terminal.NewManager(),
		store:     store,
	}
}

// HydrateFromDB restores locally active workspaces from durable storage.
// A workspace whose worktree is missing or otherwise cannot be opened is
// registered as error instead of aborting the whole hydration, so daemon
// bootstrap never fails because of one broken workspace.
func (m *Manager) HydrateFromDB(ctx context.Context) error {
	if m.store == nil {
		return nil
	}
	workspaces, err := m.store.List(ctx)
	if err != nil {
		return fmt.Errorf("list persisted workspaces: %w", err)
	}
	for _, storedWorkspace := range workspaces {
		if !isLiveWorkspaceStatus(storedWorkspace.Status) {
			continue
		}
		// Folder workspaces are plain local directories that the desktop opens
		// on demand (workspace.openProject). They are not git worktrees, so they
		// must never be auto-opened here at daemon boot.
		if storedWorkspace.Kind == string(KindFolder) {
			continue
		}
		// A provisioning row has no worktree yet (create is in flight, or the
		// daemon stopped mid-create): a missing path is expected then, not an
		// error. Skip it so it is never opened and marked error/path-missing;
		// the create goroutine (or a later recovery pass) owns it.
		if storedWorkspace.Status == string(StatusProvisioning) {
			continue
		}
		if err := m.hydrateWorkspace(storedWorkspace); err != nil {
			log.Warn().Err(err).Str("workspaceId", storedWorkspace.ID).Msg("skipping workspace restore")
			// Any open failure (missing path, path replaced by a file,
			// permissions, ...) leaves the workspace unusable: register it as
			// error so the UI offers close-only and it stays closable.
			m.persistWorkspaceLifecycleState(ctx, storedWorkspace.ID, string(StateError), string(HealthPathMissing))
			m.registerErrorWorkspace(storedWorkspace, HealthPathMissing)
			continue
		}
		if isPersistedNotWorktreeError(storedWorkspace) {
			// Open succeeds for any directory, so a previously-detected
			// not-worktree error must be preserved, not reset to active.
			m.persistWorkspaceLifecycleState(ctx, storedWorkspace.ID, string(StateError), string(HealthNotWorktree))
			m.registerErrorWorkspace(storedWorkspace, HealthNotWorktree)
			continue
		}
		if storedWorkspace.State != string(StateActive) || (storedWorkspace.Health != nil && *storedWorkspace.Health != "") {
			m.persistWorkspaceLifecycleState(ctx, storedWorkspace.ID, string(StateActive), "")
		}
		if err := m.hydrateWorkspacePullRequest(ctx, storedWorkspace.ID); err != nil {
			log.Warn().Err(err).Str("workspaceId", storedWorkspace.ID).Msg("skipping PR hydration for workspace")
		}
	}
	return nil
}

// persistWorkspaceLifecycleState best-effort persists a workspace lifecycle
// state transition. Persistence failures are logged and never fail hydration.
func (m *Manager) persistWorkspaceLifecycleState(ctx context.Context, workspaceID string, state string, health string) {
	if m.store == nil {
		return
	}
	err := m.store.Update(ctx, workspaceID, StoredWorkspaceUpdate{State: &state, Health: &health})
	if err != nil && !errors.Is(err, ErrWorkspaceNotFound) {
		log.Warn().Err(err).Str("workspaceId", workspaceID).Msg("failed to persist workspace lifecycle state")
	}
}

// isPersistedNotWorktreeError reports whether the stored row carries a
// previously-detected not-worktree error that must survive rehydration.
func isPersistedNotWorktreeError(storedWorkspace StoredWorkspace) bool {
	return storedWorkspace.State == string(StateError) &&
		storedWorkspace.Health != nil && *storedWorkspace.Health == string(HealthNotWorktree)
}

// registerErrorWorkspace registers or updates an in-memory workspace as error
// with the given health detail. Used when a persisted workspace cannot be
// opened (missing path) or must stay error (not-worktree).
func (m *Manager) registerErrorWorkspace(storedWorkspace StoredWorkspace, health Health) {
	ws, ok := m.instances.Get(storedWorkspace.ID)
	if !ok {
		ws = Workspace{
			ID:        storedWorkspace.ID,
			Path:      canonicalizeWorkspacePath(storedWorkspace.LocalPath),
			OrgID:     storedWorkspace.OrganizationID,
			ProjectID: storedWorkspace.ProjectID,
		}
	}
	ws.State = StateError
	ws.Health = health
	m.instances.Open(ws)
}

// canonicalizeWorkspacePath resolves a workspace path to its canonical form.
// Abs errors cannot realistically occur and fall back to the cleaned input.
func canonicalizeWorkspacePath(path string) string {
	absolutePath, err := filepath.Abs(path)
	if err != nil {
		return filepath.Clean(path)
	}
	resolvedPath, err := filepath.EvalSymlinks(absolutePath)
	if err == nil {
		return resolvedPath
	}
	return filepath.Clean(absolutePath)
}

func (m *Manager) hydrateWorkspace(storedWorkspace StoredWorkspace) error {
	_, err := m.Open(OpenRequest{ID: storedWorkspace.ID, Path: storedWorkspace.LocalPath,
		OrgID: storedWorkspace.OrganizationID, ProjectID: storedWorkspace.ProjectID})
	if err != nil {
		return fmt.Errorf("restore workspace %q: %w", storedWorkspace.ID, err)
	}
	return nil
}

func (m *Manager) hydrateWorkspacePullRequest(ctx context.Context, workspaceID string) error {
	pullRequests, err := m.store.ListPRsByWorkspace(ctx, workspaceID)
	if err != nil {
		return fmt.Errorf("list persisted pull requests: %w", err)
	}
	for _, persistedPullRequest := range pullRequests {
		if persistedPullRequest.ResolvedAt != nil {
			continue
		}
		pullRequest, err := parsePersistedPullRequest(persistedPullRequest)
		if err != nil {
			return err
		}
		return m.instances.SetPullRequest(workspaceID, pullRequest)
	}
	return nil
}

func parsePersistedPullRequest(persistedPullRequest StoredPullRequest) (*WorkspacePullRequest, error) {
	pullRequest := &WorkspacePullRequest{}
	if persistedPullRequest.Metadata != nil {
		if err := json.Unmarshal([]byte(*persistedPullRequest.Metadata), pullRequest); err != nil {
			return nil, fmt.Errorf("parse persisted pull request metadata: %w", err)
		}
	}
	if pullRequest.Title == "" && persistedPullRequest.Title != nil {
		pullRequest.Title = *persistedPullRequest.Title
	}
	if pullRequest.URL == "" && persistedPullRequest.URL != nil {
		pullRequest.URL = *persistedPullRequest.URL
	}
	return pullRequest, nil
}

func isLiveWorkspaceStatus(status string) bool {
	return status == string(StatusActive) || status == string(StatusProvisioning)
}

type OpenRequest struct {
	ID              string `json:"id"`
	Path            string `json:"path"`
	OrgID           string `json:"orgId,omitempty"`
	ProjectID       string `json:"projectId,omitempty"`
	PRAlreadyMerged bool   `json:"prAlreadyMerged,omitempty"`
}

type RefreshPullRequestRequest struct {
	WorkspaceID string `json:"workspaceId,omitempty"`
	Path        string `json:"path,omitempty"`
}

type CloseRequest struct {
	WorkspaceID   string
	Branch        string
	RemoveBranch  bool
	ForceWorktree bool
	ForceBranch   bool
	PostHook      string
}

type ClosePathRequest struct {
	WorkspaceID   string
	Path          string
	Branch        string
	RemoveBranch  bool
	ForceWorktree bool
	ForceBranch   bool
	PostHook      string
}

func (m *Manager) Open(req OpenRequest) (Workspace, error) {
	if req.ID == "" || req.Path == "" {
		return Workspace{}, NewRPCError(rpcCodeInvalidParams, "id and path are required")
	}

	absPath := canonicalizeWorkspacePath(req.Path)

	info, err := os.Stat(absPath)
	if err != nil {
		return Workspace{}, err
	}
	if !info.IsDir() {
		return Workspace{}, NewRPCError(rpcCodeInvalidParams, "workspace path must be a directory")
	}

	ensureGitExclude(absPath, ContextLinkName)

	// The registry owns the instance map: it preserves runtime fields from any
	// existing instance and replaces any other instance at the same path.
	ws := m.instances.Open(Workspace{
		ID:        req.ID,
		Path:      absPath,
		OrgID:     req.OrgID,
		ProjectID: req.ProjectID,
		State:     StateActive,
	})
	return ws, nil
}

// CloseResult captures the outcome of a workspace close operation, including
// any post-hook execution result.
type CloseResult struct {
	PostHookResult        *HookResult `json:"postHookResult,omitempty"`
	TerminalCleanupErrors []string    `json:"terminalCleanupErrors,omitempty"`
}

func (m *Manager) CloseWorkspace(ctx context.Context, req CloseRequest) (CloseResult, error) {
	ws, err := m.getWorkspace(req.WorkspaceID)
	if err != nil {
		return CloseResult{}, err
	}

	var result CloseResult

	cleanupErrors := m.terminals.StopAllForWorkspace(req.WorkspaceID)
	if len(cleanupErrors) > 0 {
		messages := make([]string, len(cleanupErrors))
		for i, e := range cleanupErrors {
			messages[i] = e.Error()
		}
		result.TerminalCleanupErrors = messages
	}

	result, err = m.CloseWorkspacePath(ctx, ClosePathRequest{
		WorkspaceID:   req.WorkspaceID,
		Path:          ws.Path,
		Branch:        req.Branch,
		RemoveBranch:  req.RemoveBranch,
		ForceWorktree: req.ForceWorktree,
		ForceBranch:   req.ForceBranch,
		PostHook:      req.PostHook,
	})
	if err != nil {
		return result, err
	}

	m.instances.Remove(req.WorkspaceID)

	return result, nil
}

func (m *Manager) CloseWorkspacePath(ctx context.Context, req ClosePathRequest) (CloseResult, error) {
	var result CloseResult

	if info, statErr := os.Stat(req.Path); statErr != nil {
		if os.IsNotExist(statErr) {
			return result, nil
		}
		return result, statErr
	} else if !info.IsDir() {
		// Path exists but is not a directory (e.g. the worktree was replaced
		// by a regular file): nothing to clean up.
		return result, nil
	}

	// Run the post hook before tearing down the workspace so the hook can
	// still access workspace files and git state. Hook failures are
	// non-fatal: the close operation always proceeds.
	hookResult, hookErr := RunHook(ctx, HookRequest{
		Command:       req.PostHook,
		WorkspaceID:   req.WorkspaceID,
		WorkspacePath: req.Path,
		HookName:      "post",
	})
	if hookErr != nil {
		hookResult.Error = fmt.Sprintf("post hook: %v", hookErr)
		result.PostHookResult = &hookResult
	} else if !hookResult.Skipped {
		result.PostHookResult = &hookResult
	}

	// Tear down the worktree and (optionally) its branch via the worktree
	// package: a directory that lost its git registration is treated as
	// already gone (the leftover directory is deliberately not removed).
	if err := worktree.Remove(ctx, worktree.RemoveRequest{
		Path:          req.Path,
		Branch:        req.Branch,
		RemoveBranch:  req.RemoveBranch,
		ForceWorktree: req.ForceWorktree,
		ForceBranch:   req.ForceBranch,
	}); err != nil {
		return result, err
	}

	return result, nil
}

func (m *Manager) getWorkspace(id string) (Workspace, error) {
	ws, ok := m.instances.Get(id)
	if !ok {
		return Workspace{}, NewRPCError(rpcCodeNotFound, "workspace not found")
	}
	return ws, nil
}

// Instances returns the instance registry (single owner of the instance map).
func (m *Manager) Instances() InstanceRegistry {
	return m.instances
}

// Gits exposes the shared git service for handle construction.
func (m *Manager) Gits() *git.GitService {
	return m.gits
}

// PersistWorkspacePullRequest stores a tracker snapshot in local SQLite.
func (m *Manager) PersistWorkspacePullRequest(ctx context.Context, workspaceID string, pullRequest *WorkspacePullRequest) error {
	if m.store == nil || pullRequest == nil {
		return nil
	}
	workspace, ok := m.instances.Get(workspaceID)
	if !ok {
		return NewRPCError(rpcCodeNotFound, "workspace not found")
	}
	metadata, err := json.Marshal(pullRequest)
	if err != nil {
		return fmt.Errorf("marshal workspace pull request: %w", err)
	}
	return m.store.UpsertPR(ctx, &StoredPullRequest{
		WorkspaceID: workspaceID, OrganizationID: workspace.OrgID, PRID: fmt.Sprintf("%d", pullRequest.Number),
		Title: optionalString(pullRequest.Title), URL: optionalString(pullRequest.URL), Branch: optionalString(pullRequest.Branch),
		BaseBranch: optionalString(pullRequest.BaseBranch), State: persistedPullRequestState(pullRequest),
		Metadata: optionalString(string(metadata)), DetectedAt: persistedPullRequestDetectedAt(pullRequest), ResolvedAt: persistedPullRequestResolvedAt(pullRequest),
	})
}

func optionalString(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

func persistedPullRequestState(pullRequest *WorkspacePullRequest) string {
	if pullRequest.Status == "review" || pullRequest.Status == "draft" {
		return "open"
	}
	return pullRequest.Status
}

func persistedPullRequestDetectedAt(pullRequest *WorkspacePullRequest) string {
	if pullRequest.UpdatedAt != "" {
		return pullRequest.UpdatedAt
	}
	return time.Now().UTC().Format(time.RFC3339Nano)
}

func persistedPullRequestResolvedAt(pullRequest *WorkspacePullRequest) *string {
	if pullRequest.Status != "merged" && pullRequest.Status != "closed" {
		return nil
	}
	resolvedAt := time.Now().UTC().Format(time.RFC3339Nano)
	return &resolvedAt
}

// ResolvePersistedWorkspacePullRequest marks a previously observed PR as resolved.
func (m *Manager) ResolvePersistedWorkspacePullRequest(ctx context.Context, workspaceID string, pullRequestNumber int) error {
	if m.store == nil || pullRequestNumber == 0 {
		return nil
	}
	if err := m.store.ResolvePR(ctx, workspaceID, fmt.Sprintf("%d", pullRequestNumber)); err != nil {
		return fmt.Errorf("resolve persisted workspace pull request: %w", err)
	}
	return nil
}

func (m *Manager) GitInspect(ctx context.Context, path string) (git.GitInspectResult, error) {
	return m.gits.Inspect(ctx, path)
}

func (m *Manager) SyncRepoSource(ctx context.Context, repoPath string) error {
	return updateGitRepo(ctx, repoPath)
}

func (m *Manager) Terminals() *terminal.Manager {
	return m.terminals
}
