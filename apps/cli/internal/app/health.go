package app

import (
	"time"
)

const healthCheckInterval = 15 * time.Second

// StartHealthMonitor periodically re-checks active workspaces whose worktree
// path disappears while the daemon is running, so the UI can show the error
// state and offer close-only without requiring a daemon restart. The check
// itself is a node.Service application operation.
func (a *App) StartHealthMonitor() {
	go func() {
		ticker := time.NewTicker(healthCheckInterval)
		defer ticker.Stop()
		for {
			select {
			case <-a.cleanupCtx.Done():
				return
			case <-ticker.C:
				a.workspaceSvc.CheckHealth(a.cleanupCtx)
			}
		}
	}()
}
