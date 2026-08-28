package agent

import (
	"sync"

	"yishan/apps/cli/internal/agent/dsh"
	"yishan/apps/cli/internal/rpc"
)

type dshLiveSession struct {
	sessionID, tabID, workspaceID, cwd, incarnation, provider, model string
	connection                                                       *rpc.Connection
	available                                                        bool
	subscription                                                     dsh.SessionSubscription
	generation                                                       uint64
}

type dshRoute struct {
	connection                    *rpc.Connection
	sessionID, tabID, workspaceID string
	incarnation                   string
	generation                    uint64
}

type dshLiveRegistry struct {
	mu       sync.Mutex
	sessions map[string]*dshLiveSession
}

func newDSHLiveRegistry() *dshLiveRegistry {
	return &dshLiveRegistry{sessions: make(map[string]*dshLiveSession)}
}

func (r *dshLiveRegistry) has(sessionID string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.sessions[sessionID] != nil
}

func (r *dshLiveRegistry) getOwned(sessionID, workspaceID, cwd string) (*dshLiveSession, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	entry := r.sessions[sessionID]
	if entry == nil || entry.workspaceID != workspaceID || entry.cwd != cwd {
		return nil, false
	}
	return entry, true
}

func (r *dshLiveRegistry) register(entry *dshLiveSession) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, exists := r.sessions[entry.sessionID]; exists {
		return false
	}
	entry.generation = 1
	r.sessions[entry.sessionID] = entry
	return true
}

func (r *dshLiveRegistry) rebind(entry *dshLiveSession, connection *rpc.Connection, subscription dsh.SessionSubscription) (uint64, bool, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.sessions[entry.sessionID] != entry {
		return 0, false, false
	}
	previous := entry.subscription
	incarnationChanged := entry.incarnation != "" && entry.incarnation != subscription.Incarnation
	entry.connection, entry.subscription = connection, subscription
	entry.incarnation = subscription.Incarnation
	entry.available, entry.generation = true, entry.generation+1
	if previous.Unsubscribe != nil {
		previous.Unsubscribe()
	}
	return entry.generation, incarnationChanged, true
}

func (r *dshLiveRegistry) requiresResume(entry *dshLiveSession) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.sessions[entry.sessionID] == entry && !entry.available
}

func (r *dshLiveRegistry) binding(entry *dshLiveSession) (uint64, <-chan dsh.SessionUpdate, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.sessions[entry.sessionID] != entry {
		return 0, nil, false
	}
	return entry.generation, entry.subscription.Updates, true
}

func (r *dshLiveRegistry) markUnavailable(entry *dshLiveSession, generation uint64) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.sessions[entry.sessionID] == entry && entry.generation == generation {
		entry.available = false
	}
}

// route returns an immutable routing snapshot only when generation is current.
func (r *dshLiveRegistry) route(entry *dshLiveSession, generation uint64) (dshRoute, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.sessions[entry.sessionID] != entry || entry.generation != generation || entry.connection == nil {
		return dshRoute{}, false
	}
	return dshRoute{connection: entry.connection, sessionID: entry.sessionID, tabID: entry.tabID, workspaceID: entry.workspaceID, incarnation: entry.incarnation, generation: generation}, true
}

// resetRoute atomically marks the subscription unavailable and retains the
// current route snapshot needed to publish its terminal reset. An attaching
// connection must therefore resume before it can subscribe again.
func (r *dshLiveRegistry) resetRoute(entry *dshLiveSession, generation uint64, incarnation string) (dshRoute, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.sessions[entry.sessionID] != entry || entry.generation != generation || entry.connection == nil {
		return dshRoute{}, false
	}
	entry.incarnation = incarnation
	entry.available = false
	return dshRoute{connection: entry.connection, sessionID: entry.sessionID, tabID: entry.tabID, workspaceID: entry.workspaceID, incarnation: entry.incarnation, generation: generation}, true
}

func (r *dshLiveRegistry) detach(entry *dshLiveSession, generation uint64, connection *rpc.Connection) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.sessions[entry.sessionID] != entry || entry.generation != generation || entry.connection != connection {
		return
	}
	previous := entry.subscription
	entry.connection = nil
	entry.subscription = dsh.SessionSubscription{}
	entry.available = false
	entry.generation++
	if previous.Unsubscribe != nil {
		previous.Unsubscribe()
	}
}

func (r *dshLiveRegistry) remove(entry *dshLiveSession) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.sessions[entry.sessionID] != entry {
		return false
	}
	delete(r.sessions, entry.sessionID)
	entry.generation++
	if entry.subscription.Unsubscribe != nil {
		entry.subscription.Unsubscribe()
	}
	return true
}

func (r *dshLiveRegistry) workspaceEntries(workspaceID string) []*dshLiveSession {
	r.mu.Lock()
	defer r.mu.Unlock()
	entries := make([]*dshLiveSession, 0)
	for _, entry := range r.sessions {
		if entry.workspaceID == workspaceID {
			entries = append(entries, entry)
		}
	}
	return entries
}

func (r *dshLiveRegistry) setSelection(sessionID, workspaceID, cwd, provider, model string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	entry := r.sessions[sessionID]
	if entry != nil && entry.workspaceID == workspaceID && entry.cwd == cwd {
		entry.provider, entry.model = provider, model
	}
}
