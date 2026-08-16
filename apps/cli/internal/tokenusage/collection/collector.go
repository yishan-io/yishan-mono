package collection

import (
	"sync"
	"time"

	"yishan/apps/cli/internal/adapter/cloud/session"
	"yishan/apps/cli/internal/adapter/sqlite"
	"yishan/apps/cli/internal/tokenusage/pricing"
	"yishan/apps/cli/internal/tokenusage/repository"
	"yishan/apps/cli/internal/tokenusage/scanner"
	"yishan/apps/cli/internal/workspace/instance"

	agentkind "yishan/apps/cli/internal/agent/kind"
)

var tokenUsageScannableAgentKinds = agentkind.WithActiveTokenScanners

// Collector owns the token-usage collection lifecycle: it starts the
// background loops, accepts scan triggers, and shuts every loop down in
// Close. Scan, sync, backfill, and schedule behavior live in their own files.
type Collector struct {
	mu                   sync.Mutex
	registry             *instance.Registry
	runtime              *session.Session
	repo                 repository.HourlyUsageRepository
	pricingCatalog       pricing.Catalog
	scanners             *scanner.Registry
	timers               map[string]*time.Timer
	inFlight             map[string]bool
	needsRerun           map[string]bool
	recoverySinceByAgent map[string]int64
	pending              map[string][]sqlite.HourlyUsageRow
	syncTimer            *time.Timer
	hourTimer            *time.Timer
	closed               bool
}

// NewCollector builds the collector with an explicit pricing catalog (the
// tokenusage facade wires the disk-cached default catalog) and the scanner
// registry that maps agent kinds to their providers.
func NewCollector(
	registry *instance.Registry,
	runtime *session.Session,
	repo repository.HourlyUsageRepository,
	pricingCatalog pricing.Catalog,
	scanners *scanner.Registry,
) *Collector {
	if scanners == nil {
		scanners = scanner.DefaultRegistry()
	}
	return &Collector{
		registry:             registry,
		runtime:              runtime,
		repo:                 repo,
		pricingCatalog:       pricingCatalog,
		scanners:             scanners,
		timers:               make(map[string]*time.Timer),
		inFlight:             make(map[string]bool),
		needsRerun:           make(map[string]bool),
		recoverySinceByAgent: make(map[string]int64),
		pending:              make(map[string][]sqlite.HourlyUsageRow),
	}
}

// StartStartupScan starts the collection background loops: historical cost
// backfill, periodic dirty-row sync, hour rollover sync, and a startup scan
// for every scannable agent kind after a short delay. It is safe to call
// once; the startup delay timer is owned by the collector and stopped by
// Close.
func (c *Collector) StartStartupScan() {
	c.ensureHistoricalCostBackfillStarted()
	if c.pricingCatalog != nil {
		c.pricingCatalog.RefreshIfStaleAsync(func() {
			c.maybeBackfillHistoricalCost("pricing-refresh", true)
		})
	}
	c.maybeBackfillHistoricalCost("startup", false)
	c.startSyncLoop()
	c.startHourRolloverLoop()
	timer := time.AfterFunc(tokenUsageStartupDelay, func() {
		for _, agentKind := range tokenUsageScannableAgentKinds {
			c.Trigger(agentKind, "startup")
		}
	})
	c.mu.Lock()
	if c.closed {
		c.mu.Unlock()
		timer.Stop()
		return
	}
	c.timers["startup"] = timer
	c.mu.Unlock()
}

// SyncNow runs a scan for every scannable agent kind immediately, bypassing
// the debounce window. Agents whose scan is already running are skipped; the
// trigger path (Trigger) coalesces those into a rerun.
func (c *Collector) SyncNow(source string) {
	c.mu.Lock()
	if c.closed {
		c.mu.Unlock()
		return
	}
	c.mu.Unlock()

	for _, agentKind := range tokenUsageScannableAgentKinds {
		c.mu.Lock()
		if c.inFlight[agentKind] {
			c.mu.Unlock()
			continue
		}
		if timer := c.timers[agentKind]; timer != nil {
			timer.Stop()
			delete(c.timers, agentKind)
		}
		c.mu.Unlock()
		c.runScan(agentKind, source)
	}
}

// Close flushes pending rows and stops every timer owned by the collector.
// It is safe to call multiple times; later calls are no-ops.
func (c *Collector) Close() {
	c.syncPending("shutdown")
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.closed {
		return
	}
	c.closed = true
	for key, timer := range c.timers {
		timer.Stop()
		delete(c.timers, key)
	}
	if c.syncTimer != nil {
		c.syncTimer.Stop()
		c.syncTimer = nil
	}
	if c.hourTimer != nil {
		c.hourTimer.Stop()
		c.hourTimer = nil
	}
}
