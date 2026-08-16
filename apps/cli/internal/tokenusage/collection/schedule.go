package collection

import (
	"slices"
	"strings"
	"time"

	agentkind "yishan/apps/cli/internal/agent/kind"
)

const (
	tokenUsageStartupDelay = 30 * time.Second
	tokenUsageHookDebounce = 45 * time.Second
	tokenUsageSyncInterval = 15 * time.Minute
	tokenUsageHourLag      = 2 * time.Minute
)

// Trigger schedules a scan for one agent kind after the hook debounce window.
// If a scan for that kind is already running, the trigger is coalesced into a
// single rerun request instead of starting a second scan.
func (c *Collector) Trigger(agentKind string, source string) {
	normalizedAgentKind := normalizeTokenUsageAgentKind(agentKind)
	if normalizedAgentKind == "" {
		return
	}

	c.mu.Lock()
	if c.closed {
		c.mu.Unlock()
		return
	}
	if c.inFlight[normalizedAgentKind] {
		c.needsRerun[normalizedAgentKind] = true
		c.mu.Unlock()
		return
	}
	if existingTimer := c.timers[normalizedAgentKind]; existingTimer != nil {
		existingTimer.Stop()
	}
	c.timers[normalizedAgentKind] = time.AfterFunc(tokenUsageHookDebounce, func() {
		c.runScan(normalizedAgentKind, source)
	})
	c.mu.Unlock()
}

func normalizeTokenUsageAgentKind(agentKind string) string {
	normalized := strings.ToLower(strings.TrimSpace(agentKind))
	if isTokenTrackingAgentKind(normalized) {
		return normalized
	}
	return ""
}

func isTokenTrackingAgentKind(kind string) bool {
	return slices.Contains(agentkind.WithTokenTracking, kind)
}

// startSyncLoop starts the periodic dirty-row sync timer. It is a no-op when
// the loop is already running or the collector is closed.
func (c *Collector) startSyncLoop() {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.closed || c.syncTimer != nil {
		return
	}
	c.syncTimer = time.AfterFunc(tokenUsageSyncInterval, c.onPeriodicSync)
}

func (c *Collector) onPeriodicSync() {
	if c.pricingCatalog != nil {
		c.pricingCatalog.RefreshIfStaleAsync(func() {
			c.maybeBackfillHistoricalCost("pricing-refresh", true)
		})
	}
	c.maybeBackfillHistoricalCost("periodic", false)
	c.syncPending("periodic")
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.closed {
		return
	}
	c.syncTimer = time.AfterFunc(tokenUsageSyncInterval, c.onPeriodicSync)
}

// startHourRolloverLoop starts the hour-rollover sync timer. It is a no-op
// when the loop is already running or the collector is closed.
func (c *Collector) startHourRolloverLoop() {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.closed || c.hourTimer != nil {
		return
	}
	c.hourTimer = time.AfterFunc(durationUntilNextHourPlusLag(), c.onHourRolloverSync)
}

func (c *Collector) onHourRolloverSync() {
	c.syncPending("hour-rollover")
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.closed {
		return
	}
	c.hourTimer = time.AfterFunc(durationUntilNextHourPlusLag(), c.onHourRolloverSync)
}

func durationUntilNextHourPlusLag() time.Duration {
	now := time.Now().UTC()
	nextHour := now.Truncate(time.Hour).Add(time.Hour)
	target := nextHour.Add(tokenUsageHourLag)
	return time.Until(target)
}
