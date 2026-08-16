package workspace

import (
	"context"
	"encoding/json"
	"github.com/gorilla/websocket"
	"net/http"
	"net/http/httptest"
	"testing"
	"yishan/apps/cli/internal/adapter/relay"
	internalevents "yishan/apps/cli/internal/events"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
)

func wireRelayCapture(t *testing.T, s *Service, result map[string]any) <-chan map[string]any {
	t.Helper()
	received := make(chan map[string]any, 16)
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()
		var msg map[string]any
		if err := conn.ReadJSON(&msg); err != nil {
			return
		}
		received <- msg
		_ = conn.WriteJSON(map[string]any{"jsonrpc": "2.0", "id": msg["id"], "result": result})
	}))
	t.Cleanup(server.Close)

	client := relay.NewClient(relay.ClientConfig{
		Runtime:     nil,
		NodeID:      s.deps.NodeID,
		URL:         server.URL,
		StaticToken: "test-token",
		Server:      rpc.NewServer(noopRPCHandler{}),
		Handler:     s,
		Events:      s.deps.Events,
	})
	s.relayClient = client
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	go client.Run(ctx)
	waitForRelayConnected(t, client)
	return received
}

func decodeRelayCreateEnvelope(t *testing.T, msg map[string]any) relay.CreateEnvelope {
	t.Helper()
	params, ok := msg["params"].(map[string]any)
	if !ok {
		t.Fatalf("relay message params = %T, want map (%v)", msg["params"], msg)
	}
	raw, err := json.Marshal(params)
	if err != nil {
		t.Fatalf("marshal relay params: %v", err)
	}
	var envelope relay.CreateEnvelope
	if err := json.Unmarshal(raw, &envelope); err != nil {
		t.Fatalf("decode relay create envelope: %v", err)
	}
	return envelope
}

func decodeRelayCloseEnvelope(t *testing.T, msg map[string]any) relayWorkspaceCloseEnvelope {
	t.Helper()
	params, ok := msg["params"].(map[string]any)
	if !ok {
		t.Fatalf("relay message params = %T, want map (%v)", msg["params"], msg)
	}
	raw, err := json.Marshal(params)
	if err != nil {
		t.Fatalf("marshal relay params: %v", err)
	}
	var envelope relayWorkspaceCloseEnvelope
	if err := json.Unmarshal(raw, &envelope); err != nil {
		t.Fatalf("decode relay close envelope: %v", err)
	}
	return envelope
}

func decodeCreateStartedEvent(t *testing.T, event internalevents.Event) workspaceCreateStartedEvent {
	t.Helper()
	started, ok := event.Payload.(workspaceCreateStartedEvent)
	if !ok {
		t.Fatalf("workspaceCreateStarted payload = %T, want workspaceCreateStartedEvent", event.Payload)
	}
	return started
}

func decodeProgressEvents(t *testing.T, events []internalevents.Event) []workspace.CreateProgressEvent {
	t.Helper()
	var progress []workspace.CreateProgressEvent
	for _, event := range events {
		if event.Topic != "workspaceCreateProgress" {
			continue
		}
		progressEvent, ok := event.Payload.(workspace.CreateProgressEvent)
		if !ok {
			t.Fatalf("workspaceCreateProgress payload = %T, want workspace.CreateProgressEvent", event.Payload)
		}
		progress = append(progress, progressEvent)
	}
	return progress
}

func progressStepSequence(progress []workspace.CreateProgressEvent) []string {
	out := make([]string, 0, len(progress))
	for _, event := range progress {
		out = append(out, event.StepID+":"+string(event.Status))
	}
	return out
}

// newBehaviorHandler builds a handler with the given runtime and node. When
// database is non-nil it is attached directly (bypassing SetLocalDatabase so
// no token-usage collector is wired into the test).
