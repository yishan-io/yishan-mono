package agent

import (
	"sync"

	"yishan/apps/cli/internal/agent/dsh"
	"yishan/apps/cli/internal/rpc"
)

type dshLiveSession struct {
	sessionID, tabID, paneID, workspaceID, cwd, instanceID, provider, model string
	connection                                                              *rpc.Connection
	available                                                               bool
	subscription                                                            dsh.SessionSubscription
	generation                                                              uint64
	notification                                                            dshNotificationState
}

type dshRoute struct {
	connection                            *rpc.Connection
	sessionID, tabID, paneID, workspaceID string
	instanceID                            string
	generation                            uint64
}

type dshSubscriptionBinding struct {
	generation uint64
	updates    <-chan dsh.SessionUpdate
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

func (r *dshLiveRegistry) register(entry *dshLiveSession) (dshSubscriptionBinding, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, exists := r.sessions[entry.sessionID]; exists {
		return dshSubscriptionBinding{}, false
	}
	entry.generation = 1
	entry.notification = newDSHNotificationState()
	r.sessions[entry.sessionID] = entry
	return dshSubscriptionBinding{generation: entry.generation, updates: entry.subscription.Updates}, true
}

func (r *dshLiveRegistry) rebind(entry *dshLiveSession, connection *rpc.Connection, subscription dsh.SessionSubscription) (dshSubscriptionBinding, dshRoute, bool, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.sessions[entry.sessionID] != entry {
		return dshSubscriptionBinding{}, dshRoute{}, false, false
	}
	oldRoute := dshRoute{connection: entry.connection, sessionID: entry.sessionID, tabID: entry.tabID, paneID: entry.paneID, workspaceID: entry.workspaceID, instanceID: entry.instanceID, generation: entry.generation}
	previous := entry.subscription
	instanceIDChanged := entry.instanceID != "" && entry.instanceID != subscription.InstanceID
	entry.connection, entry.subscription = connection, subscription
	entry.instanceID = subscription.InstanceID
	entry.available, entry.generation = true, entry.generation+1
	if previous.Unsubscribe != nil {
		previous.Unsubscribe()
	}
	return dshSubscriptionBinding{generation: entry.generation, updates: subscription.Updates}, oldRoute, instanceIDChanged, true
}

func (r *dshLiveRegistry) requiresResume(entry *dshLiveSession) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.sessions[entry.sessionID] == entry && !entry.available
}

func (r *dshLiveRegistry) markUnavailable(entry *dshLiveSession, generation uint64) (dshRoute, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.sessions[entry.sessionID] != entry || entry.generation != generation {
		return dshRoute{}, false
	}
	entry.available = false
	return dshRoute{connection: entry.connection, sessionID: entry.sessionID, tabID: entry.tabID, paneID: entry.paneID, workspaceID: entry.workspaceID, instanceID: entry.instanceID, generation: generation}, true
}

// notificationState returns session-owned notification state for the current route.
func (r *dshLiveRegistry) notificationState(route dshRoute) (*dshNotificationState, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	entry := r.sessions[route.sessionID]
	if entry == nil || entry.generation != route.generation || entry.instanceID != route.instanceID || entry.connection != route.connection {
		return nil, false
	}
	return &entry.notification, true
}

func (r *dshLiveRegistry) resetNotificationState(entry *dshLiveSession) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.sessions[entry.sessionID] == entry {
		entry.notification = newDSHNotificationState()
	}
}

// route returns an immutable routing snapshot only when generation is current.
func (r *dshLiveRegistry) route(entry *dshLiveSession, generation uint64) (dshRoute, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.sessions[entry.sessionID] != entry || entry.generation != generation {
		return dshRoute{}, false
	}
	return dshRoute{connection: entry.connection, sessionID: entry.sessionID, tabID: entry.tabID, paneID: entry.paneID, workspaceID: entry.workspaceID, instanceID: entry.instanceID, generation: generation}, true
}

// resetRoute atomically marks the subscription unavailable and retains the
// current route snapshot needed to publish its terminal reset. An attaching
// connection must therefore resume before it can subscribe again.
func (r *dshLiveRegistry) resetRoute(entry *dshLiveSession, generation uint64, instanceID string) (dshRoute, dshRoute, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.sessions[entry.sessionID] != entry || entry.generation != generation {
		return dshRoute{}, dshRoute{}, false
	}
	oldRoute := dshRoute{connection: entry.connection, sessionID: entry.sessionID, tabID: entry.tabID, paneID: entry.paneID, workspaceID: entry.workspaceID, instanceID: entry.instanceID, generation: generation}
	entry.instanceID, entry.available = instanceID, false
	return dshRoute{connection: entry.connection, sessionID: entry.sessionID, tabID: entry.tabID, paneID: entry.paneID, workspaceID: entry.workspaceID, instanceID: entry.instanceID, generation: generation}, oldRoute, true
}

func (r *dshLiveRegistry) detach(entry *dshLiveSession, generation uint64, connection *rpc.Connection) (dshRoute, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.sessions[entry.sessionID] != entry || entry.generation != generation || entry.connection != connection {
		return dshRoute{}, false
	}
	route := dshRoute{sessionID: entry.sessionID, tabID: entry.tabID, paneID: entry.paneID, workspaceID: entry.workspaceID, instanceID: entry.instanceID, generation: generation}
	previous := entry.subscription
	entry.connection = nil
	entry.subscription = dsh.SessionSubscription{}
	entry.available = false
	entry.generation++
	entry.generation++
	if previous.Unsubscribe != nil {
		previous.Unsubscribe()
	}
	return route, true
}

func (r *dshLiveRegistry) remove(entry *dshLiveSession) (dshRoute, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.sessions[entry.sessionID] != entry {
		return dshRoute{}, false
	}
	route := dshRoute{sessionID: entry.sessionID, tabID: entry.tabID, paneID: entry.paneID, workspaceID: entry.workspaceID, instanceID: entry.instanceID, generation: entry.generation}
	delete(r.sessions, entry.sessionID)
	entry.generation++
	if entry.subscription.Unsubscribe != nil {
		entry.subscription.Unsubscribe()
	}
	return route, true
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
