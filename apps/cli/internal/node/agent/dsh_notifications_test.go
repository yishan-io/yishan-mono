package agent

import (
	"encoding/json"
	"fmt"
	"testing"

	"yishan/apps/cli/internal/agent/dsh"
	"yishan/apps/cli/internal/events"
	"yishan/apps/cli/internal/rpc"
)

func TestDSHNotificationState_ApprovalThenTerminalProjectsOrderedEffects(t *testing.T) {
	state := newDSHNotificationState()
	route := dshRoute{sessionID: "s", workspaceID: "w", tabID: "tab", paneID: "pane", instanceID: "i", generation: 1}
	start := dsh.SessionUpdate{Event: &dsh.SessionEvent{SessionID: "s", Seq: 1, Event: json.RawMessage(`{"type":"turn/start","data":{"turn":0}}`)}}
	projectDSHNotification(&state, route, start)
	asked := dsh.SessionUpdate{Event: &dsh.SessionEvent{SessionID: "s", Seq: 2, Event: json.RawMessage(`{"type":"approval/asked","data":{"id":"a","toolName":"shell"}}`)}}
	if got := projectDSHNotification(&state, route, asked); len(got) != 1 || got[0].observer != "wait_input" || got[0].eventType != "pending-question" {
		t.Fatalf("asked = %#v", got)
	}
	if got := projectDSHNotification(&state, route, dsh.SessionUpdate{Status: &dsh.SessionStatus{SessionID: "s", Status: "running"}}); len(got) != 0 {
		t.Fatalf("running over approval = %#v", got)
	}
	terminal := dsh.SessionUpdate{Event: &dsh.SessionEvent{SessionID: "s", Seq: 3, Event: json.RawMessage(`{"type":"turn/end","data":{"turn":0,"reason":{"kind":"completed"}}}`)}}
	if got := projectDSHNotification(&state, route, terminal); len(got) != 2 || got[0].observer != "stop" || got[1].eventType != "run-finished" {
		t.Fatalf("terminal = %#v", got)
	}
	if got := projectDSHNotification(&state, route, dsh.SessionUpdate{Status: &dsh.SessionStatus{SessionID: "s", Status: "running"}}); len(got) != 0 {
		t.Fatalf("delayed running = %#v", got)
	}
}

func TestDSHNotificationState_ApprovalDecisionRestoresKnownStatus(t *testing.T) {
	for _, status := range []string{"running", "idle"} {
		state := newDSHNotificationState()
		route := dshRoute{sessionID: status, instanceID: "i", generation: 1}
		projectDSHNotification(&state, route, dsh.SessionUpdate{Event: &dsh.SessionEvent{Seq: 1, Event: json.RawMessage(`{"type":"turn/start","data":{"turn":0}}`)}})
		projectDSHNotification(&state, route, dsh.SessionUpdate{Status: &dsh.SessionStatus{Status: status}})
		projectDSHNotification(&state, route, dsh.SessionUpdate{Event: &dsh.SessionEvent{Seq: 2, Event: json.RawMessage(`{"type":"approval/asked","data":{"id":"a","toolName":"shell"}}`)}})
		got := projectDSHNotification(&state, route, dsh.SessionUpdate{Event: &dsh.SessionEvent{Seq: 3, Event: json.RawMessage(`{"type":"approval/decided","data":{"id":"a","outcome":"allowed-once"}}`)}})
		want := "stop"
		if status == "running" {
			want = "start"
		}
		if len(got) != 1 || got[0].observer != want || got[0].eventType != "" {
			t.Fatalf("decision after %s = %#v", status, got)
		}
	}
}

func TestDSHNotificationState_NonSuccessTurnReasonsStopSilently(t *testing.T) {
	reasons := []string{
		`{"kind":"blocked"}`,
		`{"kind":"max-tokens"}`,
		`{"kind":"interrupted"}`,
		`{"kind":"aborted","reason":{"kind":"user"}}`,
	}
	for index, reason := range reasons {
		state := newDSHNotificationState()
		route := dshRoute{sessionID: fmt.Sprintf("s-%d", index), instanceID: "i", generation: 1}
		projectDSHNotification(&state, route, dsh.SessionUpdate{Event: &dsh.SessionEvent{Seq: 1, Event: json.RawMessage(`{"type":"turn/start","data":{"turn":0}}`)}})
		projectDSHNotification(&state, route, dsh.SessionUpdate{Status: &dsh.SessionStatus{Status: "running"}})
		raw := json.RawMessage(fmt.Sprintf(`{"type":"turn/end","data":{"turn":0,"reason":%s}}`, reason))
		got := projectDSHNotification(&state, route, dsh.SessionUpdate{Event: &dsh.SessionEvent{Seq: 2, Event: raw}})
		if len(got) != 1 || got[0].observer != "stop" || got[0].eventType != "" || !got[0].silent {
			t.Fatalf("reason %s = %#v", reason, got)
		}
	}
}

