package daemon

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	"github.com/rs/zerolog/log"
	"yishan/apps/cli/internal/buildinfo"
	cliruntime "yishan/apps/cli/internal/runtime"
)

const relayMethodPing = "relay.ping"
const relayMethodPong = "relay.pong"
const relayMethodJobRun = "job.run"
const relayMethodWorkspaceSnapshotChanged = "workspace.snapshot.changed"
const relayMethodTerminalSessionChanged = "terminal.session.changed"
const relayMethodTerminalStreamRequest = "terminal.stream.request"
const relayMethodTerminalStreamAccept = "terminal.stream.accept"
const relayMethodTerminalStreamCancel = "terminal.stream.cancel"

const relayReconnectInitialDelay = 2 * time.Second
const relayReconnectMaxDelay = 30 * time.Second

// relayTokenEarlyRefreshWindow refreshes the token this long before it expires.
const relayTokenEarlyRefreshWindow = 60 * time.Second

func runRelayClientLoop(ctx context.Context, runtime *cliruntime.Runtime, handler *JSONRPCHandler, nodeID string, relayURL string, staticToken string, status *RelayStatus) {
	endpoint, err := normalizeRelayWSURL(relayURL)
	if err != nil {
		log.Warn().Err(err).Str("relay_url", relayURL).Msg("invalid relay url; relay client disabled")
		status.setDisconnected("invalid relay url: " + err.Error())
		return
	}

	var cachedToken string
	var cachedTokenExpiry time.Time

	// Static token provided (local dev) — use it directly, skip API minting.
	if staticToken != "" {
		cachedToken = staticToken
		cachedTokenExpiry = time.Now().Add(365 * 24 * time.Hour) // effectively never expires
	}

	delay := relayReconnectInitialDelay
	for {
		select {
		case <-ctx.Done():
			log.Debug().Msg("relay client loop stopped")
			return
		default:
		}

		if staticToken == "" && (runtime == nil || !runtime.APIConfigured()) {
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
		if staticToken == "" && (cachedToken == "" || now.After(cachedTokenExpiry.Add(-relayTokenEarlyRefreshWindow))) {
			token, expiry, err := mintRelayToken(runtime, nodeID)
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

		runRelaySession(handler, runtime, nodeID, conn)
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
