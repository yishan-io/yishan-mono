package app

import (
	"time"

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

// StartLocalTaskKeyBackfill periodically retries legacy key reservations until the app closes.
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
	a.backfillLocalTaskKeys()
	ticker := time.NewTicker(localTaskKeyBackfillInterval)
	defer ticker.Stop()
	for {
		select {
		case <-a.cleanupCtx.Done():
			return
		case <-ticker.C:
			a.backfillLocalTaskKeys()
		}
	}
}

func (a *App) backfillLocalTaskKeys() {
	if err := a.localTaskSvc.BackfillTaskKeys(a.cleanupCtx); err != nil && a.cleanupCtx.Err() == nil {
		log.Debug().Err(err).Msg("Local Task key backfill deferred")
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
