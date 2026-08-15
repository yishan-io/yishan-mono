package node

import (
	"strings"

	"yishan/apps/cli/internal/workspace/instance"
)

// WatchAndTrack registers the filesystem watcher for a workspace and starts
// PR tracking for its worktree path.
func (a *App) WatchAndTrack(workspaceID string, path string) {
	a.Watchers.Watch(workspaceID, path)
	a.PRTracker.EnsureTracked(path, true)
}

// WatchActiveWorkspaces registers filesystem watchers for every active
// workspace restored at daemon boot. HydrateFromDB restores workspaces into
// the manager but never registers watchers, and the desktop's openProject
// warmup skips already-registered workspaces, so without this step no watcher
// would ever be created for pre-existing workspaces after a daemon restart
// and file-change events (which drive the Git Changes tab) would stop flowing.
func (a *App) WatchActiveWorkspaces() {
	for _, ws := range a.Manager.Instances().List() {
		if instance.State(ws.State) != instance.StateActive {
			continue
		}
		if strings.TrimSpace(ws.Path) == "" {
			continue
		}
		a.WatchAndTrack(ws.ID, ws.Path)
	}
}