func TestDSHNotificationState_SnapshotReconcilesOpenApprovalOnly(t *testing.T) {
	state := newDSHNotificationState()
	route := dshRoute{sessionID: "s", workspaceID: "w", tabID: "t", paneID: "p", instanceID: "i", generation: 1}
	snapshot := []dsh.SessionEvent{{SessionID: "s", Seq: 1, Event: json.RawMessage(`{"type":"turn/start","data":{"turn":0}}`)}, {SessionID: "s", Seq: 2, Event: json.RawMessage(`{"type":"approval/asked","data":{"id":"a","toolName":"shell"}}`)}}
	got := projectDSHSnapshot(&state, route, snapshot)
	if len(got) != 1 || got[0].observer != "wait_input" || got[0].eventType != "pending-question" {
		t.Fatalf("snapshot approval=%#v", got)
	}
	if got := projectDSHNotification(&state, route, dsh.SessionUpdate{Status: &dsh.SessionStatus{SessionID: "s", Status: "running"}}); len(got) != 0 {
		t.Fatalf("overlap=%#v", got)
	}
}

func TestDSHNotificationState_SnapshotDoesNotReplayTerminal(t *testing.T) {
	state := newDSHNotificationState()
	route := dshRoute{sessionID: "s", workspaceID: "w", tabID: "t", paneID: "s", instanceID: "i", generation: 1}
	events := []dsh.SessionEvent{
		{SessionID: "s", Seq: 1, Event: json.RawMessage(`{"type":"turn/start","data":{"turn":0}}`)},
		{SessionID: "s", Seq: 2, Event: json.RawMessage(`{"type":"turn/end","data":{"turn":0,"reason":{"kind":"error","error":{"message":"failed","code":"UNKNOWN"}}}}`)},
	}
	if got := projectDSHSnapshot(&state, route, events); len(got) != 0 {
		t.Fatalf("snapshot = %#v", got)
	}
	if got := projectDSHNotification(&state, route, dsh.SessionUpdate{Status: &dsh.SessionStatus{Status: "idle"}}); len(got) != 0 {
		t.Fatalf("initial idle replayed terminal effect = %#v", got)
	}
	state = newDSHNotificationState()
	projectDSHSnapshot(&state, route, events)
	got := projectDSHNotification(&state, route, dsh.SessionUpdate{Status: &dsh.SessionStatus{Status: "running"}})
	if len(got) != 1 || got[0].observer != "start" || got[0].eventType != "" {
		t.Fatalf("current running after terminal snapshot = %#v", got)
	}
}

func TestDSHNotificationProjection_PublishesTrustedPaneFallback(t *testing.T) {
	runtime := &executionDSH{}
	service := newDSHExecutionService(runtime)
	service.deps.Events = eventbus.NewHub()
	_, events := service.deps.Events.Subscribe()
	startDSHExecution(t, service)
	runtime.mu.Lock()
	updates := runtime.subscriptions[0]
	runtime.mu.Unlock()
	updates <- dsh.SessionUpdate{Status: &dsh.SessionStatus{SessionID: "s", Status: "running"}}
	event := <-events
	payload, ok := event.Payload.(map[string]any)
	if !ok {
		t.Fatalf("payload=%T", event.Payload)
	}
	observer := payload["observerStatus"].(map[string]string)
	if event.Topic != "notificationEvent" || observer["sessionKey"] != "w:tab:s" || observer["normalizedEventType"] != "start" || payload["silent"] != true || payload["id"] != "dsh:s::-1:" || payload["title"] != "Run Started" || payload["tone"] != "success" || payload["body"] == "" {
		t.Fatalf("event=%#v", event)
	}
}

func TestDSHNotificationState_InitialIdleDoesNotEmitFalseStop(t *testing.T) {
	state := newDSHNotificationState()
	route := dshRoute{sessionID: "s", instanceID: "i", generation: 1}
	if got := projectDSHNotification(&state, route, dsh.SessionUpdate{Status: &dsh.SessionStatus{Status: "idle"}}); len(got) != 0 {
		t.Fatalf("initial idle = %#v", got)
	}
	got := projectDSHNotification(&state, route, dsh.SessionUpdate{Status: &dsh.SessionStatus{Status: "running"}})
	if len(got) != 1 || got[0].observer != "start" {
		t.Fatalf("running = %#v", got)
	}
}

