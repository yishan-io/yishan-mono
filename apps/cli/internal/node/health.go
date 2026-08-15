package node

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"time"

	localdb "yishan/apps/cli/internal/db"
	internalevents "yishan/apps/cli/internal/events"
	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/instance"

	"github.com/rs/zerolog/log"
)

const healthCheckInterval = 15 * time.Second

// StartHealthMonitor periodically re-checks active workspaces whose worktree
// path disappears while the daemon is running, so the UI can show the error
// state and offer close-only without requiring a daemon restart.
func (a *App) StartHealthMonitor() {
	go func() {
		ticker := time.NewTicker(healthCheckInterval)
		defer ticker.Stop()
		for {
			select {
			case <-a.cleanupCtx.Done():
				return
			case <-ticker.C:
				a.CheckWorkspaceHealth(a.cleanupCtx)
			}
		}
	}()
}

// CheckWorkspaceHealth marks active workspaces whose worktree path has
// disappeared as error (path-missing) so they become close-only in the UI.
// Only the missing-path condition is monitored here; not-worktree detection
// stays on demand (workspace.health) to avoid false positives for
// git-local/primary workspaces that are plain directories.
func (a *App) CheckWorkspaceHealth(ctx context.Context) {
	for _, ws := range a.Manager.Instances().List() {
		if instance.State(ws.State) != instance.StateActive {
			continue
		}
		if _, statErr := os.Stat(ws.Path); statErr == nil {
			continue
		}
		if _, _, _, refreshErr := a.RefreshWorkspaceHealth(ctx, ws.ID); refreshErr != nil {
			log.Warn().Err(refreshErr).Str("workspaceId", ws.ID).Msg("workspace health check failed")
		}
	}
}

// RefreshWorkspaceHealth re-checks a workspace's path/worktree health,
// transitions its state (active → error), persists the change, and emits a
// workspace state changed event. Returns the resolved state, health detail,
// and any health-check error message.
func (a *App) RefreshWorkspaceHealth(ctx context.Context, workspaceID string) (string, string, string, error) {
	ws, ok := a.Manager.Instances().Get(workspaceID)
	if !ok {
		return "", "", "", workspace.NewRPCError(workspace.RPCErrorCodeNotFound, "workspace not found")
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
	if !a.IsFolderWorkspace(ctx, workspaceID) && healthErr == "" {
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

	if err := a.Manager.Instances().SetState(workspaceID, state, health); err != nil {
		return "", "", "", err
	}

	if state == instance.StateError {
		a.Watchers.Unwatch(ws.Path)
		a.PRTracker.StopTracking(workspaceID)
	} else if instance.State(ws.State) == instance.StateError {
		// Recovery from error back to active: re-register the filesystem watcher
		// that was removed on the error transition, so file-change events (which
		// drive the Git Changes tab) resume without a daemon restart.
		a.WatchAndTrack(workspaceID, ws.Path)
	}

	if err := a.UpdatePersistedWorkspaceState(ctx, workspaceID, string(state), string(health)); err != nil {
		return "", "", "", err
	}

	a.emitWorkspaceStateChanged(workspaceID, string(state), string(health), false)

	return string(state), string(health), healthErr, nil
}

func (a *App) emitWorkspaceStateChanged(workspaceID string, state string, health string, removed bool) {
	if a.Events == nil {
		return
	}
	a.Events.Publish(internalevents.Event{
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
func (a *App) IsFolderWorkspace(ctx context.Context, workspaceID string) bool {
	if a.Database == nil || strings.TrimSpace(workspaceID) == "" {
		return false
	}
	row, err := localdb.NewWorkspaceStore(a.Database).Get(ctx, workspaceID)
	if err != nil {
		return false
	}
	return row.Kind == string(workspace.KindFolder)
}
