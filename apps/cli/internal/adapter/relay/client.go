package relay

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

	relayprotocol "yishan/packages/relay-protocol-go"

	"yishan/apps/cli/internal/adapter/cloud/session"
	"yishan/apps/cli/internal/events"
	release "yishan/apps/cli/internal/platform/release"
	"yishan/apps/cli/internal/rpc"
)

// Relay protocol method names are defined by the shared relay protocol module
// and re-exported here so CLI consumers keep the relay.Method* names.
const (
	MethodPing                     = relayprotocol.MethodPing
	MethodPong                     = relayprotocol.MethodPong
	MethodJobRun                   = relayprotocol.MethodJobRun
	MethodWorkspaceSnapshotChanged = relayprotocol.MethodWorkspaceSnapshotChanged
	MethodTerminalSessionChanged   = relayprotocol.MethodTerminalSessionChanged
	MethodTerminalStreamRequest    = relayprotocol.MethodTerminalStreamRequest
	MethodTerminalStreamAccept     = relayprotocol.MethodTerminalStreamAccept
	MethodTerminalStreamCancel     = relayprotocol.MethodTerminalStreamCancel
)

const (
	reconnectInitialDelay = 2 * time.Second
	reconnectMaxDelay     = 30 * time.Second

	// tokenEarlyRefreshWindow refreshes the token this long before it expires.
	tokenEarlyRefreshWindow = 60 * time.Second
)

// MessageHandler is the app-side sink for relay-level messages the client does
// not own (job dispatch, workspace snapshot changes, terminal session and
// stream notifications). The implementation returns handled=true when the
// message was consumed and must not be dispatched to the rpc server.
type MessageHandler interface {
	HandleRelayMessage(ctx context.Context, conn *rpc.Connection, nodeID string, method string, params json.RawMessage) bool
}

// ClientConfig wires the relay client. Server handles incoming JSON-RPC and
// binary terminal frames on the relay connection; Handler owns the
// relay-protocol messages; Events is the frontend hub the client forwards
// terminal session changes from.
type ClientConfig struct {
	Session     *session.Session
	NodeID      string
	URL         string
	StaticToken string
	Server      *rpc.Server
	Handler     MessageHandler
	Events      *eventbus.Hub
}

// Client is the relay WebSocket client: the reconnect loop, the per-session
// read loop, the connection handle, pending dispatch verdicts, and the
// connection status. It is the single owner of the relay connection state.
type Client struct {
	runtime     *session.Session
	nodeID      string
	url         string
	staticToken string
	server      *rpc.Server
	handler     MessageHandler
	events      *eventbus.Hub
	status      *Status

	connMu sync.RWMutex
	conn   *rpc.Connection

	pendingMu sync.Mutex
	pending   map[string]chan dispatchVerdict
}

// NewClient creates a relay client. The reconnect loop starts via Run.
func NewClient(cfg ClientConfig) *Client {
	return &Client{
		runtime:     cfg.Session,
		nodeID:      cfg.NodeID,
		url:         cfg.URL,
		staticToken: cfg.StaticToken,
		server:      cfg.Server,
		handler:     cfg.Handler,
		events:      cfg.Events,
		status:      NewStatus(cfg.URL != "", cfg.URL),
		pending:     make(map[string]chan dispatchVerdict),
	}
}

// Status exposes the relay connection status (health checks, CLI display).
func (c *Client) Status() *Status {
	return c.status
}