func TestDSHNotificationState_IdleBeforeTerminalEmitsEffectOnce(t *testing.T) {
	state := newDSHNotificationState()
	route := dshRoute{sessionID: "s", instanceID: "i", generation: 1}
	projectDSHNotification(&state, route, dsh.SessionUpdate{Status: &dsh.SessionStatus{Status: "running"}})
	projectDSHNotification(&state, route, dsh.SessionUpdate{Status: &dsh.SessionStatus{Status: "idle"}})
	projectDSHNotification(&state, route, dsh.SessionUpdate{Event: &dsh.SessionEvent{Seq: 1, Event: json.RawMessage(`{"type":"turn/start","data":{"turn":0}}`)}})
	got := projectDSHNotification(&state, route, dsh.SessionUpdate{Event: &dsh.SessionEvent{Seq: 2, Event: json.RawMessage(`{"type":"turn/end","data":{"turn":0,"reason":{"kind":"error","error":{"message":"failed","code":"UNKNOWN"}}}}`)}})
	if len(got) != 1 || got[0].eventType != "run-failed" || got[0].observer != "stop" {
		t.Fatalf("terminal=%#v", got)
	}
	if got := projectDSHNotification(&state, route, dsh.SessionUpdate{Status: &dsh.SessionStatus{Status: "idle"}}); len(got) != 0 {
		t.Fatalf("duplicate stop=%#v", got)
	}
}

func TestDSHNotificationState_SnapshotResolvedAndOpenTurn(t *testing.T) {
	route := dshRoute{sessionID: "s", instanceID: "i", generation: 1}
	resolved := []dsh.SessionEvent{{Seq: 1, Event: json.RawMessage(`{"type":"turn/start","data":{"turn":0}}`)}, {Seq: 2, Event: json.RawMessage(`{"type":"approval/asked","data":{"id":"a","toolName":"tool"}}`)}, {Seq: 3, Event: json.RawMessage(`{"type":"approval/decided","data":{"id":"a","outcome":"rejected"}}`)}}
	if got := projectDSHSnapshot(&dshNotificationState{lastSeq: -1, approvals: make(map[string]struct{}), emittedEffects: make(map[string]struct{})}, route, resolved); len(got) != 0 {
		t.Fatalf("resolved snapshot=%#v", got)
	}
	openTurn := []dsh.SessionEvent{{Seq: 1, Event: json.RawMessage(`{"type":"turn/start","data":{"turn":0}}`)}, {Seq: 2, Event: json.RawMessage(`{"type":"turn/end","data":{"turn":0,"reason":{"kind":"completed"}}}`)}, {Seq: 3, Event: json.RawMessage(`{"type":"turn/start","data":{"turn":1}}`)}, {Seq: 4, Event: json.RawMessage(`{"type":"approval/asked","data":{"id":"a","toolName":"tool"}}`)}}
	got := projectDSHSnapshot(&dshNotificationState{lastSeq: -1, approvals: make(map[string]struct{}), emittedEffects: make(map[string]struct{})}, route, openTurn)
	if len(got) != 1 || got[0].eventType != "pending-question" {
		t.Fatalf("open snapshot=%#v", got)
	}
}

func TestDSHNotificationState_SnapshotResolutionWaitsForInitialStatus(t *testing.T) {
	state := newDSHNotificationState()
	route := dshRoute{sessionID: "s", instanceID: "i", generation: 1}
	projectDSHNotification(&state, route, dsh.SessionUpdate{Event: &dsh.SessionEvent{Seq: 1, Event: json.RawMessage(`{"type":"turn/start","data":{"turn":0}}`)}})
	projectDSHNotification(&state, route, dsh.SessionUpdate{Status: &dsh.SessionStatus{Status: "running"}})
	projectDSHNotification(&state, route, dsh.SessionUpdate{Event: &dsh.SessionEvent{Seq: 2, Event: json.RawMessage(`{"type":"approval/asked","data":{"id":"a","toolName":"shell"}}`)}})
	snapshot := []dsh.SessionEvent{
		{Seq: 1, Event: json.RawMessage(`{"type":"turn/start","data":{"turn":0}}`)},
		{Seq: 2, Event: json.RawMessage(`{"type":"approval/asked","data":{"id":"a","toolName":"shell"}}`)},
		{Seq: 3, Event: json.RawMessage(`{"type":"approval/decided","data":{"id":"a","outcome":"allowed-once"}}`)},
	}
	route.generation = 2
	if got := projectDSHSnapshot(&state, route, snapshot); len(got) != 0 {
		t.Fatalf("snapshot resolution = %#v", got)
	}
	got := projectDSHNotification(&state, route, dsh.SessionUpdate{Status: &dsh.SessionStatus{Status: "running"}})
	if len(got) != 1 || got[0].observer != "start" || got[0].eventType != "" {
		t.Fatalf("initial status reconciliation = %#v", got)
	}
}

