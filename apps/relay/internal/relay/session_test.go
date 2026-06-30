package relay

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"yishan/apps/relay/internal/auth"
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// newTestIdentity creates a minimal NodeIdentity for tests.
func newTestIdentity(nodeID, userID string) auth.NodeIdentity {
	return auth.NodeIdentity{NodeID: nodeID, UserID: userID}
}

// pipeWebSocket creates a connected pair of websocket connections for testing.
// Returns (serverConn, clientConn, cleanup).
func pipeWebSocket(t *testing.T) (*websocket.Conn, *websocket.Conn, func()) {
	t.Helper()
	upgrader := websocket.Upgrader{CheckOrigin: func(_ *http.Request) bool { return true }}
	connCh := make(chan *websocket.Conn, 1)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Errorf("upgrade: %v", err)
			return
		}
		connCh <- c
	}))
	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http")
	clientConn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	var serverConn *websocket.Conn
	select {
	case serverConn = <-connCh:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for server websocket connection")
	}
	cleanup := func() {
		_ = clientConn.Close()
		_ = serverConn.Close()
		srv.Close()
	}
	return serverConn, clientConn, cleanup
}

// ---------------------------------------------------------------------------
// NodeSession tests
// ---------------------------------------------------------------------------

func TestNodeSession_InitialState(t *testing.T) {
	before := time.Now()
	session := newNodeSession(nil, newTestIdentity("node-1", "user-1"))

	if session.State != StateConnected {
		t.Errorf("expected StateConnected, got %s", session.State)
	}
	if session.ConnectedAt.Before(before) {
		t.Error("ConnectedAt should be at or after test start")
	}
	if session.DisconnectedAt != nil {
		t.Error("DisconnectedAt should be nil initially")
	}
	if session.Identity.NodeID != "node-1" {
		t.Errorf("unexpected NodeID %q", session.Identity.NodeID)
	}
}

func TestNodeSession_isConnected(t *testing.T) {
	session := newNodeSession(nil, newTestIdentity("n", "u"))
	if !session.isConnected() {
		t.Error("expected isConnected to be true before disconnect")
	}
	session.markDisconnected()
	if session.isConnected() {
		t.Error("expected isConnected to be false after markDisconnected")
	}
}

func TestNodeSession_markDisconnected(t *testing.T) {
	before := time.Now()
	session := newNodeSession(nil, newTestIdentity("n", "u"))
	session.markDisconnected()

	if session.State != StateDisconnected {
		t.Errorf("expected StateDisconnected, got %s", session.State)
	}
	if session.DisconnectedAt == nil {
		t.Fatal("DisconnectedAt should not be nil after disconnect")
	}
	if session.DisconnectedAt.Before(before) {
		t.Error("DisconnectedAt should be at or after test start")
	}
	// conn should be nil
	if session.conn != nil {
		t.Error("conn should be nil after markDisconnected")
	}
}

func TestNodeSession_markDisconnected_IsIdempotent(t *testing.T) {
	// markDisconnected itself always updates DisconnectedAt.
	// Idempotency at the session level is enforced by DisconnectSession()
	// which guards with isConnected(). This test verifies that a second call
	// to markDisconnected does not panic.
	session := newNodeSession(nil, newTestIdentity("n", "u"))
	session.markDisconnected()
	session.markDisconnected() // must not panic
	if session.State != StateDisconnected {
		t.Error("state should remain disconnected after double call")
	}
}

func TestNodeSession_SendJSON_NilConn_ReturnsErrNodeOffline(t *testing.T) {
	session := newNodeSession(nil, newTestIdentity("n", "u"))
	err := session.SendJSON(map[string]string{"test": "value"})
	if err != ErrNodeOffline {
		t.Errorf("expected ErrNodeOffline, got %v", err)
	}
}

func TestNodeSession_SendMessage_NilConn_ReturnsErrNodeOffline(t *testing.T) {
	session := newNodeSession(nil, newTestIdentity("n", "u"))
	err := session.SendMessage(websocket.TextMessage, []byte("hi"))
	if err != ErrNodeOffline {
		t.Errorf("expected ErrNodeOffline, got %v", err)
	}
}

func TestNodeSession_Close_NilConn_NoPanic(t *testing.T) {
	session := newNodeSession(nil, newTestIdentity("n", "u"))
	// Should not panic on nil conn.
	session.Close(websocket.CloseNormalClosure, "bye")
}

func TestNodeSession_SendJSON_RealConn(t *testing.T) {
	srvConn, cliConn, cleanup := pipeWebSocket(t)
	defer cleanup()

	session := newNodeSession(srvConn, newTestIdentity("n", "u"))
	type msg struct{ Hello string }
	if err := session.SendJSON(msg{Hello: "world"}); err != nil {
		t.Fatalf("SendJSON: %v", err)
	}
	var received msg
	if err := cliConn.ReadJSON(&received); err != nil {
		t.Fatalf("ReadJSON: %v", err)
	}
	if received.Hello != "world" {
		t.Errorf("expected 'world', got %q", received.Hello)
	}
}

