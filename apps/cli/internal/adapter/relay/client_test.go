package relay

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	"yishan/apps/cli/internal/events"
	"yishan/apps/cli/internal/rpc"
)

func TestClient_Run_NotifiesOnEachSuccessfulConnection(t *testing.T) {
	upgrader := websocket.Upgrader{CheckOrigin: func(_ *http.Request) bool { return true }}
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		conn, err := upgrader.Upgrade(writer, request, nil)
		if err != nil {
			t.Errorf("upgrade relay connection: %v", err)
			return
		}
		_ = conn.Close() // force the client to reconnect
	}))
	defer server.Close()

	connected := make(chan context.Context, 2)
	client := NewClient(ClientConfig{
		URL:         "ws" + strings.TrimPrefix(server.URL, "http"),
		StaticToken: "test-token",
		Server:      rpc.NewServer(rpc.HandlerFunc(func(context.Context, *rpc.Connection, string, json.RawMessage) (any, error) { return nil, nil })),
		Events:      eventbus.NewHub(),
		OnConnected: func(ctx context.Context) { connected <- ctx },
	})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	var run sync.WaitGroup
	run.Add(1)
	go func() {
		defer run.Done()
		client.Run(ctx)
	}()

	for range 2 {
		select {
		case callbackCtx := <-connected:
			if callbackCtx != ctx {
				t.Fatal("OnConnected received a context other than Run context")
			}
		case <-time.After(2 * time.Second):
			t.Fatal("OnConnected was not called for successful relay connections")
		}
	}
	cancel()
	run.Wait()
}

type blockingScheduleHandler struct {
	started chan context.Context
	release <-chan struct{}
}

func (h blockingScheduleHandler) HandleRelayMessage(ctx context.Context, _ *rpc.Connection, _ string, method string, _ json.RawMessage) bool {
	if method != MethodJobScheduleChanged {
		return false
	}
	go func() {
		h.started <- ctx
		select {
		case <-h.release:
		case <-ctx.Done():
		}
	}()
	return true
}

func TestClient_Run_ScheduleRefreshDoesNotStallPingAndStopsOnCancellation(t *testing.T) {
	upgrader := websocket.Upgrader{CheckOrigin: func(_ *http.Request) bool { return true }}
	pong := make(chan struct{}, 1)
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		conn, err := upgrader.Upgrade(writer, request, nil)
		if err != nil {
			t.Errorf("upgrade relay connection: %v", err)
			return
		}
		defer conn.Close()
		if err := conn.WriteJSON(rpc.Notification{JSONRPC: "2.0", Method: MethodJobScheduleChanged}); err != nil {
			t.Errorf("write schedule notification: %v", err)
			return
		}
		if err := conn.WriteJSON(rpc.Notification{JSONRPC: "2.0", Method: MethodPing}); err != nil {
			t.Errorf("write ping: %v", err)
			return
		}
		_ = conn.SetReadDeadline(time.Now().Add(time.Second))
		var response rpc.Notification
		if err := conn.ReadJSON(&response); err != nil {
			t.Errorf("read pong: %v", err)
			return
		}
		if response.Method != MethodPong {
			t.Errorf("method = %q, want %q", response.Method, MethodPong)
			return
		}
		pong <- struct{}{}
	}))
	defer server.Close()

	releaseRefresh := make(chan struct{})
	handler := blockingScheduleHandler{started: make(chan context.Context, 1), release: releaseRefresh}
	client := NewClient(ClientConfig{
		URL:         "ws" + strings.TrimPrefix(server.URL, "http"),
		StaticToken: "test-token",
		Server:      rpc.NewServer(rpc.HandlerFunc(func(context.Context, *rpc.Connection, string, json.RawMessage) (any, error) { return nil, nil })),
		Handler:     handler,
		Events:      eventbus.NewHub(),
	})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go client.Run(ctx)

	select {
	case callbackCtx := <-handler.started:
		if callbackCtx != ctx {
			t.Fatal("schedule refresh received a context other than Run context")
		}
	case <-time.After(time.Second):
		t.Fatal("schedule refresh did not start")
	}
	select {
	case <-pong:
	case <-time.After(time.Second):
		t.Fatal("blocking schedule refresh stalled relay ping")
	}
	close(releaseRefresh)
	cancel()
}

func TestClient_Run_CancellationClosesIdlePeer(t *testing.T) {
	upgrader := websocket.Upgrader{CheckOrigin: func(_ *http.Request) bool { return true }}
	peerConnected := make(chan struct{}, 1)
	peerClosed := make(chan struct{}, 1)
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		conn, err := upgrader.Upgrade(writer, request, nil)
		if err != nil {
			t.Errorf("upgrade relay connection: %v", err)
			return
		}
		defer conn.Close()
		peerConnected <- struct{}{}
		_, _, _ = conn.ReadMessage()
		peerClosed <- struct{}{}
	}))
	defer server.Close()

	client := NewClient(ClientConfig{
		URL:         "ws" + strings.TrimPrefix(server.URL, "http"),
		StaticToken: "test-token",
		Server:      rpc.NewServer(rpc.HandlerFunc(func(context.Context, *rpc.Connection, string, json.RawMessage) (any, error) { return nil, nil })),
		Events:      eventbus.NewHub(),
	})
	ctx, cancel := context.WithCancel(context.Background())
	runDone := make(chan struct{})
	go func() {
		client.Run(ctx)
		close(runDone)
	}()

	select {
	case <-peerConnected:
	case <-time.After(time.Second):
		t.Fatal("relay peer was not connected")
	}
	cancel()

	select {
	case <-runDone:
	case <-time.After(time.Second):
		t.Fatal("client Run did not return after cancellation")
	}
	select {
	case <-peerClosed:
	case <-time.After(time.Second):
		t.Fatal("idle relay peer was not closed after cancellation")
	}
}
