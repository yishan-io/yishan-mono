package hook

import "sync"

// UsageTracker records which agents ran in each workspace, so close-time
// summarization knows which agent sessions to summarize.
type UsageTracker struct {
	mu     sync.Mutex
	agents map[string]map[string]struct{}
}

// NewUsageTracker builds an empty tracker.
func NewUsageTracker() *UsageTracker {
	return &UsageTracker{agents: make(map[string]map[string]struct{})}
}

// Record marks agent as having run in workspaceID.
func (t *UsageTracker) Record(workspaceID string, agent string) {
	if workspaceID == "" || agent == "" || agent == "unknown" {
		return
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.agents[workspaceID] == nil {
		t.agents[workspaceID] = make(map[string]struct{})
	}
	t.agents[workspaceID][agent] = struct{}{}
}

// List returns the agents recorded for workspaceID.
func (t *UsageTracker) List(workspaceID string) []string {
	t.mu.Lock()
	agents := t.agents[workspaceID]
	t.mu.Unlock()

	if len(agents) == 0 {
		return nil
	}
	names := make([]string, 0, len(agents))
	for a := range agents {
		names = append(names, a)
	}
	return names
}

// Clear drops the recorded agents for workspaceID.
func (t *UsageTracker) Clear(workspaceID string) {
	t.mu.Lock()
	delete(t.agents, workspaceID)
	t.mu.Unlock()
}
