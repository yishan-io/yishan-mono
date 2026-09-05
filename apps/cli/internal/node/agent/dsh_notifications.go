package agent

import (
	"fmt"

	"yishan/apps/cli/internal/agent/dsh"
	"yishan/apps/cli/internal/rpc"
)

type dshNotificationProjection struct {
	observer, eventType string
	silent              bool
	id                  string
}

type dshNotificationState struct {
	lastSeq                   int64
	status, observer          string
	openTurn                  *int64
	terminalKind              string
	isTerminal                bool
	approvals, emittedEffects map[string]struct{}
}

func newDSHNotificationState() dshNotificationState {
	return dshNotificationState{lastSeq: -1, approvals: make(map[string]struct{}), emittedEffects: make(map[string]struct{})}
}

// applyDSHUpdate applies one trusted DSH update to session-owned notification state.
func applyDSHUpdate(state *dshNotificationState, update dsh.SessionUpdate) bool {
	if update.Status != nil {
		switch update.Status.Status {
		case "idle":
			state.status, state.isTerminal = "idle", false
			return true
		case "running":
			if state.isTerminal {
				return false
			}
			state.status, state.terminalKind = "running", ""
			return true
		default:
			return false
		}
	}
	if update.Event == nil || update.Event.Seq < 0 || update.Event.Seq <= state.lastSeq {
		return false
	}
	state.lastSeq = update.Event.Seq
	return applyDSHEvent(state, *update.Event)
}

func applyDSHEvent(state *dshNotificationState, event dsh.SessionEvent) bool {
	eventType, data, ok := parseDSHEventEnvelope(event.Event)
	if !ok {
		return false
	}
	switch eventType {
	case "turn/start":
		turn, ok := parseTurnStart(data)
		if !ok {
			return false
		}
		state.openTurn, state.terminalKind, state.isTerminal = &turn, "", false
		return true
	case "approval/asked":
		id, ok := parseApprovalAsked(data)
		if !ok {
			return false
		}
		state.approvals[id] = struct{}{}
		return true
	case "approval/decided":
		id, ok := parseApprovalDecided(data)
		if !ok {
			return false
		}
		delete(state.approvals, id)
		return true
	case "turn/end":
		turn, kind, ok := parseTurnEnd(data)
		if !ok || state.openTurn == nil || *state.openTurn != turn {
			return false
		}
		state.openTurn, state.terminalKind = nil, kind
		state.isTerminal = state.status != "idle"
		state.approvals = make(map[string]struct{})
		return true
	}
	return false
}

func projectDSHNotification(state *dshNotificationState, route dshRoute, update dsh.SessionUpdate) []dshNotificationProjection {
	if !applyDSHUpdate(state, update) {
		return nil
	}
	return transitionDSHNotification(state, route, false)
}

func projectDSHSnapshot(state *dshNotificationState, route dshRoute, events []dsh.SessionEvent) []dshNotificationProjection {
	for _, event := range events {
		applyDSHUpdate(state, dsh.SessionUpdate{Event: &event})
	}
	consumeDSHSnapshotTerminalEffect(state, route)
	return transitionDSHNotification(state, route, true)
}

func consumeDSHSnapshotTerminalEffect(state *dshNotificationState, route dshRoute) {
	eventType := ""
	if state.terminalKind == "completed" {
		eventType = "run-finished"
	}
	if state.terminalKind == "error" {
		eventType = "run-failed"
	}
	if eventType != "" {
		state.emittedEffects[dshProjectionID(route, state.lastSeq, eventType)] = struct{}{}
	}
	if state.terminalKind != "" {
		state.isTerminal = false
	}
}

func clearDSHNotificationState(state *dshNotificationState, route dshRoute) []dshNotificationProjection {
	if state.observer == "" || state.observer == "stop" {
		return nil
	}
	state.observer = "stop"
	return []dshNotificationProjection{{observer: "stop", silent: true, id: "dsh:" + route.sessionID + ":" + route.instanceID + ":unavailable"}}
}

func transitionDSHNotification(state *dshNotificationState, route dshRoute, isSnapshot bool) []dshNotificationProjection {
	observer, eventType, silent := "stop", "", true
	if state.terminalKind == "" && len(state.approvals) > 0 {
		observer, eventType, silent = "wait_input", "pending-question", false
	} else if state.terminalKind == "" && state.status == "running" {
		observer = "start"
	}
	projections := make([]dshNotificationProjection, 0, 2)
	if isSnapshot && observer != "wait_input" {
		return projections
	}
	if state.observer != observer {
		initialStop := state.observer == "" && observer == "stop"
		state.observer = observer
		if !initialStop {
			projections = append(projections, dshNotificationProjection{observer: observer, eventType: eventType, silent: silent, id: dshProjectionID(route, state.lastSeq, eventType)})
		}
	}
	if isSnapshot {
		return projections
	}
	terminalEffect := ""
	if state.terminalKind == "completed" {
		terminalEffect = "run-finished"
	}
	if state.terminalKind == "error" {
		terminalEffect = "run-failed"
	}
	if terminalEffect == "" {
		return projections
	}
	effectID := dshProjectionID(route, state.lastSeq, terminalEffect)
	if _, emitted := state.emittedEffects[effectID]; !emitted {
		state.emittedEffects[effectID] = struct{}{}
		projections = append(projections, dshNotificationProjection{observer: "stop", eventType: terminalEffect, silent: false, id: effectID})
	}
	return projections
}

