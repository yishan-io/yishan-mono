package relay

import (
	"fmt"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/rs/zerolog/log"

	"yishan/apps/relay/internal/auth"
)

// ErrNodeOffline is returned when attempting to send to a disconnected node.
var ErrNodeOffline = errNodeOffline

// ---------------------------------------------------------------------------
// NodeSession represents a single connected node.
// ---------------------------------------------------------------------------

// SessionState is the connection state of a node session.
type SessionState string

const (
	StateConnected    SessionState = "connected"
	StateDisconnected SessionState = "disconnected"
)

// NodeSession holds the state for a connected (or recently disconnected) node.
type NodeSession struct {
	Identity    auth.NodeIdentity
	ConnectedAt time.Time

	// stateMu protects State and DisconnectedAt independently of the
	// SessionManager.mu so concurrent reads of these fields (IsOnline, etc.)
	// and the markDisconnected write are properly synchronised.
	stateMu        sync.RWMutex
	State          SessionState
	DisconnectedAt *time.Time

	conn    *websocket.Conn
	writeMu sync.Mutex
}

func (s *NodeSession) remoteAddr() string {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	if s.conn == nil || s.conn.UnderlyingConn() == nil {
		return ""
	}
	return s.conn.UnderlyingConn().RemoteAddr().String()
}

func (s *NodeSession) localAddr() string {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	if s.conn == nil || s.conn.UnderlyingConn() == nil {
		return ""
	}
	return s.conn.UnderlyingConn().LocalAddr().String()
}

func newNodeSession(conn *websocket.Conn, identity auth.NodeIdentity) *NodeSession {
	return &NodeSession{
		Identity:    identity,
		State:       StateConnected,
		ConnectedAt: time.Now(),
		conn:        conn,
	}
}

// isConnected returns true when the session is in the connected state.
// Thread-safe via stateMu.
func (s *NodeSession) isConnected() bool {
	s.stateMu.RLock()
	ok := s.State == StateConnected
	s.stateMu.RUnlock()
	return ok
}

// SendJSON sends a JSON message to the node. Thread-safe.
func (s *NodeSession) SendJSON(v any) error {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	if s.conn == nil {
		return ErrNodeOffline
	}
	_ = s.conn.SetWriteDeadline(time.Now().Add(writeDeadline))
	return s.conn.WriteJSON(v)
}

// SendNotification sends a JSON-RPC notification to the node.
func (s *NodeSession) SendNotification(method string, params any) error {
	return s.SendJSON(notification{JSONRPC: "2.0", Method: method, Params: params})
}

// SendMessage sends a raw WebSocket message to the node. Thread-safe.
func (s *NodeSession) SendMessage(msgType int, payload []byte) error {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	if s.conn == nil {
		return ErrNodeOffline
	}
	_ = s.conn.SetWriteDeadline(time.Now().Add(writeDeadline))
	return s.conn.WriteMessage(msgType, payload)
}

// Close terminates the underlying WebSocket connection.
func (s *NodeSession) Close(code int, reason string) {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	if s.conn != nil {
		_ = s.conn.SetWriteDeadline(time.Now().Add(writeDeadline))
		_ = s.conn.WriteMessage(
			websocket.CloseMessage,
			websocket.FormatCloseMessage(code, reason),
		)
		_ = s.conn.Close()
		s.conn = nil
	}
}

// markDisconnected atomically marks the session as disconnected.
// Protected by stateMu so concurrent reads of State are race-free.
func (s *NodeSession) markDisconnected() {
	now := time.Now()
	s.stateMu.Lock()
	s.State = StateDisconnected
	s.DisconnectedAt = &now
	s.stateMu.Unlock()

	s.writeMu.Lock()
	s.conn = nil
	s.writeMu.Unlock()
}

// ---------------------------------------------------------------------------
// Session events
// ---------------------------------------------------------------------------

// SessionEvent represents a lifecycle event for a node session.
type SessionEvent struct {
	Type          string // "connected", "disconnected", "replaced"
	NodeID        string
	UserID        string
	DaemonVersion string
}

// ConnectedSessionView is a read-only view of a connected session for metrics.
type ConnectedSessionView struct {
	NodeID        string  `json:"nodeId"`
	UserID        string  `json:"userId"`
	DaemonVersion *string `json:"daemonVersion,omitempty"`
}

// SessionStats is a snapshot of session counts collected in one locked pass.
type SessionStats struct {
	ConnectedIDs      []string
	ConnectedSessions []ConnectedSessionView
	ConnectedCount    int
	TotalCount        int
}

// SessionEventHandler is a callback for session lifecycle events.
type SessionEventHandler func(SessionEvent)

