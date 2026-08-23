package app

import (
	"os"
	"path/filepath"

	"yishan/apps/cli/internal/events"

	"github.com/rs/zerolog/log"
)

// StartFileCacheConsumer subscribes to workspaceFilesChanged events and
// invalidates the instance file cache (and forwards memory indexing) for
// changed paths.
func (a *App) StartFileCacheConsumer() {
	subID, events := a.events.Subscribe()
	a.fileCacheSubID = subID
	go a.consumeFileCacheInvalidationEvents(events)
}

func (a *App) consumeFileCacheInvalidationEvents(events <-chan eventbus.Event) {
	for event := range events {
		if event.Topic != "workspaceFilesChanged" {
			continue
		}
		payload, ok := event.Payload.(map[string]any)
		if !ok {
			continue
		}
		worktreePath, _ := payload["workspaceWorktreePath"].(string)
		changedPaths, _ := payload["changedRelativePaths"].([]string)
		if worktreePath == "" {
			continue
		}
		if len(changedPaths) == 0 {
			a.registry.InvalidateFileCache(worktreePath, []string{""})
			continue
		}
		a.registry.InvalidateFileCache(worktreePath, changedPaths)
		if a.memory != nil {
			a.forwardMemoryFileChanges(worktreePath, changedPaths)
		}
	}
}

func (a *App) forwardMemoryFileChanges(worktreePath string, relPaths []string) {
	// Resolve projectID from the registered workspace (best-effort; empty is fine).
	projectID := ""
	if ws, ok := a.registry.GetByPath(worktreePath); ok {
		projectID = ws.ProjectID
	}
	for _, rel := range relPaths {
		abs := filepath.Join(worktreePath, rel)
		if _, err := os.Stat(abs); os.IsNotExist(err) {
			if deleteErr := a.memory.OnFileDeleted(abs); deleteErr != nil {
				log.Warn().Err(deleteErr).Str("path", abs).Msg("memory index delete failed")
			}
			continue
		}
		// Resolve symlinks before the ShouldIndex check: .my-context/ inside a
		// worktree is a symlink to ~/.yishan/contexts/…, so the unresolved abs
		// path contains "/.yishan/worktrees/" and would never match the filter.
		// Deleted files were handled above while their symlink parent was still
		// available for canonical path resolution.
		resolved := abs
		if r, err := filepath.EvalSymlinks(abs); err == nil {
			resolved = r
		}
		if a.memory.ShouldIndex(resolved) {
			// Index under the resolved path: for a .my-context symlink this is
			// the canonical ~/.yishan/contexts/… target that reconcile also
			// indexes, so a custom-path git worktree cannot create a second
			// row under its symlink path. For a real (non-git) .my-context
			// directory resolved == abs, so nothing changes there.
			if err := a.memory.OnFileChanged(resolved, worktreePath, projectID); err != nil {
				log.Warn().Err(err).Str("path", resolved).Msg("memory index update failed")
			}
		}
	}
}
