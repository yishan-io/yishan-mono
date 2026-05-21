package daemon

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/rs/zerolog/log"
	"yishan/apps/cli/internal/buildinfo"
	cliruntime "yishan/apps/cli/internal/runtime"
)

const relayMethodPing = "relay.ping"
const relayMethodPong = "relay.pong"
const relayMethodJobRun = "job.run"

const relayReconnectInitialDelay = 2 * time.Second
const relayReconnectMaxDelay = 30 * time.Second

// relayTokenEarlyRefreshWindow refreshes the token this long before it expires.
const relayTokenEarlyRefreshWindow = 60 * time.Second

// RelayStatus holds the current state of the relay connection, safe for concurrent reads.
type RelayStatus struct {
	mu          sync.RWMutex
	enabled     bool
	url         string
	connected   bool
	connectedAt *time.Time
	lastError   string
	lastErrorAt *time.Time
}

// NewRelayStatus creates a RelayStatus with the given configuration.
func NewRelayStatus(enabled bool, relayURL string) *RelayStatus {
	return &RelayStatus{enabled: enabled, url: relayURL}
}

func (s *RelayStatus) setConnected(at time.Time) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.connected = true
	s.connectedAt = &at
	s.lastError = ""
	s.lastErrorAt = nil
}

func (s *RelayStatus) setDisconnected(errMsg string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.connected = false
	if errMsg != "" {
		s.lastError = errMsg
		now := time.Now().UTC()
		s.lastErrorAt = &now
	}
}

// Snapshot returns a read-only copy of the relay status for serialisation.
type RelayStatusSnapshot struct {
	Enabled     bool    `json:"enabled"`
	URL         string  `json:"url"`
	Connected   bool    `json:"connected"`
	ConnectedAt *string `json:"connectedAt,omitempty"`
	LastError   *string `json:"lastError,omitempty"`
	LastErrorAt *string `json:"lastErrorAt,omitempty"`
}

func (s *RelayStatus) Snapshot() RelayStatusSnapshot {
	s.mu.RLock()
	defer s.mu.RUnlock()

	snap := RelayStatusSnapshot{
		Enabled:   s.enabled,
		URL:       s.url,
		Connected: s.connected,
	}
	if s.connectedAt != nil {
		t := s.connectedAt.UTC().Format(time.RFC3339)
		snap.ConnectedAt = &t
	}
	if s.lastError != "" {
		snap.LastError = &s.lastError
	}
	if s.lastErrorAt != nil {
		t := s.lastErrorAt.UTC().Format(time.RFC3339)
		snap.LastErrorAt = &t
	}
	return snap
}

func runRelayClientLoop(ctx context.Context, handler *JSONRPCHandler, nodeID string, relayURL string, status *RelayStatus) {
	endpoint, err := normalizeRelayWSURL(relayURL)
	if err != nil {
		log.Warn().Err(err).Str("relay_url", relayURL).Msg("invalid relay url; relay client disabled")
		status.setDisconnected("invalid relay url: " + err.Error())
		return
	}

	var cachedToken string
	var cachedTokenExpiry time.Time

	delay := relayReconnectInitialDelay
	for {
		select {
		case <-ctx.Done():
			log.Debug().Msg("relay client loop stopped")
			return
		default:
		}

		if !cliruntime.APIConfigured() {
			log.Warn().Msg("relay client waiting for API credentials")
			status.setDisconnected("waiting for API credentials")
			select {
			case <-ctx.Done():
				return
			case <-time.After(delay):
			}
			delay = nextRelayDelay(delay)
			continue
		}

		// Reuse the cached token if it is still valid; only mint a new one
		// when the token is missing or about to expire.
		now := time.Now()
		if cachedToken == "" || now.After(cachedTokenExpiry.Add(-relayTokenEarlyRefreshWindow)) {
			token, expiry, err := mintRelayToken(nodeID)
			if err != nil {
				log.Warn().Err(err).Str("nodeId", nodeID).Msg("relay token mint failed")
				status.setDisconnected("token mint failed: " + err.Error())
				select {
				case <-ctx.Done():
					return
				case <-time.After(delay):
				}
				delay = nextRelayDelay(delay)
				continue
			}
			cachedToken = token
			cachedTokenExpiry = expiry
		}

		endpointWithMetadata := appendRelayClientMetadata(endpoint)
		headers := http.Header{}
		headers.Set("Authorization", "Bearer "+cachedToken)
		conn, resp, err := websocket.DefaultDialer.DialContext(ctx, endpointWithMetadata, headers)
		if err != nil {
			statusCode := 0
			responseBody := ""
			if resp != nil {
				statusCode = resp.StatusCode
				if resp.Body != nil {
					body, readErr := io.ReadAll(io.LimitReader(resp.Body, 2048))
					_ = resp.Body.Close()
					if readErr == nil {
						responseBody = strings.TrimSpace(string(body))
					}
				}
			}

			logWarn := log.Warn().Err(err).Str("relay_url", endpointWithMetadata)
			if statusCode > 0 {
				logWarn = logWarn.Int("status", statusCode)
			}
			if responseBody != "" {
				logWarn = logWarn.Str("response_body", responseBody)
			}
			logWarn.Msg("relay websocket dial failed")
			status.setDisconnected("dial failed: " + err.Error())
			select {
			case <-ctx.Done():
				return
			case <-time.After(delay):
			}
			delay = nextRelayDelay(delay)
			continue
		}

		log.Info().Str("relay_url", endpointWithMetadata).Str("nodeId", nodeID).Str("daemonVersion", buildinfo.Version).Msg("relay websocket connected")
		delay = relayReconnectInitialDelay
		// Invalidate the cached token after a successful session ends so the
		// next reconnect always gets a fresh token.
		cachedToken = ""
		status.setConnected(time.Now().UTC())

		runRelaySession(handler, nodeID, conn)
		status.setDisconnected("session ended")
	}
}

