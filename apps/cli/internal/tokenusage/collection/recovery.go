package collection

import "time"

const (
	tokenUsageRecoveryBackfillWindow = 30 * 24 * time.Hour
	tokenUsageRecoveryTimerKey       = "recovery"
)

// RequestRecentRecoveryScan schedules a recovery scan for every scannable
// agent kind, covering the trailing recovery window. The collector owns the
// timer, so Close prevents a pending recovery scan from starting.
func (c *Collector) RequestRecentRecoveryScan(source string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.closed || c.timers[tokenUsageRecoveryTimerKey] != nil {
		return
	}
	c.timers[tokenUsageRecoveryTimerKey] = time.AfterFunc(0, func() {
		c.runRecentRecoveryScans(source)
	})
}

// runRecentRecoveryScans starts each recovery scan after the collector-owned
// timer has released the caller. It retains the per-agent coalescing and
// rerun behavior of direct recovery requests.
func (c *Collector) runRecentRecoveryScans(source string) {
	c.mu.Lock()
	delete(c.timers, tokenUsageRecoveryTimerKey)
	c.mu.Unlock()

	recoverySinceUnixMilli := time.Now().UTC().Add(-tokenUsageRecoveryBackfillWindow).UnixMilli()
	for _, agentKind := range tokenUsageScannableAgentKinds {
		shouldRun := c.requestRecoveryScan(agentKind, recoverySinceUnixMilli)
		if shouldRun {
			c.runScan(agentKind, source)
		}
	}
}

// requestRecoveryScan records a recovery window for one agent kind and
// reports whether the scan can start immediately. Idle agents return true
// (with any pending debounce timer cancelled); in-flight agents return false
// and rely on the rerun flag set by beginScan/finishScan.
func (c *Collector) requestRecoveryScan(agentKind string, recoverySinceUnixMilli int64) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.closed {
		return false
	}
	c.recordRecoverySinceLocked(agentKind, recoverySinceUnixMilli)
	if c.inFlight[agentKind] {
		c.needsRerun[agentKind] = true
		return false
	}
	if timer := c.timers[agentKind]; timer != nil {
		timer.Stop()
		delete(c.timers, agentKind)
	}
	return true
}

func (c *Collector) recordRecoverySinceLocked(agentKind string, recoverySinceUnixMilli int64) {
	existingRecoverySinceUnixMilli := c.recoverySinceByAgent[agentKind]
	if existingRecoverySinceUnixMilli == 0 || recoverySinceUnixMilli < existingRecoverySinceUnixMilli {
		c.recoverySinceByAgent[agentKind] = recoverySinceUnixMilli
	}
}
