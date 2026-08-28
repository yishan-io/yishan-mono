package agent

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"yishan/apps/cli/internal/agent/dsh"
)

func TestDSHExecution_ForwardsLifecycleAndResyncUnchanged(t *testing.T) {
	runtime := &executionDSH{subscribeIncarnation: "inc-1"}
	service := newDSHExecutionService(runtime)
	connection, client := newTestWSConnState(t)
	startDSHExecutionOnConnection(t, service, connection)

	runtime.mu.Lock()
	updates := runtime.subscriptions[0]
	runtime.mu.Unlock()
	updates <- dsh.SessionUpdate{Lifecycle: &dsh.SubagentLifecycle{
		Version: 1, ParentSessionID: "s", Incarnation: "inc-1", Revision: 7,
		Event: "started", RunID: "run-1", ChildSessionID: "child-1", Provider: "pi", Local: true,
	}}
	updates <- dsh.SessionUpdate{LifecycleResync: &dsh.LifecycleResync{ParentSessionID: "s", Incarnation: "inc-1", Revision: 7}}

	assertDSHForwardedUpdate(t, client, "inc-1", `{"lifecycle":{"version":1,"parentSessionId":"s","incarnation":"inc-1","revision":7,"event":"started","runId":"run-1","childSessionId":"child-1","provider":"pi","local":true}}`)
	assertDSHForwardedUpdate(t, client, "inc-1", `{"lifecycleResync":{"parentSessionId":"s","incarnation":"inc-1","revision":7}}`)
	entry, found := service.dshSessions.getOwned("s", "w", "/authoritative")
	if !found || service.dshSessions.requiresResume(entry) {
		t.Fatal("lifecycle update changed DSH availability")
	}
}

func TestDSHExecution_LifecycleForwardingIsolatesStaleRouteGeneration(t *testing.T) {
	runtime := &executionDSH{subscribeIncarnation: "inc-1"}
	service := newDSHExecutionService(runtime)
	oldConnection, oldClient := newTestWSConnState(t)
	startDSHExecutionOnConnection(t, service, oldConnection)
	newConnection, newClient := newTestWSConnState(t)
	if _, err := service.AgentAttach(context.Background(), newConnection, dshAttachRequest(-1)); err != nil {
		t.Fatalf("attach: %v", err)
	}

	entry, found := service.dshSessions.getOwned("s", "w", "/authoritative")
	if !found {
		t.Fatal("missing DSH session")
	}
	staleUpdates := make(chan dsh.SessionUpdate, 1)
	staleUpdates <- dsh.SessionUpdate{Lifecycle: &dsh.SubagentLifecycle{Version: 1, ParentSessionID: "s", Incarnation: "inc-1", Revision: 8, Event: "started", RunID: "stale", ChildSessionID: "child", Provider: "pi", Local: true}}
	close(staleUpdates)
	service.forwardDSHUpdates(entry, 1, staleUpdates)

	assertNoDSHForwardedUpdate(t, oldClient)

	runtime.mu.Lock()
	updates := runtime.subscriptions[1]
	runtime.mu.Unlock()
	updates <- dsh.SessionUpdate{LifecycleResync: &dsh.LifecycleResync{ParentSessionID: "s", Incarnation: "inc-1", Revision: 8}}
	assertDSHForwardedUpdate(t, newClient, "inc-1", `{"lifecycleResync":{"parentSessionId":"s","incarnation":"inc-1","revision":8}}`)
}

func assertDSHForwardedUpdate(t *testing.T, client interface {
	SetReadDeadline(time.Time) error
	ReadJSON(any) error
}, wantIncarnation, wantUpdate string) {
	t.Helper()
	if err := client.SetReadDeadline(time.Now().Add(time.Second)); err != nil {
		t.Fatalf("set read deadline: %v", err)
	}
	var notification struct {
		Params struct {
			Topic   string `json:"topic"`
			Payload struct {
				SessionID   string          `json:"sessionId"`
				TabID       string          `json:"tabId"`
				WorkspaceID string          `json:"workspaceId"`
				Incarnation string          `json:"incarnation"`
				Update      json.RawMessage `json:"update"`
			} `json:"payload"`
		} `json:"params"`
	}
	if err := client.ReadJSON(&notification); err != nil {
		t.Fatalf("read lifecycle notification: %v", err)
	}
	if notification.Params.Topic != dshEventTopic || notification.Params.Payload.SessionID != "s" || notification.Params.Payload.TabID != "tab" || notification.Params.Payload.WorkspaceID != "w" || notification.Params.Payload.Incarnation != wantIncarnation {
		t.Fatalf("notification envelope = %#v", notification.Params)
	}
	if string(notification.Params.Payload.Update) != wantUpdate {
		t.Fatalf("update = %s, want %s", notification.Params.Payload.Update, wantUpdate)
	}
}

func assertNoDSHForwardedUpdate(t *testing.T, client interface {
	SetReadDeadline(time.Time) error
	ReadJSON(any) error
}) {
	t.Helper()
	if err := client.SetReadDeadline(time.Now().Add(30 * time.Millisecond)); err != nil {
		t.Fatalf("set read deadline: %v", err)
	}
	var notification any
	if err := client.ReadJSON(&notification); err == nil {
		t.Fatalf("unexpected lifecycle notification: %#v", notification)
	}
}
