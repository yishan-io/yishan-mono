package dsh

import (
	"bytes"
	"encoding/json"
	"sync"
)

const defaultReplayCapacity = 256

type replayCoordinator struct {
	mu        sync.Mutex
	capacity  int
	sessions  map[string]*replaySession
	isInvalid bool
}
type replaySession struct {
	incarnation    string
	events         []SessionEvent
	status         *SessionStatus
	subscribers    map[uint64]replaySubscriber
	nextSubscriber uint64
	isInvalid      bool
	lifecycle      *SubagentLifecycle
}
type replaySubscriber struct {
	updates        chan SessionUpdate
	normalCapacity int
}

func newReplayCoordinator(capacity int) *replayCoordinator {
	if capacity < 1 {
		capacity = defaultReplayCapacity
	}
	return &replayCoordinator{capacity: capacity, sessions: make(map[string]*replaySession)}
}
func (c *replayCoordinator) session(sessionID string) *replaySession {
	entry := c.sessions[sessionID]
	if entry == nil {
		entry = &replaySession{subscribers: make(map[uint64]replaySubscriber)}
		c.sessions[sessionID] = entry
	}
	return entry
}
func (c *replayCoordinator) recordEvent(sessionID string, event SessionEvent) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	entry := c.session(sessionID)
	isAccepted, isNew := recordReplayEvent(entry, event, c.capacity)
	if !isAccepted {
		c.invalidateSession(entry, sessionID)
		return ErrSessionReplayReset
	}
	if isNew {
		publish(entry, sessionID, SessionUpdate{Event: &event})
	}
	return nil
}
func (c *replayCoordinator) recordLifecycle(lifecycle SubagentLifecycle) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	entry := c.session(lifecycle.ParentSessionID)
	isAccepted, isNew := recordReplayLifecycle(entry, lifecycle)
	if !isAccepted {
		c.invalidateSession(entry, lifecycle.ParentSessionID)
		return ErrSessionReplayReset
	}
	if isNew {
		publish(entry, lifecycle.ParentSessionID, SessionUpdate{Lifecycle: &lifecycle})
	}
	return nil
}

func recordReplayLifecycle(entry *replaySession, lifecycle SubagentLifecycle) (bool, bool) {
	if entry.incarnation == "" {
		entry.incarnation = lifecycle.Incarnation
	}
	if entry.incarnation != lifecycle.Incarnation {
		return true, false
	}
	if entry.lifecycle == nil {
		if lifecycle.Revision != 0 {
			return false, false
		}
		entry.lifecycle = &lifecycle
		return true, true
	}
	prior := *entry.lifecycle
	if lifecycle.Revision == prior.Revision {
		return sameLifecycle(prior, lifecycle), false
	}
	if lifecycle.Revision != prior.Revision+1 {
		return false, false
	}
	entry.lifecycle = &lifecycle
	return true, true
}

func sameLifecycle(left SubagentLifecycle, right SubagentLifecycle) bool {
	return left == right
}

