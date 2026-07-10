package daemon

import (
	"testing"
	"time"
)

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

func TestAttachEventStreamClosesConnectionWhenStreamEndsUnexpectedly(t *testing.T) {
	state := newWSConnState(nil)
	events := make(chan frontendEvent)
	cancelCalled := make(chan struct{}, 1)
	closed := make(chan struct{}, 1)

	state.AddCloseHook(func() {
		select {
		case closed <- struct{}{}:
		default:
		}
	})

	state.AttachEventStream(events, func() {
		select {
		case cancelCalled <- struct{}{}:
		default:
		}
	})

	close(events)

	select {
	case <-closed:
	case <-time.After(500 * time.Millisecond):
		t.Fatal("expected unexpected event stream end to close the websocket connection")
	}

	select {
	case <-cancelCalled:
	case <-time.After(500 * time.Millisecond):
		t.Fatal("expected websocket close to cancel the frontend event stream")
	}
}

func TestDetachEventStreamDoesNotCloseConnection(t *testing.T) {
	state := newWSConnState(nil)
	events := make(chan frontendEvent)
	cancelCalled := make(chan struct{}, 1)
	closed := make(chan struct{}, 1)

	state.AddCloseHook(func() {
		select {
		case closed <- struct{}{}:
		default:
		}
	})

	state.AttachEventStream(events, func() {
		close(events)
		select {
		case cancelCalled <- struct{}{}:
		default:
		}
	})

	state.DetachEventStream()

	select {
	case <-cancelCalled:
	case <-time.After(500 * time.Millisecond):
		t.Fatal("expected detach to cancel the frontend event stream")
	}

	select {
	case <-closed:
		t.Fatal("expected explicit event stream detach to keep the websocket connection open")
	case <-time.After(100 * time.Millisecond):
	}
}
