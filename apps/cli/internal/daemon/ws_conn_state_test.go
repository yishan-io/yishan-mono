package daemon

import "testing"

func TestTerminalInputSessionIDRequiresAttachedSubscription(t *testing.T) {
	state := newWSConnState(nil)

	if sessionID, ok := state.terminalInputSessionID([]byte("term-1")); ok || sessionID != "" {
		t.Fatalf("expected unsubscribed session to be rejected, got ok=%t sessionID=%q", ok, sessionID)
	}

	state.AttachSubscription("term-1", 1, nil, func(sessionID string, subscriptionID uint64) {})

	sessionID, ok := state.terminalInputSessionID([]byte("term-1"))
	if !ok || sessionID != "term-1" {
		t.Fatalf("expected attached session to be accepted, got ok=%t sessionID=%q", ok, sessionID)
	}

	state.DetachSubscription("term-1")

	if sessionID, ok := state.terminalInputSessionID([]byte("term-1")); ok || sessionID != "" {
		t.Fatalf("expected detached session to be rejected, got ok=%t sessionID=%q", ok, sessionID)
	}
}
