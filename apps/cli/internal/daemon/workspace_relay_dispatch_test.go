package daemon

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"yishan/apps/cli/internal/relay"
)

// relayVerdictTestServer upgrades to a WebSocket, reads one request, and replies
// with the given routing verdict result (echoing the request id).
func relayVerdictTestServer(t *testing.T, result map[string]any) *httptest.Server {
	t.Helper()
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()
		var req map[string]any
		if err := conn.ReadJSON(&req); err != nil {
			return
		}
		_ = conn.WriteJSON(map[string]any{"jsonrpc": "2.0", "id": req["id"], "result": result})
	}))
	t.Cleanup(server.Close)
	return server
}

// wireRelayReader runs a real relay client against a verdict test server so
// dispatch responses are resolved through the production read loop.
func wireRelayReader(t *testing.T, h *JSONRPCHandler, result map[string]any) {
	t.Helper()
	server := relayVerdictTestServer(t, result)
	client := relay.NewClient(relay.ClientConfig{
		Runtime:     nil,
		NodeID:      "node-1",
		URL:         server.URL,
		StaticToken: "test-token",
		Server:      h.rpcServer,
		Handler:     h,
		Events:      h.events,
	})
	h.relayClient = client
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	go client.Run(ctx)
	waitForRelayConnected(t, client)
}

func waitForRelayConnected(t *testing.T, client *relay.Client) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if client.Status().Snapshot().Connected {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("relay client did not connect to test server")
}

func TestSendRelayDispatchRequest_RejectedWhenTargetOffline(t *testing.T) {
	h := newTestHandler(t)
	wireRelayReader(t, h, map[string]any{"accepted": false, "reason": "target node offline"})

	err := h.relayClient.SendDispatchRequest(
		map[string]any{"change": "workspace.close.request", "targetNodeId": "node-2"}, "node-2")
	if err == nil || !strings.Contains(err.Error(), "offline") {
		t.Fatalf("expected offline rejection error, got %v", err)
	}
}

func TestSendRelayDispatchRequest_AcceptedWhenTargetOnline(t *testing.T) {
	h := newTestHandler(t)
	wireRelayReader(t, h, map[string]any{"accepted": true})

	if err := h.relayClient.SendDispatchRequest(
		map[string]any{"change": "workspace.close.request", "targetNodeId": "node-2"}, "node-2"); err != nil {
		t.Fatalf("expected accepted dispatch, got %v", err)
	}
}