// Run runs the reconnect loop until ctx is cancelled. It mints relay tokens,
// dials the relay, runs one session per successful dial, and reconnects with
// exponential backoff on failure.
func (c *Client) Run(ctx context.Context) {
	endpoint, err := normalizeWSURL(c.url)
	if err != nil {
		log.Warn().Err(err).Str("relay_url", c.url).Msg("invalid relay url; relay client disabled")
		c.status.setDisconnected("invalid relay url: " + err.Error())
		return
	}

	var cachedToken string
	var cachedTokenExpiry time.Time

	// Static token provided (local dev) — use it directly, skip API minting.
	if c.staticToken != "" {
		cachedToken = c.staticToken
		cachedTokenExpiry = time.Now().Add(365 * 24 * time.Hour) // effectively never expires
	}

	delay := reconnectInitialDelay
	for {
		select {
		case <-ctx.Done():
			log.Debug().Msg("relay client loop stopped")
			return
		default:
		}

		if c.staticToken == "" && (c.runtime == nil || !c.runtime.APIConfigured()) {
			log.Warn().Msg("relay client waiting for API credentials")
			c.status.setDisconnected("waiting for API credentials")
			select {
			case <-ctx.Done():
				return
			case <-time.After(delay):
			}
			delay = nextDelay(delay)
			continue
		}

		// Reuse the cached token if it is still valid; only mint a new one
		// when the token is missing or about to expire.
		now := time.Now()
		if c.staticToken == "" && (cachedToken == "" || now.After(cachedTokenExpiry.Add(-tokenEarlyRefreshWindow))) {
			token, expiry, err := c.mintToken()
			if err != nil {
				log.Warn().Err(err).Str("nodeId", c.nodeID).Msg("relay token mint failed")
				c.status.setDisconnected("token mint failed: " + err.Error())
				select {
				case <-ctx.Done():
					return
				case <-time.After(delay):
				}
				delay = nextDelay(delay)
				continue
			}
			cachedToken = token
			cachedTokenExpiry = expiry
		}

		endpointWithMetadata := appendClientMetadata(endpoint)
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
			c.status.setDisconnected("dial failed: " + err.Error())
			select {
			case <-ctx.Done():
				return
			case <-time.After(delay):
			}
			delay = nextDelay(delay)
			continue
		}

		log.Info().Str("relay_url", endpointWithMetadata).Str("nodeId", c.nodeID).Str("daemonVersion", release.Version).Msg("relay websocket connected")
		delay = reconnectInitialDelay
		// Invalidate the cached token after a successful session ends so the
		// next reconnect always gets a fresh token.
		cachedToken = ""
		c.status.setConnected(time.Now().UTC())

		c.runSession(ctx, conn)
		c.status.setDisconnected("session ended")
	}
}

// SendNotification writes a JSON-RPC notification to the relay connection.
func (c *Client) SendNotification(method string, params any) error {
	conn := c.conn
	if conn == nil {
		return fmt.Errorf("relay not connected")
	}
	msg := rpc.Notification{JSONRPC: "2.0", Method: method, Params: params}
	if err := conn.WriteJSON(msg); err != nil {
		return fmt.Errorf("relay write failed: %w", err)
	}
	return nil
}

// SendBinary writes a binary frame to the relay connection.
func (c *Client) SendBinary(payload []byte) error {
	conn := c.conn
	if conn == nil {
		return fmt.Errorf("relay not connected")
	}
	if err := conn.WriteBinary(payload); err != nil {
		return fmt.Errorf("relay write failed: %w", err)
	}
	return nil
}

func (c *Client) mintToken() (string, time.Time, error) {
	client := c.runtime.APIClient()
	resp, err := client.RelayToken(c.nodeID)
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

// nextDelay doubles the current delay up to reconnectMaxDelay and adds ±25%
// jitter to prevent thundering-herd reconnects when multiple daemon nodes
// disconnect simultaneously.
func nextDelay(current time.Duration) time.Duration {
	next := current * 2
	if next > reconnectMaxDelay {
		next = reconnectMaxDelay
	}
	// Add ±25% jitter: jitter is in the range [-next/4, +next/4].
	jitter := time.Duration(rand.Int63n(int64(next/2))) - next/4
	result := next + jitter
	if result < reconnectInitialDelay {
		return reconnectInitialDelay
	}
	return result
}

func appendClientMetadata(endpoint string) string {
	parsed, err := url.Parse(endpoint)
	if err != nil {
		return endpoint
	}
	query := parsed.Query()
	if version := strings.TrimSpace(release.Version); version != "" {
		query.Set("version", version)
	}
	parsed.RawQuery = query.Encode()
	return parsed.String()
}

func normalizeWSURL(raw string) (string, error) {
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
