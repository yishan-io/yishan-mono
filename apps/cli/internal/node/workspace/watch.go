package workspace

import (
	"strings"

	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/instance"
)

// WatchAndTrack registers the filesystem watcher for a workspace and starts
// PR tracking for its worktree path.
func (s *Service) WatchAndTrack(ws workspace.Workspace) {
	if ws.Kind == workspace.KindFolder {
		return
	}
	s.deps.Watchers.Watch(ws.ID, ws.Path)
	s.deps.PRTracker.EnsureTracked(ws.Path, true)
}

// WatchActiveWorkspaces registers filesystem watchers for every active
// workspace restored at daemon boot. HydrateFromDB restores workspaces into
// the manager but never registers watchers, and the desktop's openProject
// warmup skips already-registered workspaces, so without this step no watcher
// would ever be created for pre-existing workspaces after a daemon restart
// and file-change events (which drive the Git Changes tab) would stop flowing.
func (s *Service) WatchActive() {
	for _, ws := range s.deps.Registry.List() {
		if instance.State(ws.State) != instance.StateActive {
			continue
		}
		if strings.TrimSpace(ws.Path) == "" {
			continue
		}
		s.WatchAndTrack(ws)
	}
}