func TestDSHNotificationState_IdleBeforeTerminalAllowsNextTurn(t *testing.T) {
	state := newDSHNotificationState()
	route := dshRoute{sessionID: "s", instanceID: "i", generation: 1}
	projectDSHNotification(&state, route, dsh.SessionUpdate{Event: &dsh.SessionEvent{Seq: 1, Event: json.RawMessage(`{"type":"turn/start","data":{"turn":0}}`)}})
	projectDSHNotification(&state, route, dsh.SessionUpdate{Status: &dsh.SessionStatus{Status: "running"}})
	projectDSHNotification(&state, route, dsh.SessionUpdate{Status: &dsh.SessionStatus{Status: "idle"}})
	got := projectDSHNotification(&state, route, dsh.SessionUpdate{Event: &dsh.SessionEvent{Seq: 2, Event: json.RawMessage(`{"type":"turn/end","data":{"turn":0,"reason":{"kind":"completed"}}}`)}})
	if len(got) != 1 || got[0].eventType != "run-finished" {
		t.Fatalf("terminal effect = %#v", got)
	}
	got = projectDSHNotification(&state, route, dsh.SessionUpdate{Status: &dsh.SessionStatus{Status: "running"}})
	if len(got) != 1 || got[0].observer != "start" {
		t.Fatalf("next turn running = %#v", got)
	}
}

func TestDSHNotificationState_NormalTerminalFencesDelayedRunningUntilIdle(t *testing.T) {
	state := newDSHNotificationState()
	route := dshRoute{sessionID: "s", instanceID: "i", generation: 1}
	projectDSHNotification(&state, route, dsh.SessionUpdate{Event: &dsh.SessionEvent{Seq: 1, Event: json.RawMessage(`{"type":"turn/start","data":{"turn":0}}`)}})
	projectDSHNotification(&state, route, dsh.SessionUpdate{Status: &dsh.SessionStatus{Status: "running"}})
	projectDSHNotification(&state, route, dsh.SessionUpdate{Event: &dsh.SessionEvent{Seq: 2, Event: json.RawMessage(`{"type":"turn/end","data":{"turn":0,"reason":{"kind":"completed"}}}`)}})
	if got := projectDSHNotification(&state, route, dsh.SessionUpdate{Status: &dsh.SessionStatus{Status: "running"}}); len(got) != 0 {
		t.Fatalf("delayed running = %#v", got)
	}
	projectDSHNotification(&state, route, dsh.SessionUpdate{Status: &dsh.SessionStatus{Status: "idle"}})
	got := projectDSHNotification(&state, route, dsh.SessionUpdate{Status: &dsh.SessionStatus{Status: "running"}})
	if len(got) != 1 || got[0].observer != "start" {
		t.Fatalf("running after idle = %#v", got)
	}
}

func TestDSHNotificationState_RebindPreservesSameInstanceState(t *testing.T) {
	state := newDSHNotificationState()
	route := dshRoute{sessionID: "s", instanceID: "i", generation: 1}
	events := []dsh.SessionEvent{
		{Seq: 1, Event: json.RawMessage(`{"type":"turn/start","data":{"turn":0}}`)},
		{Seq: 2, Event: json.RawMessage(`{"type":"approval/asked","data":{"id":"a","toolName":"shell","callId":"call","reason":"permission"}}`)},
	}
	if got := projectDSHSnapshot(&state, route, events); len(got) != 1 {
		t.Fatalf("initial snapshot = %#v", got)
	}
	route.generation = 2
	if got := projectDSHSnapshot(&state, route, events); len(got) != 0 {
		t.Fatalf("rebind replay = %#v", got)
	}
}

