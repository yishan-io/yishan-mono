package collection

import (
	"context"
	"time"

	"github.com/rs/zerolog/log"
	"yishan/apps/cli/internal/tokenusage/attribution"
	"yishan/apps/cli/internal/tokenusage/ingestion"
	"yishan/apps/cli/internal/tokenusage/record"
	"yishan/apps/cli/internal/tokenusage/repository"
)

const tokenUsageScanOverlap = 2 * time.Hour

// runScan executes one scan for an agent kind: resolve the scan window, scan
// transcripts, enrich attribution, and replace the agent's hourly rows. A
// scan requested while another is in flight (needsRerun) is re-triggered when
// the current scan finishes.
func (c *Collector) runScan(agentKind string, source string) {
	scanSinceUnixMilli, shouldRun := c.beginScan(agentKind)
	if !shouldRun {
		return
	}

	startedAt := time.Now()
	records, err := c.scanAgentSince(agentKind, scanSinceUnixMilli)
	if err == nil {
		records = attribution.EnrichFromRegistry(records, c.registry)
	}
	if err == nil {
		err = c.repo.ReplaceAgentHourlyRows(context.Background(), agentKind, repository.ToHourlyRows(records))
	}
	if err != nil {
		log.Warn().Err(err).Str("agentKind", agentKind).Str("source", source).Msg("token usage scan failed")
	} else {
		log.Debug().Str("agentKind", agentKind).Str("source", source).Int("rows", len(records)).Dur("duration", time.Since(startedAt)).Msg("token usage scan completed")
		c.syncPending("scan")
	}

	shouldRerun, closed := c.finishScan(agentKind, err == nil)
	if shouldRerun && !closed {
		c.Trigger(agentKind, "rerun")
	}
}

func (c *Collector) scanAgent(agentKind string) ([]record.UsageRecord, error) {
	return c.scanAgentSince(agentKind, c.recentScanStartUnixMilli())
}

func (c *Collector) scanAgentSince(agentKind string, scanSinceUnixMilli int64) ([]record.UsageRecord, error) {
	scanInput := ingestion.BuildScanInput(c.registry, "daemon-"+agentKind, scanSinceUnixMilli, time.Now().UnixMilli(), "", c.pricingCatalog)
	provider, ok := c.scanners.Scanner(agentKind)
	if !ok {
		return []record.UsageRecord{}, nil
	}
	return provider.ScanHourlyUsage(context.Background(), scanInput)
}

func (c *Collector) recentScanStartUnixMilli() int64 {
	syncState, err := c.repo.GetHourlyUsageSyncState(context.Background())
	if err != nil {
		return 0
	}
	if syncState.LastSuccessfulSyncAt == 0 {
		return 0
	}
	return time.UnixMilli(syncState.LastSuccessfulSyncAt).UTC().Add(-tokenUsageScanOverlap).UnixMilli()
}

// beginScan marks an agent kind as in-flight and resolves its scan window. It
// returns false when the collector is closed, so the caller must not scan.
func (c *Collector) beginScan(agentKind string) (int64, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.closed {
		return 0, false
	}
	c.inFlight[agentKind] = true
	delete(c.timers, agentKind)
	return c.resolveScanStartUnixMilliLocked(agentKind), true
}

// finishScan clears the in-flight marker and reports whether the scan must
// run again because a trigger arrived while it was running.
func (c *Collector) finishScan(agentKind string, didSucceed bool) (bool, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.inFlight[agentKind] = false
	shouldRerun := c.needsRerun[agentKind]
	delete(c.needsRerun, agentKind)
	if didSucceed {
		delete(c.recoverySinceByAgent, agentKind)
	}
	return shouldRerun, c.closed
}

func (c *Collector) resolveScanStartUnixMilli(agentKind string) int64 {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.resolveScanStartUnixMilliLocked(agentKind)
}

func (c *Collector) resolveScanStartUnixMilliLocked(agentKind string) int64 {
	scanSinceUnixMilli := c.recentScanStartUnixMilli()
	recoverySinceUnixMilli := c.recoverySinceByAgent[agentKind]
	if recoverySinceUnixMilli == 0 {
		return scanSinceUnixMilli
	}
	if scanSinceUnixMilli == 0 || recoverySinceUnixMilli < scanSinceUnixMilli {
		return recoverySinceUnixMilli
	}
	return scanSinceUnixMilli
}