func recordReplayEvent(entry *replaySession, event SessionEvent, capacity int) (bool, bool) {
	if len(entry.events) == 0 {
		entry.events = append(entry.events, event)
		return true, true
	}
	last := entry.events[len(entry.events)-1]
	if event.Seq == last.Seq+1 {
		entry.events = append(entry.events, event)
		if len(entry.events) > capacity {
			entry.events = entry.events[1:]
		}
		return true, true
	}
	if event.Seq <= last.Seq {
		for _, prior := range entry.events {
			if prior.Seq == event.Seq {
				return bytes.Equal(prior.Event, event.Event), false
			}
		}
	}
	return false, false
}
func (c *replayCoordinator) subscribe(result SessionSubscribeResult, request SessionSubscribeRequest) (SessionSubscription, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	entry := c.session(request.SessionID)
	if c.isInvalid || entry.isInvalid {
		return SessionSubscription{}, ErrSessionReplayReset
	}
	if entry.incarnation != "" && entry.incarnation != result.Incarnation {
		resetReplaySession(entry, result.Incarnation)
		return SessionSubscription{}, ErrSessionReplayReset
	}
	entry.incarnation = result.Incarnation
	updates, baseline, ok := buildReplayUpdates(entry.events, result, request.AfterSeq)
	if !ok {
		c.invalidateSession(entry, request.SessionID)
		return SessionSubscription{}, ErrSessionReplayReset
	}
	entry.nextSubscriber++
	id := entry.nextSubscriber
	initialUpdates := append(updates, SessionUpdate{Cursor: &DurableCursor{
		SessionID: request.SessionID, Incarnation: result.Incarnation, DurableThroughSeq: result.DurableThroughSeq,
	}})
	status := SessionStatus{SessionID: request.SessionID, Status: "idle"}
	if entry.status != nil {
		status = *entry.status
	}
	initialUpdates = append(initialUpdates, SessionUpdate{Status: &status})
	if entry.lifecycle != nil && entry.lifecycle.Incarnation == result.Incarnation {
		initialUpdates = append(initialUpdates, SessionUpdate{LifecycleResync: &LifecycleResync{
			ParentSessionID: request.SessionID,
			Incarnation:     result.Incarnation,
			Revision:        entry.lifecycle.Revision,
		}})
	}
	normalCapacity := max(defaultReplayCapacity, len(initialUpdates))
	channel := make(chan SessionUpdate, normalCapacity+1)
	entry.subscribers[id] = replaySubscriber{updates: channel, normalCapacity: normalCapacity}
	for _, update := range initialUpdates {
		channel <- update
	}
	snapshot := result
	snapshot.Events = sessionEventsFromUpdates(updates)
	snapshot.HeadSeq = baseline
	return SessionSubscription{Updates: channel, Unsubscribe: func() { c.unsubscribe(request.SessionID, id) }, Incarnation: result.Incarnation, Baseline: baseline, Snapshot: snapshot}, nil
}

func sessionEventsFromUpdates(updates []SessionUpdate) []SessionEvent {
	events := make([]SessionEvent, 0, len(updates))
	for _, update := range updates {
		if update.Event == nil {
			continue
		}
		events = append(events, *update.Event)
	}
	return events
}

