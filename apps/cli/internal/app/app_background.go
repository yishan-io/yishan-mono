package app

import (
	modellist "yishan/apps/cli/internal/agent/catalog"

	"github.com/rs/zerolog/log"
)

// Start creates the agent/cleanup lifecycle contexts and starts the
// background tasks owned by the app: file-cache consumer, token-usage startup
// scan, pending-cleanup retry, and the workspace health monitor.
func (a *App) Start() {
	a.StartFileCacheConsumer()
	if a.tokenUsage != nil {
		a.tokenUsage.StartStartupScan()
	}
	a.StartCleanupRetry()
	a.StartHealthMonitor()
	a.StartLocalTaskKeyBackfill()
}

// StartLocalTaskKeyBackfill keys legacy Local Tasks once at startup. Keys
// come from local counters, so one pass is enough.
func (a *App) StartLocalTaskKeyBackfill() {
	if a.localTaskSvc == nil {
		return
	}
	a.localTaskBackfillOnce.Do(func() {
		a.localTaskBackfillWG.Add(1)
		go a.runLocalTaskKeyBackfill()
	})
}

func (a *App) runLocalTaskKeyBackfill() {
	defer a.localTaskBackfillWG.Done()
	if err := a.localTaskSvc.BackfillTaskKeys(a.cleanupCtx); err != nil && a.cleanupCtx.Err() == nil {
		log.Warn().Err(err).Msg("Local Task key backfill failed")
	}
}

// Close stops the service graph in the daemon's historical shutdown order:
// event hub subscription → PR tracker → token usage → memory → agent
// lifecycle → agent manager → model list shell → cleanup/health background
// tasks → local database.
func (a *App) Close() error {
	if a.events != nil {
		a.events.Unsubscribe(a.fileCacheSubID)
	}
	if a.prTracker != nil {
		a.prTracker.Stop()
	}
	if a.tokenUsage != nil {
		a.tokenUsage.Close()
	}
	if a.memory != nil {
		if err := a.memory.Close(); err != nil {
			log.Warn().Err(err).Msg("failed to close memory service")
		}
	}
	if a.agentSvc != nil {
		a.agentSvc.Shutdown()
	}
	modellist.ShutdownShell()
	if a.cancelCleanup != nil {
		a.cancelCleanup()
	}
	if a.scheduledJobs != nil {
		a.scheduledJobs.Close()
	}
	a.localTaskBackfillWG.Wait()
	if a.database != nil {
		if err := a.database.Close(); err != nil {
			log.Warn().Err(err).Msg("failed to close local database")
		}
	}
	return nil
}