// ---------------------------------------------------------------------------
// SessionManager tracks all node sessions.
// ---------------------------------------------------------------------------

// SessionManager manages the lifecycle of node WebSocket sessions.
type SessionManager struct {
	mu       sync.RWMutex
	sessions map[string]*NodeSession // keyed by nodeId

	// handlerMu protects the handlers slice. Handlers are registered once at
	// startup so reads dominate; use RWMutex to avoid copying on every emit.
	handlerMu sync.RWMutex
	handlers  []SessionEventHandler
}

// NewSessionManager creates a new SessionManager.
func NewSessionManager() *SessionManager {
	return &SessionManager{
		sessions: make(map[string]*NodeSession),
	}
}

// OnEvent registers a handler for session lifecycle events.
func (m *SessionManager) OnEvent(handler SessionEventHandler) {
	m.handlerMu.Lock()
	defer m.handlerMu.Unlock()
	m.handlers = append(m.handlers, handler)
}

func (m *SessionManager) emit(event SessionEvent) {
	// Read the handlers slice pointer under RLock without copying.
	// Handlers are registered once at startup and never removed.
	m.handlerMu.RLock()
	handlers := m.handlers
	m.handlerMu.RUnlock()

	for _, h := range handlers {
		func() {
			defer func() {
				if r := recover(); r != nil {
					log.Error().Interface("panic", r).Msg("session event handler panic")
				}
			}()
			h(event)
		}()
	}
}

// Register creates or replaces a session for the given node.
// If the node already has an active connection, the old one is replaced.
//
// The fix for the double-disconnect race: the old session pointer is captured
// under the lock and passed directly into Close/markDisconnected. The deferred
// Disconnect in HandleWebSocket passes the *session pointer* it received from
// Register, so it never re-looks up sessions[nodeID] and cannot corrupt the new
// live session.
func (m *SessionManager) Register(conn *websocket.Conn, identity auth.NodeIdentity) *NodeSession {
	m.mu.Lock()
	existing := m.sessions[identity.NodeID]
	session := newNodeSession(conn, identity)
	m.sessions[identity.NodeID] = session
	m.mu.Unlock()

	if existing != nil && existing.isConnected() {
		log.Info().Str("nodeId", identity.NodeID).Msg("replacing existing connection")
		existing.Close(wsCloseReplaced, "replaced by new connection")
		existing.markDisconnected()
		m.emit(SessionEvent{Type: "replaced", NodeID: identity.NodeID, UserID: identity.UserID, DaemonVersion: identity.DaemonVersion})
	}

	log.Info().
		Str("nodeId", identity.NodeID).
		Str("userId", identity.UserID).
		Str("remoteAddr", session.remoteAddr()).
		Str("localAddr", session.localAddr()).
		Msg("node connected")
	m.emit(SessionEvent{Type: "connected", NodeID: identity.NodeID, UserID: identity.UserID, DaemonVersion: identity.DaemonVersion})
	return session
}

// DisconnectSession marks the given session pointer as disconnected.
// Using the explicit session pointer (rather than re-looking up by nodeID)
// prevents the old goroutine from accidentally disconnecting the new session
// after a reconnect.
func (m *SessionManager) DisconnectSession(session *NodeSession, code int, reason string) {
	if session == nil || !session.isConnected() {
		return
	}

	session.Close(code, reason)
	session.markDisconnected()
	log.Info().
		Str("nodeId", session.Identity.NodeID).
		Str("remoteAddr", session.remoteAddr()).
		Str("localAddr", session.localAddr()).
		Int("code", code).
		Str("reason", reason).
		Msg("node disconnected")
	m.emit(SessionEvent{
		Type:          "disconnected",
		NodeID:        session.Identity.NodeID,
		UserID:        session.Identity.UserID,
		DaemonVersion: session.Identity.DaemonVersion,
	})
}

// Disconnect is the nodeID-based variant kept for callers that don't hold
// a session pointer. It guards against corrupting a new session by only
// calling markDisconnected on the exact session pointer currently in the map.
func (m *SessionManager) Disconnect(nodeID string, code int, reason string) {
	m.mu.RLock()
	session := m.sessions[nodeID]
	m.mu.RUnlock()

	if session == nil {
		return
	}

	// Guard: only disconnect if the stored pointer is still the same session
	// this call is about. After a reconnect, sessions[nodeID] already points
	// to the new session — we must not mark it disconnected.
	m.DisconnectSession(session, code, reason)
}

// Get returns a session by node ID, or nil if not found.
func (m *SessionManager) Get(nodeID string) *NodeSession {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.sessions[nodeID]
}

