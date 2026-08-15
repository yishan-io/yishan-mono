package daemon

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gorilla/websocket"
	"yishan/apps/cli/internal/rpc"
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

// wireRelayReader connects the handler's relayConn to a verdict test server and
// runs a reader goroutine that resolves dispatch responses the same way the
// real relay client read loop does.
func wireRelayReader(t *testing.T, h *JSONRPCHandler, result map[string]any) {
	t.Helper()
	server := relayVerdictTestServer(t, result)
	dialer := websocket.Dialer{}
	conn, _, err := dialer.Dial("ws"+strings.TrimPrefix(server.URL, "http"), nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	h.relayConn = rpc.NewConnection(conn)

	go func() {
		for {
			var msg struct {
				ID     json.RawMessage `json:"id"`
				Result json.RawMessage `json:"result"`
			}
			if err := conn.ReadJSON(&msg); err != nil {
				return
			}
			handleRelayDispatchResponse(h, msg.ID, msg.Result)
		}
	}()
}

func TestSendRelayDispatchRequest_RejectedWhenTargetOffline(t *testing.T) {
	h := newTestHandler(t)
	wireRelayReader(t, h, map[string]any{"accepted": false, "reason": "target node offline"})

	err := h.sendRelayDispatchRequest(
		map[string]any{"change": "workspace.close.request", "targetNodeId": "node-2"}, "node-2")
	if err == nil || !strings.Contains(err.Error(), "offline") {
		t.Fatalf("expected offline rejection error, got %v", err)
	}
}

func TestSendRelayDispatchRequest_AcceptedWhenTargetOnline(t *testing.T) {
	h := newTestHandler(t)
	wireRelayReader(t, h, map[string]any{"accepted": true})

	if err := h.sendRelayDispatchRequest(
		map[string]any{"change": "workspace.close.request", "targetNodeId": "node-2"}, "node-2"); err != nil {
		t.Fatalf("expected accepted dispatch, got %v", err)
	}
}
