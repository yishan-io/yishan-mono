package workspace

import (
	"context"
	"os"
	"path/filepath"
	"strings"

	localdb "yishan/apps/cli/internal/adapter/sqlite"
	internalevents "yishan/apps/cli/internal/events"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/instance"

	"github.com/rs/zerolog/log"
)

// CheckWorkspaceHealth marks active workspaces whose worktree path has
// disappeared as error (path-missing) so they become close-only in the UI.
// Only the missing-path condition is monitored here; not-worktree detection
// stays on demand (workspace.health) to avoid false positives for
// git-local/primary workspaces that are plain directories.
func (s *Service) CheckHealth(ctx context.Context) {
	for _, ws := range s.deps.Registry.List() {
		if instance.State(ws.State) != instance.StateActive {
			continue
		}
		if _, statErr := os.Stat(ws.Path); statErr == nil {
			continue
		}
		if _, _, _, refreshErr := s.RefreshHealth(ctx, ws.ID); refreshErr != nil {
			log.Warn().Err(refreshErr).Str("workspaceId", ws.ID).Msg("workspace health check failed")
		}
	}
}

// RefreshWorkspaceHealth re-checks a workspace's path/worktree health,
// transitions its state (active → error), persists the change, and emits a
// workspace state changed event. Returns the resolved state, health detail,
// and any health-check error message.
func (s *Service) RefreshHealth(ctx context.Context, workspaceID string) (string, string, string, error) {
	ws, ok := s.deps.Registry.Get(workspaceID)
	if !ok {
		return "", "", "", rpc.NewRPCError(rpc.CodeNotFound, "workspace not found")
	}

	state := instance.StateActive
	health := instance.HealthOK
	healthErr := ""

	if _, statErr := os.Stat(ws.Path); statErr != nil {
		state = instance.StateError
		health = instance.HealthPathMissing
		healthErr = statErr.Error()
	}

	// Folder workspaces are plain directories, never git worktrees; skip the
	// git-worktree check so an open folder is never marked not-worktree/error.
	// Path-missing detection above still applies.
	if !s.IsFolder(ctx, workspaceID) && healthErr == "" {
		isWorktree, checkErr := isGitWorktree(ws.Path)
		if checkErr != nil {
			state = instance.StateError
			health = instance.HealthPathMissing
			healthErr = checkErr.Error()
		} else if !isWorktree {
			state = instance.StateError
			health = instance.HealthNotWorktree
		}
	}

	if err := s.deps.Registry.SetState(workspaceID, state, health); err != nil {
		return "", "", "", err
	}

	if state == instance.StateError {
		s.deps.Watchers.Unwatch(ws.Path)
		s.deps.PRTracker.StopTracking(workspaceID)
	} else if instance.State(ws.State) == instance.StateError {
		// Recovery from error back to active: re-register the filesystem watcher
		// that was removed on the error transition, so file-change events (which
		// drive the Git Changes tab) resume without a daemon restart.
		s.WatchAndTrack(workspaceID, ws.Path)
	}

	if err := s.UpdateState(ctx, workspaceID, string(state), string(health)); err != nil {
		return "", "", "", err
	}

	s.emitStateChanged(workspaceID, string(state), string(health), false)

	return string(state), string(health), healthErr, nil
}

func (s *Service) emitStateChanged(workspaceID string, state string, health string, removed bool) {
	if s.deps.Events == nil {
		return
	}
	s.deps.Events.Publish(internalevents.Event{
		Topic: "workspaceStateChanged",
		Payload: map[string]any{
			"workspaceId": workspaceID,
			"state":       state,
			"health":      health,
			"removed":     removed,
		},
	})
}

func isGitWorktree(path string) (bool, error) {
	gitDir := filepath.Join(path, ".git")
	info, err := os.Stat(gitDir)
	if err != nil {
		return false, err
	}
	if info.IsDir() {
		return true, nil
	}
	return false, nil
}

// IsFolderWorkspace reports whether the persisted workspace row for workspaceID
// is a local folder (kind 'folder'). The in-memory manager does not carry the
// kind, so the durable store is the source of truth. Returns false when the row
// cannot be resolved (no local DB, unknown id) so git workspaces keep current
// health behavior.
func (s *Service) IsFolder(ctx context.Context, workspaceID string) bool {
	if s.deps.Database == nil || strings.TrimSpace(workspaceID) == "" {
		return false
	}
	row, err := localdb.NewWorkspaceStore(s.deps.Database).Get(ctx, workspaceID)
	if err != nil {
		return false
	}
	return row.Kind == string(workspace.KindFolder)
}