// ---------------------------------------------------------------------------
// SessionManager tests
// ---------------------------------------------------------------------------

func TestSessionManager_Register_NewSession(t *testing.T) {
	mgr := NewSessionManager()
	var events []SessionEvent
	mgr.OnEvent(func(e SessionEvent) { events = append(events, e) })

	identity := newTestIdentity("node-1", "user-1")
	session := mgr.Register(nil, identity)

	if session == nil {
		t.Fatal("Register returned nil session")
	}
	if !session.isConnected() {
		t.Error("new session should be connected")
	}
	if mgr.TotalCount() != 1 {
		t.Errorf("expected TotalCount 1, got %d", mgr.TotalCount())
	}
	if mgr.ConnectedCount() != 1 {
		t.Errorf("expected ConnectedCount 1, got %d", mgr.ConnectedCount())
	}
	if len(events) != 1 || events[0].Type != "connected" {
		t.Errorf("expected one 'connected' event, got %v", events)
	}
	if events[0].NodeID != "node-1" {
		t.Errorf("wrong NodeID in event: %q", events[0].NodeID)
	}
}

func TestSessionManager_Register_ReplacesExistingSession(t *testing.T) {
	mgr := NewSessionManager()
	var eventTypes []string
	mgr.OnEvent(func(e SessionEvent) { eventTypes = append(eventTypes, e.Type) })

	identity := newTestIdentity("node-1", "user-1")
	old := mgr.Register(nil, identity)
	newSession := mgr.Register(nil, identity)

	if newSession == old {
		t.Error("second Register should return a new session pointer")
	}
	if old.isConnected() {
		t.Error("old session should be marked disconnected after replacement")
	}
	if !newSession.isConnected() {
		t.Error("new session should be connected")
	}
	if mgr.TotalCount() != 1 {
		t.Errorf("expected TotalCount 1 (replacement), got %d", mgr.TotalCount())
	}
	// Events: connected, replaced, connected
	if len(eventTypes) != 3 {
		t.Errorf("expected 3 events (connected, replaced, connected), got %v", eventTypes)
	}
	if eventTypes[1] != "replaced" {
		t.Errorf("expected second event to be 'replaced', got %q", eventTypes[1])
	}
}

func TestSessionManager_Disconnect_MarksSessionOffline(t *testing.T) {
	mgr := NewSessionManager()
	var events []SessionEvent
	mgr.OnEvent(func(e SessionEvent) { events = append(events, e) })

	mgr.Register(nil, newTestIdentity("node-1", "user-1"))
	mgr.Disconnect("node-1", websocket.CloseNormalClosure, "bye")

	if mgr.IsOnline("node-1") {
		t.Error("node should be offline after Disconnect")
	}
	// Last event should be "disconnected"
	last := events[len(events)-1]
	if last.Type != "disconnected" {
		t.Errorf("expected 'disconnected' event, got %q", last.Type)
	}
}

func TestSessionManager_Disconnect_AfterReconnect_DoesNotCorruptNewSession(t *testing.T) {
	// This test verifies the critical fix: the old goroutine's deferred Disconnect
	// must not mark the NEW session as disconnected.
	mgr := NewSessionManager()

	identity := newTestIdentity("node-1", "user-1")
	oldSession := mgr.Register(nil, identity)
	newSession := mgr.Register(nil, identity) // reconnect

	// Simulate the old goroutine's deferred DisconnectSession with the old pointer.
	mgr.DisconnectSession(oldSession, websocket.CloseNormalClosure, "old goroutine")

	// The new session must still be connected.
	if !newSession.isConnected() {
		t.Error("new session should still be connected after old goroutine disconnects old session")
	}
	if !mgr.IsOnline("node-1") {
		t.Error("node should be online (new session active)")
	}
}

func TestSessionManager_DisconnectSession_NilSession_NoPanic(t *testing.T) {
	mgr := NewSessionManager()
	mgr.DisconnectSession(nil, websocket.CloseNormalClosure, "test")
}

func TestSessionManager_DisconnectSession_AlreadyDisconnected_NoPanic(t *testing.T) {
	mgr := NewSessionManager()
	session := mgr.Register(nil, newTestIdentity("n", "u"))
	mgr.DisconnectSession(session, websocket.CloseNormalClosure, "first")
	// Second call must not panic or double-emit.
	var events []SessionEvent
	mgr.OnEvent(func(e SessionEvent) { events = append(events, e) })
	mgr.DisconnectSession(session, websocket.CloseNormalClosure, "second")
	if len(events) != 0 {
		t.Error("no events expected when disconnecting already-disconnected session")
	}
}

func TestSessionManager_Get(t *testing.T) {
	mgr := NewSessionManager()
	if mgr.Get("unknown") != nil {
		t.Error("Get on unknown node should return nil")
	}
	identity := newTestIdentity("n", "u")
	session := mgr.Register(nil, identity)
	if mgr.Get("n") != session {
		t.Error("Get should return the registered session")
	}
}

