package collection

import "time"

const tokenUsageRecoveryBackfillWindow = 30 * 24 * time.Hour

// RequestRecentRecoveryScan requests a recovery scan for every scannable
// agent kind, covering the trailing recovery window. An agent whose scan is
// already running records the recovery window and is marked for rerun instead
// of being interrupted.
func (c *Collector) RequestRecentRecoveryScan(source string) {
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