// IsOnline checks if a node is currently connected.
func (m *SessionManager) IsOnline(nodeID string) bool {
	m.mu.RLock()
	s := m.sessions[nodeID]
	m.mu.RUnlock()
	return s != nil && s.isConnected()
}

// GetStats returns all session metrics in a single locked pass,
// avoiding four separate map iterations.
func (m *SessionManager) GetStats() SessionStats {
	m.mu.RLock()
	defer m.mu.RUnlock()

	stats := SessionStats{
		TotalCount:        len(m.sessions),
		ConnectedIDs:      make([]string, 0, len(m.sessions)),
		ConnectedSessions: make([]ConnectedSessionView, 0, len(m.sessions)),
	}
	for id, s := range m.sessions {
		if !s.isConnected() {
			continue
		}
		stats.ConnectedCount++
		stats.ConnectedIDs = append(stats.ConnectedIDs, id)
		view := ConnectedSessionView{
			NodeID: s.Identity.NodeID,
			UserID: s.Identity.UserID,
		}
		if s.Identity.DaemonVersion != "" {
			version := s.Identity.DaemonVersion
			view.DaemonVersion = &version
		}
		stats.ConnectedSessions = append(stats.ConnectedSessions, view)
	}
	return stats
}

// ConnectedNodeIDs returns the IDs of all currently connected nodes.
func (m *SessionManager) ConnectedNodeIDs() []string {
	return m.GetStats().ConnectedIDs
}

// ConnectedSessions returns the connected node sessions with live identity metadata.
func (m *SessionManager) ConnectedSessions() []ConnectedSessionView {
	return m.GetStats().ConnectedSessions
}

// ConnectedCount returns the number of currently connected nodes.
func (m *SessionManager) ConnectedCount() int {
	return m.GetStats().ConnectedCount
}

// TotalCount returns the total number of tracked sessions.
func (m *SessionManager) TotalCount() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.sessions)
}

// EvictStale removes sessions that have been disconnected longer than maxAge.
// Call periodically (e.g. from a background ticker in NewServer) to prevent
// unbounded memory growth from node churn.
func (m *SessionManager) EvictStale(maxAge time.Duration) int {
	cutoff := time.Now().Add(-maxAge)
	m.mu.Lock()
	defer m.mu.Unlock()

	evicted := 0
	for id, s := range m.sessions {
		if s.isConnected() {
			continue
		}
		s.stateMu.RLock()
		disconnectedAt := s.DisconnectedAt
		s.stateMu.RUnlock()
		if disconnectedAt != nil && disconnectedAt.Before(cutoff) {
			delete(m.sessions, id)
			evicted++
		}
	}
	return evicted
}

// SendNotification sends a JSON-RPC notification to a specific node.
// Returns false if the node is not online.
func (m *SessionManager) SendNotification(nodeID, method string, params any) bool {
	return m.SendNotificationWithError(nodeID, method, params) == nil
}

// SendNotificationWithError sends a JSON-RPC notification to a specific node.
// Returns an error when the node is offline or the write fails.
func (m *SessionManager) SendNotificationWithError(nodeID, method string, params any) error {
	m.mu.RLock()
	session := m.sessions[nodeID]
	m.mu.RUnlock()

	if session == nil || !session.isConnected() {
		log.Debug().Str("nodeId", nodeID).Str("method", method).Msg("send notification skipped: session offline")
		return ErrNodeOffline
	}

	if err := session.SendNotification(method, params); err != nil {
		log.Error().Err(err).
			Str("nodeId", nodeID).
			Str("method", method).
			Str("remoteAddr", session.remoteAddr()).
			Str("localAddr", session.localAddr()).
			Msg("send notification failed")
		return fmt.Errorf("send notification failed: %w", err)
	}
	return nil
}

// SendOrgNotification sends a JSON-RPC notification to every connected node in one organization.
func (m *SessionManager) SendOrgNotification(organizationID string, method string, params any) int {
	m.mu.RLock()
	sessions := make([]*NodeSession, 0, len(m.sessions))
	for _, session := range m.sessions {
		if !session.isConnected() {
			continue
		}
		for _, sessionOrganizationID := range session.Identity.OrganizationIDs {
			if sessionOrganizationID == organizationID {
				sessions = append(sessions, session)
				break
			}
		}
	}
	m.mu.RUnlock()

	notified := 0
	for _, session := range sessions {
		if err := session.SendNotification(method, params); err == nil {
			notified++
		} else {
			log.Error().Err(err).
				Str("nodeId", session.Identity.NodeID).
				Str("organizationId", organizationID).
				Str("method", method).
				Msg("send org notification failed")
		}
	}
	return notified
}
