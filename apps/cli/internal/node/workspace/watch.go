package workspace

import (
	"strings"

	"yishan/apps/cli/internal/workspace/instance"
)

// WatchAndTrack registers the filesystem watcher for a workspace and starts
// PR tracking for its worktree path.
func (s *Service) WatchAndTrack(workspaceID string, path string) error {
	if s.deps.Watchers != nil {
		if err := s.deps.Watchers.Watch(workspaceID, path); err != nil {
			return err
		}
	}
	if s.deps.PRTracker != nil {
		s.deps.PRTracker.EnsureTracked(path, true)
	}
	return nil
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
		_ = s.WatchAndTrack(ws.ID, ws.Path) // startup watchers are best-effort
	}
}
