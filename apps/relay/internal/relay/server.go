package relay

import (
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/rs/zerolog/log"

	relayprotocol "yishan/packages/relay-protocol-go"

	"yishan/apps/relay/internal/auth"
)

// Server is the relay WebSocket server.
type Server struct {
	sessions      *SessionManager
	authenticator *auth.Authenticator
	apiToken      string
	upgrader      websocket.Upgrader
	startedAt     time.Time
	metricsMu     sync.RWMutex
	metricsCache  *metricsSnapshot
	clientMu      sync.RWMutex
	clientsByNode map[string]map[*clientConn]struct{}
}

type metricsSnapshot struct {
	expiresAt time.Time
	payload   map[string]any
}

type clientConn struct {
	nodeID string
	conn   *websocket.Conn
	write  sync.Mutex
}

// NewServer creates a new relay server and wires background housekeeping.
func NewServer(sessions *SessionManager, authenticator *auth.Authenticator, apiToken string) *Server {
	s := &Server{
		sessions:      sessions,
		authenticator: authenticator,
		apiToken:      apiToken,
		upgrader: websocket.Upgrader{
			CheckOrigin:     func(_ *http.Request) bool { return true },
			ReadBufferSize:  wsReadBufferSize,
			WriteBufferSize: wsWriteBufferSize,
		},
		startedAt:     time.Now(),
		clientsByNode: make(map[string]map[*clientConn]struct{}),
	}

	sessions.OnEvent(func(_ SessionEvent) {
		s.invalidateMetricsCache()
	})

	// Background housekeeping: evict stale disconnected sessions.
	go s.evictionLoop()

	return s
}

// evictionLoop periodically removes sessions that have been disconnected for
// longer than staleSessionMaxAge, preventing unbounded memory growth.
func (s *Server) evictionLoop() {
	ticker := time.NewTicker(staleSessionEvictInterval)
	defer ticker.Stop()
	for range ticker.C {
		n := s.sessions.EvictStale(staleSessionMaxAge)
		if n > 0 {
			log.Debug().Int("evicted", n).Msg("evicted stale disconnected sessions")
		}
	}
}

// HandleWebSocket upgrades HTTP to WebSocket and runs the node session loop.
func (s *Server) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	identity, err := s.authenticator.Authenticate(r)
	if err != nil {
		log.Warn().Err(err).Msg("relay auth failed")
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Error().Err(err).Msg("websocket upgrade failed")
		return
	}

	session := s.sessions.Register(conn, *identity)
	// Disconnect using the session pointer so the deferred call never
	// accidentally marks a newer session as disconnected after a reconnect.
	defer func() {
		s.sessions.DisconnectSession(session, websocket.CloseNormalClosure, "connection closed")
	}()

	log.Info().
		Str("nodeId", identity.NodeID).
		Str("userId", identity.UserID).
		Msg("node relay session started")

	// Start heartbeat in background.
	done := make(chan struct{})
	defer close(done)
	go s.heartbeatLoop(session, done)

	s.readLoop(session)
}

// HandleClientWebSocket upgrades HTTP to WebSocket for relay clients and bridges
// terminal/jsonrpc traffic to a specific node session.
func (s *Server) HandleClientWebSocket(w http.ResponseWriter, r *http.Request) {
	if !s.authorizeAPIRequest(w, r) {
		return
	}

	nodeID := strings.TrimSpace(r.URL.Query().Get("nodeId"))
	if nodeID == "" {
		http.Error(w, "missing nodeId", http.StatusBadRequest)
		return
	}

	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Error().Err(err).Msg("client websocket upgrade failed")
		return
	}

	client := &clientConn{nodeID: nodeID, conn: conn}
	s.addClient(client)
	defer s.removeClient(client)

	for {
		msgType, payload, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure, websocket.CloseAbnormalClosure) {
				log.Error().Err(err).Str("nodeId", nodeID).Msg("client websocket read failed")
			}
			return
		}

		node := s.sessions.Get(nodeID)
		if node == nil || !node.isConnected() {
			_ = client.writeJSON(relayprotocol.Response{
				JSONRPC: "2.0",
				ID:      nil,
				Error: &relayprotocol.RPCError{
					Code:    relayprotocol.CodeNodeOffline,
					Message: "node is offline",
				},
			})
			continue
		}

		if err := node.SendMessage(msgType, payload); err != nil {
			log.Error().Err(err).Str("nodeId", nodeID).Msg("failed to relay client payload to node")
		}
	}
}

// readLoop reads messages from the node's WebSocket until disconnection.
func (s *Server) readLoop(session *NodeSession) {
	nodeID := session.Identity.NodeID

	for {
		msgType, payload, err := session.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure, websocket.CloseAbnormalClosure) {
				log.Error().Err(err).Str("nodeId", nodeID).Msg("websocket read failed")
			}
			return
		}

		if msgType != websocket.TextMessage {
			s.broadcastToNodeClients(nodeID, msgType, payload)
			continue
		}

		handled := s.handleMessage(nodeID, payload)
		if !handled {
			s.broadcastToNodeClients(nodeID, msgType, payload)
		}
	}
}

