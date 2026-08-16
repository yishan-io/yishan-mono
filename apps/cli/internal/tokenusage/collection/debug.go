package collection

import (
	"sort"
)

// DebugState is a snapshot of the collector's timer and scan state for
// diagnostics. The shape is part of the tokenusage facade contract.
type DebugState struct {
	Closed           bool              `json:"closed"`
	ScheduledAgents  []string          `json:"scheduledAgents"`
	InFlightAgents   []string          `json:"inFlightAgents"`
	NeedsRerunAgents []string          `json:"needsRerunAgents"`
	KnownTimers      map[string]string `json:"knownTimers"`
	PendingAgents    []string          `json:"pendingAgents"`
}

// DebugState returns a copy of the collector's timer and scan state. It is
// safe to call concurrently with running scans.
func (c *Collector) DebugState() DebugState {
	c.mu.Lock()
	defer c.mu.Unlock()

	scheduledAgents := make([]string, 0, len(c.timers))
	knownTimers := make(map[string]string, len(c.timers))
	for key := range c.timers {
		scheduledAgents = append(scheduledAgents, key)
		if key == "startup" {
			knownTimers[key] = "startup-delay"
		} else {
			knownTimers[key] = "agent-debounce"
		}
	}
	if c.syncTimer != nil {
		knownTimers["periodic-sync"] = tokenUsageSyncInterval.String()
		scheduledAgents = append(scheduledAgents, "periodic-sync")
	}
	if c.hourTimer != nil {
		knownTimers["hour-rollover-sync"] = tokenUsageHourLag.String()
		scheduledAgents = append(scheduledAgents, "hour-rollover-sync")
	}
	sort.Strings(scheduledAgents)

	inFlightAgents := make([]string, 0, len(c.inFlight))
	for key, inFlight := range c.inFlight {
		if inFlight {
			inFlightAgents = append(inFlightAgents, key)
		}
	}
	sort.Strings(inFlightAgents)

	needsRerunAgents := make([]string, 0, len(c.needsRerun))
	for key, needsRerun := range c.needsRerun {
		if needsRerun {
			needsRerunAgents = append(needsRerunAgents, key)
		}
	}
	sort.Strings(needsRerunAgents)

	pendingAgents := make([]string, 0, len(c.pending))
	for key, rows := range c.pending {
		if len(rows) > 0 {
			pendingAgents = append(pendingAgents, key)
		}
	}
	sort.Strings(pendingAgents)

	return DebugState{
		Closed:           c.closed,
		ScheduledAgents:  scheduledAgents,
		InFlightAgents:   inFlightAgents,
		NeedsRerunAgents: needsRerunAgents,
		KnownTimers:      knownTimers,
		PendingAgents:    pendingAgents,
	}
}