func appendRelayClientMetadata(endpoint string) string {
	parsed, err := url.Parse(endpoint)
	if err != nil {
		return endpoint
	}
	query := parsed.Query()
	if version := strings.TrimSpace(buildinfo.Version); version != "" {
		query.Set("version", version)
	}
	parsed.RawQuery = query.Encode()
	return parsed.String()
}

func runRelaySession(handler *JSONRPCHandler, nodeID string, conn *websocket.Conn) {
	connState := newWSConnState(conn)
	defer connState.Close()

	for {
		msgType, payload, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure, websocket.CloseNormalClosure) {
				log.Warn().Err(err).Msg("relay websocket read failed")
			} else {
				log.Info().Err(err).Msg("relay websocket disconnected")
			}
			return
		}

		if msgType == websocket.BinaryMessage {
			handler.handleBinaryFrame(connState, payload)
			continue
		}

		// Handle relay-level messages before dispatching to the daemon handler.
		if handleRelayMessage(connState, nodeID, payload) {
			continue
		}

		resp := handler.handleRequest(context.Background(), connState, payload)
		if resp == nil {
			continue
		}
		if err := connState.WriteJSON(resp); err != nil {
			log.Warn().Err(err).Msg("relay websocket write failed")
			return
		}
	}
}

func normalizeRelayWSURL(raw string) (string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", fmt.Errorf("empty relay url")
	}

	parsed, err := url.Parse(trimmed)
	if err != nil {
		return "", fmt.Errorf("parse relay url: %w", err)
	}

	switch parsed.Scheme {
	case "http":
		parsed.Scheme = "ws"
	case "https":
		parsed.Scheme = "wss"
	case "ws", "wss":
	default:
		return "", fmt.Errorf("unsupported relay url scheme %q", parsed.Scheme)
	}

	if parsed.Path == "" || parsed.Path == "/" {
		parsed.Path = "/ws"
	}

	return parsed.String(), nil
}

// handleRelayMessage handles relay-protocol messages (heartbeat, job dispatch).
// Returns true if the message was consumed and should not be passed to the daemon handler.
func handleRelayMessage(connState *wsConnState, nodeID string, payload []byte) bool {
	var msg struct {
		Method string          `json:"method"`
		Params json.RawMessage `json:"params,omitempty"`
	}
	if err := json.Unmarshal(payload, &msg); err != nil {
		return false
	}

	switch msg.Method {
	case relayMethodPing:
		_ = connState.WriteJSON(notification{JSONRPC: "2.0", Method: relayMethodPong})
		return true
	case relayMethodJobRun:
		handleJobRun(connState, nodeID, msg.Params)
		return true
	default:
		return false
	}
}

func mintRelayToken(nodeID string) (string, time.Time, error) {
	client := cliruntime.APIClient()
	resp, err := client.RelayToken(nodeID)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("request relay token: %w", err)
	}
	if strings.TrimSpace(resp.Token) == "" {
		return "", time.Time{}, fmt.Errorf("empty relay token in response")
	}
	expiry := time.Time{}
	if resp.ExpiresAt != "" {
		if t, err := time.Parse(time.RFC3339, resp.ExpiresAt); err == nil {
			expiry = t
		}
	}
	// If no expiry was returned, treat it as valid for 5 minutes.
	if expiry.IsZero() {
		expiry = time.Now().Add(5 * time.Minute)
	}
	return resp.Token, expiry, nil
}

// nextRelayDelay doubles the current delay up to relayReconnectMaxDelay and
// adds ±25% jitter to prevent thundering-herd reconnects when multiple daemon
// nodes disconnect simultaneously.
func nextRelayDelay(current time.Duration) time.Duration {
	next := current * 2
	if next > relayReconnectMaxDelay {
		next = relayReconnectMaxDelay
	}
	// Add ±25% jitter: jitter is in the range [-next/4, +next/4].
	jitter := time.Duration(rand.Int63n(int64(next/2))) - next/4
	result := next + jitter
	if result < relayReconnectInitialDelay {
		return relayReconnectInitialDelay
	}
	return result
}