func dshProjectionID(route dshRoute, sequence int64, eventType string) string {
	return fmt.Sprintf("dsh:%s:%s:%d:%s", route.sessionID, route.instanceID, sequence, eventType)
}

func (s *Service) projectDSHSnapshot(entry *dshLiveSession, binding dshSubscriptionBinding, events []dsh.SessionEvent) {
	s.dshNotificationMu.Lock()
	defer s.dshNotificationMu.Unlock()
	if route, found := s.dshSessions.route(entry, binding.generation); found {
		s.projectDSHSnapshotLocked(route, events)
	}
}

func (s *Service) projectDSHSnapshotLocked(route dshRoute, events []dsh.SessionEvent) {
	state, found := s.dshSessions.notificationState(route)
	if !found {
		return
	}
	for _, projection := range projectDSHSnapshot(state, route, events) {
		s.publishDSHNotification(route, projection)
	}
}

func (s *Service) projectDSHUpdate(route dshRoute, update dsh.SessionUpdate) bool {
	s.dshNotificationMu.Lock()
	defer s.dshNotificationMu.Unlock()
	return s.projectDSHUpdateLocked(route, update)
}

func (s *Service) projectDSHUpdateLocked(route dshRoute, update dsh.SessionUpdate) bool {
	state, found := s.dshSessions.notificationState(route)
	if !found {
		return false
	}
	for _, projection := range projectDSHNotification(state, route, update) {
		s.publishDSHNotification(route, projection)
	}
	return true
}

func (s *Service) clearDSHNotificationStateLocked(route dshRoute) {
	state, found := s.dshSessions.notificationState(route)
	if !found {
		return
	}
	for _, projection := range clearDSHNotificationState(state, route) {
		s.publishDSHNotification(route, projection)
	}
}

func (s *Service) clearDSHNotificationStateForEntryLocked(entry *dshLiveSession, route dshRoute) {
	for _, projection := range clearDSHNotificationState(&entry.notification, route) {
		s.publishDSHNotification(route, projection)
	}
}

func (s *Service) rebindDSHNotificationSession(entry *dshLiveSession, connection *rpc.Connection, subscription dsh.SessionSubscription) (dshSubscriptionBinding, bool, bool) {
	s.dshNotificationMu.Lock()
	defer s.dshNotificationMu.Unlock()
	binding, oldRoute, instanceChanged, rebound := s.dshSessions.rebind(entry, connection, subscription)
	generation := binding.generation
	if !rebound {
		return dshSubscriptionBinding{}, false, false
	}
	if instanceChanged {
		s.clearDSHNotificationStateForEntryLocked(entry, oldRoute)
		s.dshSessions.resetNotificationState(entry)
	}
	if route, found := s.dshSessions.route(entry, generation); found {
		s.projectDSHSnapshotLocked(route, subscription.Snapshot.Events)
	}
	return binding, instanceChanged, true
}

func (s *Service) resetDSHNotificationRoute(entry *dshLiveSession, generation uint64, instanceID string) (dshRoute, bool) {
	s.dshNotificationMu.Lock()
	defer s.dshNotificationMu.Unlock()
	route, oldRoute, reset := s.dshSessions.resetRoute(entry, generation, instanceID)
	if reset {
		s.clearDSHNotificationStateForEntryLocked(entry, oldRoute)
		s.dshSessions.resetNotificationState(entry)
	}
	return route, reset
}

func (s *Service) markDSHNotificationUnavailable(entry *dshLiveSession, generation uint64) {
	s.dshNotificationMu.Lock()
	defer s.dshNotificationMu.Unlock()
	if route, unavailable := s.dshSessions.markUnavailable(entry, generation); unavailable {
		s.clearDSHNotificationStateLocked(route)
		s.dshSessions.resetNotificationState(entry)
	}
}

func (s *Service) removeDSHNotificationSession(entry *dshLiveSession) bool {
	s.dshNotificationMu.Lock()
	defer s.dshNotificationMu.Unlock()
	route, removed := s.dshSessions.remove(entry)
	if removed {
		for _, projection := range clearDSHNotificationState(&entry.notification, route) {
			s.publishDSHNotification(route, projection)
		}
		entry.notification = newDSHNotificationState()
	}
	return removed
}
