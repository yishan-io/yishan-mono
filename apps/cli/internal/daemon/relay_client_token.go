package daemon

import (
	"fmt"
	"math/rand"
	"strings"
	"time"

	cliruntime "yishan/apps/cli/internal/runtime"
)

func mintRelayToken(runtime *cliruntime.Runtime, nodeID string) (string, time.Time, error) {
	client := runtime.APIClient()
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