func TestSessionManager_IsOnline(t *testing.T) {
	mgr := NewSessionManager()
	if mgr.IsOnline("unknown") {
		t.Error("unknown node should not be online")
	}
	mgr.Register(nil, newTestIdentity("n", "u"))
	if !mgr.IsOnline("n") {
		t.Error("registered node should be online")
	}
	mgr.Disconnect("n", websocket.CloseNormalClosure, "bye")
	if mgr.IsOnline("n") {
		t.Error("disconnected node should not be online")
	}
}

func TestSessionManager_GetStats(t *testing.T) {
	mgr := NewSessionManager()
	mgr.Register(nil, newTestIdentity("node-1", "user-1"))
	mgr.Register(nil, newTestIdentity("node-2", "user-2"))
	mgr.Disconnect("node-2", websocket.CloseNormalClosure, "bye")

	stats := mgr.GetStats()
	if stats.TotalCount != 2 {
		t.Errorf("expected TotalCount 2, got %d", stats.TotalCount)
	}
	if stats.ConnectedCount != 1 {
		t.Errorf("expected ConnectedCount 1, got %d", stats.ConnectedCount)
	}
	if len(stats.ConnectedIDs) != 1 || stats.ConnectedIDs[0] != "node-1" {
		t.Errorf("unexpected ConnectedIDs: %v", stats.ConnectedIDs)
	}
}

func TestSessionManager_EvictStale(t *testing.T) {
	mgr := NewSessionManager()
	mgr.Register(nil, newTestIdentity("active", "u"))

	// Register and immediately disconnect a session.
	mgr.Register(nil, newTestIdentity("stale", "u"))
	mgr.Disconnect("stale", websocket.CloseNormalClosure, "bye")

	// Evicting with maxAge=1h should not remove any sessions (too recent).
	n := mgr.EvictStale(time.Hour)
	if n != 0 {
		t.Errorf("expected 0 evictions, got %d", n)
	}
	if mgr.TotalCount() != 2 {
		t.Errorf("expected TotalCount 2, got %d", mgr.TotalCount())
	}

	// Evicting with maxAge=0 should remove the disconnected session.
	n = mgr.EvictStale(0)
	if n != 1 {
		t.Errorf("expected 1 eviction, got %d", n)
	}
	if mgr.TotalCount() != 1 {
		t.Errorf("expected TotalCount 1 after eviction, got %d", mgr.TotalCount())
	}
	// The connected session must survive.
	if !mgr.IsOnline("active") {
		t.Error("active session should not be evicted")
	}
}

func TestSessionManager_EvictStale_ConnectedSessions_NotEvicted(t *testing.T) {
	mgr := NewSessionManager()
	mgr.Register(nil, newTestIdentity("n", "u"))
	n := mgr.EvictStale(0) // maxAge=0 evicts anything older than now
	if n != 0 {
		t.Errorf("connected sessions must not be evicted, got %d", n)
	}
}

func TestSessionManager_SendNotification_OfflineNode(t *testing.T) {
	mgr := NewSessionManager()
	ok := mgr.SendNotification("unknown", "test.method", nil)
	if ok {
		t.Error("SendNotification to unknown node should return false")
	}
}

func TestSessionManager_SendNotification_OnlineNode(t *testing.T) {
	srvConn, cliConn, cleanup := pipeWebSocket(t)
	defer cleanup()

	mgr := NewSessionManager()
	mgr.Register(srvConn, newTestIdentity("n", "u"))

	ok := mgr.SendNotification("n", "relay.ping", nil)
	if !ok {
		t.Error("SendNotification to online node should return true")
	}
	// Read from client side to confirm delivery.
	_ = cliConn.SetReadDeadline(time.Now().Add(time.Second))
	var msg map[string]any
	if err := cliConn.ReadJSON(&msg); err != nil {
		t.Fatalf("ReadJSON: %v", err)
	}
	if msg["method"] != "relay.ping" {
		t.Errorf("expected method 'relay.ping', got %v", msg["method"])
	}
}

func TestSessionManager_EmitHandler_PanicRecovery(t *testing.T) {
	mgr := NewSessionManager()
	mgr.OnEvent(func(SessionEvent) { panic("handler panic") })

	// Register should not propagate the panic.
	defer func() {
		if r := recover(); r != nil {
			t.Errorf("panic escaped from emit: %v", r)
		}
	}()
	mgr.Register(nil, newTestIdentity("n", "u"))
}

func TestSessionManager_ConcurrentRegistrations(t *testing.T) {
	// Race-detector test: concurrent registers and disconnects must not data-race.
	mgr := NewSessionManager()
	const workers = 10
	var wg sync.WaitGroup
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func(id string) {
			defer wg.Done()
			mgr.Register(nil, newTestIdentity(id, "u"))
			mgr.IsOnline(id)
			mgr.GetStats()
			mgr.Disconnect(id, websocket.CloseNormalClosure, "bye")
		}(strings.Repeat(string(rune('a'+i)), 5))
	}
	wg.Wait()
}