// handleMessage parses and dispatches a JSON-RPC message from a node.
func (s *Server) handleMessage(nodeID string, payload []byte) bool {
	var req relayprotocol.Request
	if err := json.Unmarshal(payload, &req); err != nil {
		log.Warn().Err(err).Str("nodeId", nodeID).Msg("invalid json from node")
		return false
	}

	if req.Method == relayprotocol.MethodPong {
		// Heartbeat pong — no action needed, the read itself proves liveness.
		log.Debug().Str("nodeId", nodeID).Msg("pong received")
		return true
	}
	return false
}

// heartbeatLoop sends periodic relay.ping to the node.
func (s *Server) heartbeatLoop(session *NodeSession, done <-chan struct{}) {
	ticker := time.NewTicker(heartbeatInterval)
	defer ticker.Stop()

	for {
		select {
		case <-done:
			return
		case <-ticker.C:
			// Set a write deadline before each heartbeat write so a slow or
			// unresponsive node cannot block this goroutine indefinitely.
			if session.conn != nil {
				_ = session.conn.SetWriteDeadline(time.Now().Add(writeDeadline))
			}
			if err := session.SendNotification(relayprotocol.MethodPing, nil); err != nil {
				log.Debug().Err(err).Str("nodeId", session.Identity.NodeID).Msg("heartbeat ping failed")
				return
			}
		}
	}
}

// HandleMetrics handles GET /api/v1/metrics — returns relay metrics.
func (s *Server) HandleMetrics(w http.ResponseWriter, r *http.Request) {
	if !s.authorizeAPIRequest(w, r) {
		return
	}

	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	metrics := s.getMetricsSnapshot()
	writeJSON(w, http.StatusOK, metrics)
}

func (s *Server) getMetricsSnapshot() map[string]any {
	now := time.Now()

	s.metricsMu.RLock()
	cache := s.metricsCache
	if cache != nil && now.Before(cache.expiresAt) {
		payload := cache.payload
		s.metricsMu.RUnlock()
		return payload
	}
	s.metricsMu.RUnlock()

	// Collect all session stats in one locked pass instead of four.
	stats := s.sessions.GetStats()
	payload := map[string]any{
		"uptime":            time.Since(s.startedAt).String(),
		"connectedNodes":    stats.ConnectedIDs,
		"connectedSessions": stats.ConnectedSessions,
		"connectedCount":    stats.ConnectedCount,
		"totalSessions":     stats.TotalCount,
	}

	s.metricsMu.Lock()
	s.metricsCache = &metricsSnapshot{
		expiresAt: now.Add(metricsCacheTTL),
		payload:   payload,
	}
	s.metricsMu.Unlock()

	return payload
}

func (s *Server) invalidateMetricsCache() {
	s.metricsMu.Lock()
	s.metricsCache = nil
	s.metricsMu.Unlock()
}

// authorizeAPIRequest extracts and validates the bearer token from the request.
// It uses the shared extractBearerToken helper from internal/auth.
func (s *Server) authorizeAPIRequest(w http.ResponseWriter, r *http.Request) bool {
	token := auth.ExtractBearerToken(r)
	if token == "" || token != s.apiToken {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Error().Err(err).Msg("failed to write json response")
	}
}

func (s *Server) addClient(client *clientConn) {
	s.clientMu.Lock()
	defer s.clientMu.Unlock()
	set := s.clientsByNode[client.nodeID]
	if set == nil {
		set = make(map[*clientConn]struct{})
		s.clientsByNode[client.nodeID] = set
	}
	set[client] = struct{}{}
	log.Info().Str("nodeId", client.nodeID).Int("clients", len(set)).Msg("relay client connected")
}

func (s *Server) removeClient(client *clientConn) {
	s.clientMu.Lock()
	defer s.clientMu.Unlock()
	set := s.clientsByNode[client.nodeID]
	if set != nil {
		delete(set, client)
		if len(set) == 0 {
			delete(s.clientsByNode, client.nodeID)
		}
	}
	_ = client.conn.Close()
}

func (s *Server) broadcastToNodeClients(nodeID string, msgType int, payload []byte) {
	s.clientMu.RLock()
	set := s.clientsByNode[nodeID]
	if len(set) == 0 {
		s.clientMu.RUnlock()
		return
	}
	clients := make([]*clientConn, 0, len(set))
	for c := range set {
		clients = append(clients, c)
	}
	s.clientMu.RUnlock()

	for _, c := range clients {
		// Set write deadline before each broadcast write.
		_ = c.conn.SetWriteDeadline(time.Now().Add(writeDeadline))
		if err := c.writeMessage(msgType, payload); err != nil {
			log.Debug().Err(err).Str("nodeId", nodeID).Msg("dropping relay client on write failure")
			s.removeClient(c)
		}
	}
}

func (c *clientConn) writeMessage(msgType int, payload []byte) error {
	c.write.Lock()
	defer c.write.Unlock()
	return c.conn.WriteMessage(msgType, payload)
}

func (c *clientConn) writeJSON(v any) error {
	c.write.Lock()
	defer c.write.Unlock()
	return c.conn.WriteJSON(v)
}
