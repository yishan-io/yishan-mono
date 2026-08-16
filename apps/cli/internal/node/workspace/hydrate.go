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
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/instance"
)

// HydrateFromDB restores locally active workspaces from durable storage.
// A workspace whose worktree is missing or otherwise cannot be opened is
// registered as error instead of aborting the whole hydration, so daemon
// bootstrap never fails because of one broken workspace.
func (s *Service) Hydrate(ctx context.Context) error {
	if s.deps.Store == nil {
		return nil
	}
	workspaces, err := s.deps.Store.List(ctx)
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
		if storedWorkspace.Kind == string(workspace.KindFolder) {
			continue
		}
		// A provisioning row has no worktree yet (create is in flight, or the
		// daemon stopped mid-create): a missing path is expected then, not an
		// error. Skip it so it is never opened and marked error/path-missing;
		// the create goroutine (or a later recovery pass) owns it.
		if storedWorkspace.Status == string(workspace.StatusProvisioning) {
			continue
		}
		if err := s.hydrate(storedWorkspace); err != nil {
			log.Warn().Err(err).Str("workspaceId", storedWorkspace.ID).Msg("skipping workspace restore")
			// Any open failure (missing path, path replaced by a file,
			// permissions, ...) leaves the workspace unusable: register it as
			// error so the UI offers close-only and it stays closable.
			s.persistState(ctx, storedWorkspace.ID, string(workspace.StateError), string(workspace.HealthPathMissing))
			s.registerErrorWorkspace(storedWorkspace, workspace.HealthPathMissing)
			continue
		}
		if isPersistedNotWorktreeError(storedWorkspace) {
			// Open succeeds for any directory, so a previously-detected
			// not-worktree error must be preserved, not reset to active.
			s.persistState(ctx, storedWorkspace.ID, string(workspace.StateError), string(workspace.HealthNotWorktree))
			s.registerErrorWorkspace(storedWorkspace, workspace.HealthNotWorktree)
			continue
		}
		if storedWorkspace.State != string(workspace.StateActive) || (storedWorkspace.Health != nil && *storedWorkspace.Health != "") {
			s.persistState(ctx, storedWorkspace.ID, string(workspace.StateActive), "")
		}
		if err := s.hydratePullRequest(ctx, storedWorkspace.ID); err != nil {
			log.Warn().Err(err).Str("workspaceId", storedWorkspace.ID).Msg("skipping PR hydration for workspace")
		}
	}
	return nil
}

// persistWorkspaceLifecycleState best-effort persists a workspace lifecycle
// state transition. Persistence failures are logged and never fail hydration.
func (s *Service) persistState(ctx context.Context, workspaceID string, state string, health string) {
	if s.deps.Store == nil {
		return
	}
	err := s.deps.Store.Update(ctx, workspaceID, workspace.StoredWorkspaceUpdate{State: &state, Health: &health})
	if err != nil && !errors.Is(err, workspace.ErrWorkspaceNotFound) {
		log.Warn().Err(err).Str("workspaceId", workspaceID).Msg("failed to persist workspace lifecycle state")
	}
}

// isPersistedNotWorktreeError reports whether the stored row carries a
// previously-detected not-worktree error that must survive rehydration.
func isPersistedNotWorktreeError(storedWorkspace workspace.StoredWorkspace) bool {
	return storedWorkspace.State == string(workspace.StateError) &&
		storedWorkspace.Health != nil && *storedWorkspace.Health == string(workspace.HealthNotWorktree)
}

// registerErrorWorkspace registers or updates an in-memory workspace as error
// with the given health detail. Used when a persisted workspace cannot be
// opened (missing path) or must stay error (not-worktree).
func (s *Service) registerErrorWorkspace(storedWorkspace workspace.StoredWorkspace, health workspace.Health) {
	ws, ok := s.deps.Registry.Get(storedWorkspace.ID)
	if !ok {
		ws = workspace.Workspace{
			ID:        storedWorkspace.ID,
			Path:      canonicalizeWorkspacePath(storedWorkspace.LocalPath),
			OrgID:     storedWorkspace.OrganizationID,
			ProjectID: storedWorkspace.ProjectID,
		}
	}
	ws.State = workspace.StateError
	ws.Health = health
	s.deps.Registry.Open(ws)
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

func (s *Service) hydrate(storedWorkspace workspace.StoredWorkspace) error {
	_, err := s.Open(workspace.OpenRequest{ID: storedWorkspace.ID, Path: storedWorkspace.LocalPath,
		OrgID: storedWorkspace.OrganizationID, ProjectID: storedWorkspace.ProjectID})
	if err != nil {
		return fmt.Errorf("restore workspace %q: %w", storedWorkspace.ID, err)
	}
	return nil
}

func (s *Service) hydratePullRequest(ctx context.Context, workspaceID string) error {
	pullRequests, err := s.deps.Store.ListPRsByWorkspace(ctx, workspaceID)
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
		return s.deps.Registry.SetPullRequest(workspaceID, pullRequest)
	}
	return nil
}

func parsePersistedPullRequest(persistedPullRequest workspace.StoredPullRequest) (*workspace.WorkspacePullRequest, error) {
	pullRequest := &workspace.WorkspacePullRequest{}
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
	return status == string(workspace.StatusActive) || status == string(workspace.StatusProvisioning)
}

// OpenWorkspace opens an instance in the registry: it canonicalizes the path,
// validates it is a directory, ensures the context-link git exclude, and lets
// the registry preserve runtime fields and replace same-path instances.
func (s *Service) Open(req workspace.OpenRequest) (workspace.Workspace, error) {
	if req.ID == "" || req.Path == "" {
		return workspace.Workspace{}, rpc.NewRPCError(rpc.CodeInvalidParams, "id and path are required")
	}

	absPath := canonicalizeWorkspacePath(req.Path)

	info, err := os.Stat(absPath)
	if err != nil {
		return workspace.Workspace{}, err
	}
	if !info.IsDir() {
		return workspace.Workspace{}, rpc.NewRPCError(rpc.CodeInvalidParams, "workspace path must be a directory")
	}

	workspace.EnsureGitExclude(absPath, workspace.ContextLinkName)

	return s.deps.Registry.Open(workspace.Workspace{
		ID:        req.ID,
		Path:      absPath,
		OrgID:     req.OrgID,
		ProjectID: req.ProjectID,
		State:     workspace.StateActive,
	}), nil
}

// ---- PR persistence (moved from the workspace.Manager facade) ----

func PROrgID(registry *instance.Registry, workspaceID string) string {
	if ws, ok := registry.Get(workspaceID); ok {
		return ws.OrgID
	}
	return ""
}

func MarshalPRMetadata(pullRequest *workspace.WorkspacePullRequest) string {
	metadata, err := json.Marshal(pullRequest)
	if err != nil {
		return ""
	}
	return string(metadata)
}

func OptionalString(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

func PRState(pullRequest *workspace.WorkspacePullRequest) string {
	if pullRequest.Status == "review" || pullRequest.Status == "draft" {
		return "open"
	}
	return pullRequest.Status
}

func PRDetectedAt(pullRequest *workspace.WorkspacePullRequest) string {
	if pullRequest.UpdatedAt != "" {
		return pullRequest.UpdatedAt
	}
	return time.Now().UTC().Format(time.RFC3339Nano)
}

func PRResolvedAt(pullRequest *workspace.WorkspacePullRequest) *string {
	if pullRequest.Status != "merged" && pullRequest.Status != "closed" {
		return nil
	}
	resolvedAt := time.Now().UTC().Format(time.RFC3339Nano)
	return &resolvedAt
}
