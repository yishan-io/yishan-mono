package tokenusage

import "time"

const tokenUsageRecoveryBackfillWindow = 30 * 24 * time.Hour

func (c *Collector) RequestRecentRecoveryScan(source string) {
	recoverySinceUnixMilli := time.Now().UTC().Add(-tokenUsageRecoveryBackfillWindow).UnixMilli()
	for _, agentKind := range tokenUsageScannableAgentKinds {
		shouldRun := c.requestRecoveryScan(agentKind, recoverySinceUnixMilli)
		if shouldRun {
			c.runScan(agentKind, source)
		}
	}
}

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

func (c *Collector) recordRecoverySinceLocked(agentKind string, recoverySinceUnixMilli int64) {
	existingRecoverySinceUnixMilli := c.recoverySinceByAgent[agentKind]
	if existingRecoverySinceUnixMilli == 0 || recoverySinceUnixMilli < existingRecoverySinceUnixMilli {
		c.recoverySinceByAgent[agentKind] = recoverySinceUnixMilli
	}
}