func TestDSHNotificationState_SameInstanceResetClearsAndAcceptsReusedSequence(t *testing.T) {
	service := NewService(Deps{})
	entry := &dshLiveSession{sessionID: "s", instanceID: "same", subscription: dsh.SessionSubscription{Updates: make(chan dsh.SessionUpdate)}}
	if _, registered := service.dshSessions.register(entry); !registered {
		t.Fatal("register DSH session")
	}
	route, found := service.dshSessions.route(entry, 1)
	if !found {
		t.Fatal("read DSH route")
	}
	service.projectDSHUpdate(route, dsh.SessionUpdate{Event: &dsh.SessionEvent{Seq: 100, Event: json.RawMessage(`{"type":"turn/start","data":{"turn":0}}`)}})
	service.projectDSHUpdate(route, dsh.SessionUpdate{Status: &dsh.SessionStatus{Status: "running"}})

	resetRoute, reset := service.resetDSHNotificationRoute(entry, 1, "same")
	if !reset {
		t.Fatal("reset same DSH instance")
	}
	got := projectDSHNotification(&entry.notification, resetRoute, dsh.SessionUpdate{Event: &dsh.SessionEvent{Seq: 1, Event: json.RawMessage(`{"type":"turn/start","data":{"turn":1}}`)}})
	if entry.notification.lastSeq != 1 || len(got) != 0 {
		t.Fatalf("state after same-instance reset = sequence %d, projections %#v", entry.notification.lastSeq, got)
	}
}

func TestDSHNotificationState_InstanceChangeClearsAndAcceptsReusedSequence(t *testing.T) {
	state := newDSHNotificationState()
	oldRoute := dshRoute{sessionID: "s", instanceID: "old", generation: 1}
	projectDSHNotification(&state, oldRoute, dsh.SessionUpdate{Status: &dsh.SessionStatus{Status: "running"}})
	cleared := clearDSHNotificationState(&state, oldRoute)
	if len(cleared) != 1 || cleared[0].observer != "stop" || !cleared[0].silent {
		t.Fatalf("instance clear = %#v", cleared)
	}
	state = newDSHNotificationState()
	newRoute := dshRoute{sessionID: "s", instanceID: "new", generation: 2}
	got := projectDSHNotification(&state, newRoute, dsh.SessionUpdate{Event: &dsh.SessionEvent{Seq: 1, Event: json.RawMessage(`{"type":"turn/start","data":{"turn":0}}`)}})
	if len(got) != 0 {
		t.Fatalf("new instance turn start = %#v", got)
	}
	got = projectDSHNotification(&state, newRoute, dsh.SessionUpdate{Status: &dsh.SessionStatus{Status: "running"}})
	if len(got) != 1 || got[0].observer != "start" {
		t.Fatalf("new instance running = %#v", got)
	}
}

func TestDSHNotificationState_DeduplicatesStatusesAndEvents(t *testing.T) {
	state := newDSHNotificationState()
	route := dshRoute{sessionID: "s", instanceID: "i", generation: 2}
	projectDSHNotification(&state, route, dsh.SessionUpdate{Status: &dsh.SessionStatus{Status: "running"}})
	if got := projectDSHNotification(&state, route, dsh.SessionUpdate{Status: &dsh.SessionStatus{Status: "running"}}); len(got) != 0 {
		t.Fatalf("duplicate status = %#v", got)
	}
	event := dsh.SessionUpdate{Event: &dsh.SessionEvent{Seq: 1, Event: json.RawMessage(`{"type":"turn/start","data":{"turn":0}}`)}}
	projectDSHNotification(&state, route, event)
	if got := projectDSHNotification(&state, route, event); len(got) != 0 {
		t.Fatalf("duplicate event = %#v", got)
	}
}

func TestDSHNotificationState_StaleInitialSnapshotCannotMutateReboundSession(t *testing.T) {
	service := NewService(Deps{})
	oldSubscription := dsh.SessionSubscription{
		InstanceID: "old",
		Updates:    make(chan dsh.SessionUpdate),
		Snapshot: dsh.SessionSubscribeResult{Events: []dsh.SessionEvent{{
			Seq:   10,
			Event: json.RawMessage(`{"type":"turn/start","data":{"turn":0}}`),
		}}},
	}
	entry := &dshLiveSession{sessionID: "s", instanceID: "old", subscription: oldSubscription}
	oldBinding, registered := service.dshSessions.register(entry)
	if !registered {
		t.Fatal("register DSH session")
	}
	if _, _, rebound := service.rebindDSHNotificationSession(entry, nil, dsh.SessionSubscription{InstanceID: "new", Updates: make(chan dsh.SessionUpdate)}); !rebound {
		t.Fatal("rebind DSH session")
	}

	service.projectDSHSnapshot(entry, oldBinding, oldSubscription.Snapshot.Events)

	if entry.notification.lastSeq != -1 {
		t.Fatalf("stale snapshot advanced current sequence to %d", entry.notification.lastSeq)
	}
}

