package rpc

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	"yishan/apps/cli/internal/terminal"
)

func TestConnection_WriteFailureClosesConnection(t *testing.T) {
	for _, testCase := range []struct {
		name  string
		write func(*Connection) error
	}{
		{name: "JSON", write: func(connection *Connection) error { return connection.WriteJSON(map[string]string{"message": "test"}) }},
		{name: "binary", write: func(connection *Connection) error { return connection.WriteBinary([]byte("test")) }},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			connection, transport := newFailedWriteConnection(t)
			var hookCalls atomic.Int32
			connection.AddCloseHook(func() { hookCalls.Add(1) })

			if err := testCase.write(connection); err == nil {
				t.Fatal("Write returned nil after the peer sent a close frame")
			}
			if connection.IsOpen() {
				t.Fatal("connection remained open after a write failure")
			}
			if got := transport.closeCalls.Load(); got != 1 {
				t.Fatalf("transport Close calls = %d, want 1", got)
			}
			if got := hookCalls.Load(); got != 1 {
				t.Fatalf("close hook calls = %d, want 1", got)
			}

			writesBefore := transport.writeCalls.Load()
			if err := testCase.write(connection); err == nil {
				t.Fatal("later Write returned nil after the connection closed")
			}
			if got := transport.writeCalls.Load(); got != writesBefore {
				t.Fatalf("transport Write calls after close = %d, want %d", got, writesBefore)
			}
			if got := hookCalls.Load(); got != 1 {
				t.Fatalf("close hook calls after later Write = %d, want 1", got)
			}
		})
	}
}

func TestConnection_AttachSubscriptionAfterCloseCancelsImmediately(t *testing.T) {
	connection := NewConnection(nil)
	connection.Close()
	var cancelCalls atomic.Int32

	connection.AttachSubscription("session-1", 1, make(chan terminal.Event), func(string, uint64) {
		cancelCalls.Add(1)
	})

	if got := cancelCalls.Load(); got != 1 {
		t.Fatalf("subscription cancel calls = %d, want 1", got)
	}
}

func TestConnection_AttachEventStreamAfterCloseCancelsImmediately(t *testing.T) {
	connection := NewConnection(nil)
	connection.Close()
	var cancelCalls atomic.Int32

	connection.AttachEventStream(make(chan Event), "events.frontendStream", func() {
		cancelCalls.Add(1)
	})

	if got := cancelCalls.Load(); got != 1 {
		t.Fatalf("event stream cancel calls = %d, want 1", got)
	}
}

func TestConnection_AddCloseHookDuringCloseRunsOnce(t *testing.T) {
	connection := newOpenConnection(t)
	started := make(chan struct{})
	release := make(chan struct{})
	var firstCalls atomic.Int32
	var lateCalls atomic.Int32
	connection.AddCloseHook(func() {
		firstCalls.Add(1)
		close(started)
		<-release
	})

	go connection.Close()
	<-started
	connection.AddCloseHook(func() { lateCalls.Add(1) })
	close(release)

	waitForCloseHook(t, &firstCalls)
	waitForCloseHook(t, &lateCalls)
	connection.Close()
	if got := firstCalls.Load(); got != 1 {
		t.Fatalf("first close hook calls = %d, want 1", got)
	}
	if got := lateCalls.Load(); got != 1 {
		t.Fatalf("late close hook calls = %d, want 1", got)
	}
}

func newOpenConnection(t *testing.T) *Connection {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		upgrader := websocket.Upgrader{}
		serverConn, err := upgrader.Upgrade(writer, request, nil)
		if err != nil {
			t.Error(err)
			return
		}
		defer serverConn.Close()
		_, _, _ = serverConn.ReadMessage()
	}))
	t.Cleanup(server.Close)
	clientConn, _, err := websocket.DefaultDialer.Dial(serverURL(t, server.URL), nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = clientConn.Close() })
	return NewConnection(clientConn)
}

func newFailedWriteConnection(t *testing.T) (*Connection, *trackedConn) {
	t.Helper()
	peerClosed := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		upgrader := websocket.Upgrader{}
		serverConn, err := upgrader.Upgrade(writer, request, nil)
		if err != nil {
			t.Error(err)
			return
		}
		defer serverConn.Close()
		if err := serverConn.WriteControl(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, "closed"), time.Now().Add(time.Second)); err != nil {
			t.Error(err)
			return
		}
		close(peerClosed)
		_, _, _ = serverConn.ReadMessage()
	}))
	t.Cleanup(server.Close)

	transport := &trackedConn{}
	dialer := websocket.Dialer{NetDialContext: trackDialContext(transport)}
	clientConn, _, err := dialer.Dial(serverURL(t, server.URL), nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = clientConn.Close() })
	<-peerClosed
	_, _, err = clientConn.ReadMessage()
	if err == nil || !strings.Contains(err.Error(), "close") {
		t.Fatalf("ReadMessage error = %v, want close error", err)
	}
	return NewConnection(clientConn), transport
}

func serverURL(t *testing.T, rawURL string) string {
	t.Helper()
	parsedURL, err := url.Parse(rawURL)
	if err != nil {
		t.Fatal(err)
	}
	parsedURL.Scheme = "ws"
	return parsedURL.String()
}

func trackDialContext(transport *trackedConn) func(context.Context, string, string) (net.Conn, error) {
	return func(ctx context.Context, network, address string) (net.Conn, error) {
		connection, err := (&net.Dialer{}).DialContext(ctx, network, address)
		if err != nil {
			return nil, err
		}
		transport.Conn = connection
		return transport, nil
	}
}

func waitForCloseHook(t *testing.T, calls *atomic.Int32) {
	t.Helper()
	deadline := time.After(time.Second)
	for calls.Load() != 1 {
		select {
		case <-deadline:
			t.Fatal("close hook did not run")
		default:
			time.Sleep(time.Millisecond)
		}
	}
}

type trackedConn struct {
	net.Conn
	closeCalls atomic.Int32
	writeCalls atomic.Int32
	writeMu    sync.Mutex
}

func (c *trackedConn) Close() error {
	c.closeCalls.Add(1)
	return c.Conn.Close()
}

func (c *trackedConn) Write(payload []byte) (int, error) {
	c.writeMu.Lock()
	defer c.writeMu.Unlock()
	c.writeCalls.Add(1)
	return c.Conn.Write(payload)
}