func buildReplayUpdates(live []SessionEvent, result SessionSubscribeResult, after int64) ([]SessionUpdate, int64, bool) {
	if !hasMatchingOverlap(live, result.Events, result.DurableThroughSeq) {
		return nil, 0, false
	}
	updates := makeReplayUpdates(result.Events)
	next, ok := appendLiveUpdates(&updates, live, result.DurableThroughSeq)
	if !ok || result.HeadSeq >= next {
		return nil, 0, false
	}
	if len(result.Events) == 0 && result.DurableThroughSeq != after {
		return nil, 0, false
	}
	baseline := result.HeadSeq
	if len(updates) > 0 {
		if event := updates[len(updates)-1].Event; event != nil && event.Seq > baseline {
			baseline = event.Seq
		}
	}
	return updates, baseline, true
}
func hasMatchingOverlap(live, durable []SessionEvent, durableThroughSeq int64) bool {
	durableBySeq := make(map[int64]json.RawMessage, len(durable))
	for _, event := range durable {
		durableBySeq[event.Seq] = event.Event
	}
	for _, event := range live {
		durableEvent, overlaps := durableBySeq[event.Seq]
		if event.Seq <= durableThroughSeq && overlaps && !bytes.Equal(event.Event, durableEvent) {
			return false
		}
	}
	return true
}
func makeReplayUpdates(events []SessionEvent) []SessionUpdate {
	updates := make([]SessionUpdate, 0, len(events))
	for _, event := range events {
		copy := event
		updates = append(updates, SessionUpdate{Event: &copy})
	}
	return updates
}
func appendLiveUpdates(updates *[]SessionUpdate, live []SessionEvent, durableThroughSeq int64) (int64, bool) {
	next := durableThroughSeq + 1
	for _, event := range live {
		if event.Seq <= durableThroughSeq {
			continue
		}
		if event.Seq != next {
			return next, false
		}
		copy := event
		*updates = append(*updates, SessionUpdate{Event: &copy})
		next++
	}
	return next, true
}
func (c *replayCoordinator) unsubscribe(sessionID string, id uint64) {
	c.mu.Lock()
	defer c.mu.Unlock()
	entry := c.sessions[sessionID]
	if entry == nil {
		return
	}
	if subscriber, ok := entry.subscribers[id]; ok {
		delete(entry.subscribers, id)
		close(subscriber.updates)
	}
}
func (c *replayCoordinator) setIncarnation(sessionID, incarnation string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	entry := c.session(sessionID)
	if entry.incarnation != "" && entry.incarnation != incarnation {
		resetReplaySession(entry, incarnation)
		return
	}
	entry.incarnation = incarnation
}
func (c *replayCoordinator) acceptCursor(cursor DurableCursor) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	entry := c.session(cursor.SessionID)
	if entry.incarnation == "" {
		entry.incarnation = cursor.Incarnation
	}
	if entry.incarnation != cursor.Incarnation {
		resetReplaySession(entry, cursor.Incarnation)
		reset := TranscriptReset{SessionID: cursor.SessionID, Incarnation: cursor.Incarnation, HeadSeq: -1}
		publish(entry, cursor.SessionID, SessionUpdate{Reset: &reset})
		return nil
	}
	publish(entry, cursor.SessionID, SessionUpdate{Cursor: &cursor})
	return nil
}
func (c *replayCoordinator) publishStatus(status SessionStatus) {
	c.mu.Lock()
	defer c.mu.Unlock()
	entry := c.session(status.SessionID)
	entry.status = &status
	publish(entry, status.SessionID, SessionUpdate{Status: &status})
}
func (c *replayCoordinator) reset(reset TranscriptReset) {
	c.mu.Lock()
	defer c.mu.Unlock()
	entry := c.session(reset.SessionID)
	resetReplaySession(entry, reset.Incarnation)
	publish(entry, reset.SessionID, SessionUpdate{Reset: &reset})
}
func (c *replayCoordinator) invalidate() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.isInvalid = true
	for sessionID, entry := range c.sessions {
		c.invalidateSession(entry, sessionID)
	}
}
func (c *replayCoordinator) invalidateSession(entry *replaySession, sessionID string) {
	entry.isInvalid = true
	entry.events = nil
	entry.lifecycle = nil
	terminateSubscribers(entry, sessionID)
}
func resetReplaySession(entry *replaySession, incarnation string) {
	entry.incarnation = incarnation
	entry.events = nil
	entry.lifecycle = nil
	entry.isInvalid = false
}
func terminateSubscribers(entry *replaySession, sessionID string) {
	reset := TranscriptReset{SessionID: sessionID, Incarnation: entry.incarnation, HeadSeq: -1}
	for id, subscriber := range entry.subscribers {
		delete(entry.subscribers, id)
		subscriber.updates <- SessionUpdate{Reset: &reset}
		close(subscriber.updates)
	}
}
func publish(entry *replaySession, sessionID string, update SessionUpdate) {
	for id, subscriber := range entry.subscribers {
		if len(subscriber.updates) >= subscriber.normalCapacity {
			delete(entry.subscribers, id)
			reset := TranscriptReset{SessionID: sessionID, Incarnation: entry.incarnation, HeadSeq: -1}
			subscriber.updates <- SessionUpdate{Reset: &reset}
			close(subscriber.updates)
			continue
		}
		subscriber.updates <- update
	}
}
func (c *replayCoordinator) errorIfInvalid(sessionID string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.isInvalid {
		return ErrSessionReplayReset
	}
	if entry := c.sessions[sessionID]; entry != nil && entry.isInvalid {
		return ErrSessionReplayReset
	}
	return nil
}