func TestDSHNotificationState_InstanceRebindClearsActiveOldRoute(t *testing.T) {
	hub := eventbus.NewHub()
	_, events := hub.Subscribe()
	service := NewService(Deps{Events: hub})
	entry := &dshLiveSession{sessionID: "s", tabID: "tab", paneID: "pane", workspaceID: "w", instanceID: "old", available: true}
	if _, registered := service.dshSessions.register(entry); !registered {
		t.Fatal("register DSH session")
	}
	route, found := service.dshSessions.route(entry, 1)
	if !found {
		t.Fatal("route DSH session")
	}
	service.projectDSHUpdate(route, dsh.SessionUpdate{Status: &dsh.SessionStatus{Status: "running"}})
	if _, changed, rebound := service.rebindDSHNotificationSession(entry, nil, dsh.SessionSubscription{InstanceID: "new", Updates: make(chan dsh.SessionUpdate)}); !rebound || !changed {
		t.Fatalf("rebind = changed %t, rebound %t", changed, rebound)
	}
	for _, wantID := range []string{"dsh:s:old:-1:", "dsh:s:old:unavailable"} {
		event := <-events
		payload := event.Payload.(map[string]any)
		if payload["id"] != wantID {
			t.Fatalf("notification id = %q, want %q", payload["id"], wantID)
		}
	}
}

func TestDSHNotificationDelivery_RebindFencesPreviouslyValidatedRoute(t *testing.T) {
	hub := eventbus.NewHub()
	_, events := hub.Subscribe()
	service := NewService(Deps{Events: hub})
	oldConnection := &rpc.Connection{}
	entry := &dshLiveSession{sessionID: "s", workspaceID: "w", instanceID: "old", connection: oldConnection, subscription: dsh.SessionSubscription{Updates: make(chan dsh.SessionUpdate)}}
	if _, registered := service.dshSessions.register(entry); !registered {
		t.Fatal("register DSH session")
	}
	oldRoute, found := service.dshSessions.route(entry, 1)
	if !found {
		t.Fatal("read old route")
	}
	if _, _, rebound := service.rebindDSHNotificationSession(entry, &rpc.Connection{}, dsh.SessionSubscription{InstanceID: "old", Updates: make(chan dsh.SessionUpdate)}); !rebound {
		t.Fatal("rebind DSH session")
	}

	delivered, err := service.deliverDSHUpdate(entry, oldRoute, dsh.SessionUpdate{Status: &dsh.SessionStatus{Status: "running"}})
	if err != nil {
		t.Fatalf("deliver stale update: %v", err)
	}
	if delivered {
		t.Fatal("stale route delivered an update")
	}
	delivered, err = service.deliverDSHFrontendUpdate(entry, oldRoute.generation, dsh.SessionUpdate{Reset: &dsh.TranscriptReset{SessionID: "s", InstanceID: "old"}})
	if err != nil {
		t.Fatalf("deliver stale reset: %v", err)
	}
	if delivered {
		t.Fatal("stale route delivered a reset")
	}
	select {
	case event := <-events:
		t.Fatalf("stale route published %#v", event)
	default:
	}
}

func TestDSHNotificationProjection_RemovalFencesStaleRoute(t *testing.T) {
	hub := eventbus.NewHub()
	_, events := hub.Subscribe()
	service := NewService(Deps{Events: hub})
	entry := &dshLiveSession{sessionID: "s", tabID: "tab", paneID: "pane", workspaceID: "w", instanceID: "i", available: true}
	if _, registered := service.dshSessions.register(entry); !registered {
		t.Fatal("register DSH session")
	}
	route, found := service.dshSessions.route(entry, 1)
	if !found {
		t.Fatal("route DSH session")
	}
	service.projectDSHUpdate(route, dsh.SessionUpdate{Status: &dsh.SessionStatus{Status: "running"}})
	if !service.removeDSHNotificationSession(entry) {
		t.Fatal("remove DSH session")
	}
	service.projectDSHUpdate(route, dsh.SessionUpdate{Status: &dsh.SessionStatus{Status: "idle"}})
	for range 2 {
		<-events
	}
	select {
	case event := <-events:
		t.Fatalf("stale route published %#v", event)
	default:
	}
}
