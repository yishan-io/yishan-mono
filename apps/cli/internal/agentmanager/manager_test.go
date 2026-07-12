package agentmanager

import (
	"context"
	"encoding/json"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestNewManager(t *testing.T) {
	m := NewManager()
	if m == nil {
		t.Fatal("NewManager returned nil")
	}
}

func TestStartEmptySessionID(t *testing.T) {
	m := NewManager()
	ctx := context.Background()

	_, err := m.Start(ctx, StartOptions{SessionID: ""})
	if err == nil {
		t.Fatal("expected error for empty sessionID")
	}
	if !strings.Contains(err.Error(), "sessionID is required") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestStartBinaryNotFound(t *testing.T) {
	m := NewManager()
	ctx := context.Background()

	_, err := m.Start(ctx, StartOptions{
		SessionID: "test-session",
		Binary:    "nonexistent-binary-xyzzy",
	})
	if err == nil {
		t.Fatal("expected ErrBinaryNotFound")
	}
	if !strings.Contains(err.Error(), "not found") {
		t.Fatalf("expected not-found error, got: %v", err)
	}
}

func TestStartDuplicateSession(t *testing.T) {
	m := NewManager()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sessionID := "dup-session"
	opts := StartOptions{
		SessionID: sessionID,
		Binary:    "sleep",
		Args:      []string{"5"},
	}

	s1, err := m.Start(ctx, opts)
	if err != nil {
		t.Fatalf("first Start failed: %v", err)
	}
	defer s1.Close()

	_, err = m.Start(ctx, opts)
	if err != ErrSessionExists {
		t.Fatalf("expected ErrSessionExists, got: %v", err)
	}
}

func TestStartStopLifecycle(t *testing.T) {
	m := NewManager()
	ctx := context.Background()

	opts := StartOptions{
		SessionID:   "lifecycle-test",
		TabID:       "tab-1",
		WorkspaceID: "ws-1",
		Binary:      "sleep",
		Args:        []string{"1"},
	}

	session, err := m.Start(ctx, opts)
	if err != nil {
		t.Fatalf("Start failed: %v", err)
	}

	if session.ID() != "lifecycle-test" {
		t.Fatalf("session ID mismatch: %s", session.ID())
	}
	if session.TabID() != "tab-1" {
		t.Fatalf("tab ID mismatch: %s", session.TabID())
	}
	if session.WorkspaceID() != "ws-1" {
		t.Fatalf("workspace ID mismatch: %s", session.WorkspaceID())
	}

	// Wait for the process to exit naturally so Close is fast.
	time.Sleep(1500 * time.Millisecond)

	// Stop should clean up the already-exited session.
	if err := m.Stop(opts.SessionID); err != nil {
		t.Fatalf("Stop failed: %v", err)
	}

	// Second stop should be a no-op.
	if err := m.Stop(opts.SessionID); err != nil {
		t.Fatalf("second Stop should be no-op, got: %v", err)
	}
}

func TestStopAll(t *testing.T) {
	m := NewManager()
	ctx := context.Background()

	// Start two sessions.
	opts1 := StartOptions{SessionID: "s1", Binary: "sleep", Args: []string{"1"}}
	opts2 := StartOptions{SessionID: "s2", Binary: "sleep", Args: []string{"1"}}

	s1, err := m.Start(ctx, opts1)
	if err != nil {
		t.Fatalf("Start s1 failed: %v", err)
	}
	s2, err := m.Start(ctx, opts2)
	if err != nil {
		t.Fatalf("Start s2 failed: %v", err)
	}

	_ = s1
	_ = s2

	m.StopAll()

	// Starting again with same IDs should succeed.
	s1b, err := m.Start(ctx, opts1)
	if err != nil {
		t.Fatalf("re-Start s1 failed: %v", err)
	}
	defer s1b.Close()
}

func TestStopWaitsForStdoutCleanupBeforeReleasingSessionID(t *testing.T) {
	m := NewManager()
	ctx := context.Background()

	callbackEntered := make(chan struct{})
	unblockCallback := make(chan struct{})
	var unblockOnce sync.Once
	unblock := func() {
		unblockOnce.Do(func() {
			close(unblockCallback)
		})
	}

	opts := StartOptions{
		SessionID: "cleanup-test",
		Binary:    "sh",
		Args:      []string{"-c", "echo '{\"type\":\"ready\"}'"},
		OnEvent: func(sessionID, tabID, workspaceID string, event []byte) {
			close(callbackEntered)
			<-unblockCallback
		},
	}

	session, err := m.Start(ctx, opts)
	if err != nil {
		t.Fatalf("Start failed: %v", err)
	}
	defer func() {
		unblock()
		_ = session.Close()
	}()

	select {
	case <-callbackEntered:
		// Expected.
	case <-time.After(5 * time.Second):
		t.Fatal("stdout callback did not start")
	}

	stopDone := make(chan error, 1)
	go func() {
		stopDone <- m.Stop(opts.SessionID)
	}()

	select {
	case err := <-stopDone:
		t.Fatalf("Stop returned before stdout cleanup finished: %v", err)
	case <-time.After(150 * time.Millisecond):
		// Expected: Stop should still be waiting for readStdout cleanup.
	}

	unblock()

	select {
	case err := <-stopDone:
		if err != nil {
			t.Fatalf("Stop failed: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("Stop did not return after stdout cleanup completed")
	}

	restarted, err := m.Start(ctx, StartOptions{SessionID: opts.SessionID, Binary: "sleep", Args: []string{"1"}})
	if err != nil {
		t.Fatalf("re-Start failed after Stop returned: %v", err)
	}
	defer restarted.Close()
}

func TestStdoutEventDelivery(t *testing.T) {
	m := NewManager()
	ctx := context.Background()

	var mu sync.Mutex
	var events []json.RawMessage

	opts := StartOptions{
		SessionID: "event-test",
		Binary:    "sh",
		Args:      []string{"-c", "echo '{\"type\":\"hello\"}' && echo '{\"type\":\"world\"}'"},
		OnEvent: func(sessionID, tabID, workspaceID string, event []byte) {
			mu.Lock()
			defer mu.Unlock()
			events = append(events, json.RawMessage(event))
		},
	}

	_, err := m.Start(ctx, opts)
	if err != nil {
		t.Fatalf("Start failed: %v", err)
	}

	// Wait for process to exit naturally (echo is fast).
	time.Sleep(500 * time.Millisecond)

	mu.Lock()
	defer mu.Unlock()

	if len(events) != 2 {
		t.Fatalf("expected 2 events, got %d", len(events))
	}
	if !strings.Contains(string(events[0]), "hello") {
		t.Fatalf("first event should contain 'hello', got: %s", events[0])
	}
	if !strings.Contains(string(events[1]), "world") {
		t.Fatalf("second event should contain 'world', got: %s", events[1])
	}
}

func TestSessionSend(t *testing.T) {
	m := NewManager()
	ctx := context.Background()

	var mu sync.Mutex
	var received []json.RawMessage

	// Use cat to echo back what it receives on stdin to stdout.
	opts := StartOptions{
		SessionID: "send-test",
		Binary:    "cat",
		OnEvent: func(sessionID, tabID, workspaceID string, event []byte) {
			mu.Lock()
			defer mu.Unlock()
			received = append(received, json.RawMessage(event))
		},
	}

	session, err := m.Start(ctx, opts)
	if err != nil {
		t.Fatalf("Start failed: %v", err)
	}

	// Send a command — cat will echo it to stdout.
	if err := session.Send(json.RawMessage(`{"type":"prompt","message":"hello"}`)); err != nil {
		t.Fatalf("Send failed: %v", err)
	}

	// cat needs stdin to close before it exits. Close the session.
	if err := session.Close(); err != nil {
		t.Fatalf("Close failed: %v", err)
	}

	mu.Lock()
	defer mu.Unlock()

	if len(received) < 1 {
		t.Fatal("expected at least 1 event")
	}
	if !strings.Contains(string(received[0]), "prompt") {
		t.Fatalf("event should contain 'prompt', got: %s", received[0])
	}
}

func TestSessionCloseStopsProcess(t *testing.T) {
	m := NewManager()
	ctx := context.Background()

	opts := StartOptions{
		SessionID: "close-test",
		Binary:    "sleep",
		Args:      []string{"1"},
	}

	session, err := m.Start(ctx, opts)
	if err != nil {
		t.Fatalf("Start failed: %v", err)
	}

	// Close should kill the process promptly.
	start := time.Now()
	if err := session.Close(); err != nil {
		t.Fatalf("Close failed: %v", err)
	}
	elapsed := time.Since(start)

	// Should not take anywhere near 60 seconds.
	if elapsed > 5*time.Second {
		t.Fatalf("Close took too long: %v", elapsed)
	}
}

func TestManagerContextCancellation(t *testing.T) {
	m := NewManager()
	ctx, cancel := context.WithCancel(context.Background())

	opts := StartOptions{
		SessionID: "ctx-test",
		Binary:    "sleep",
		Args:      []string{"1"},
	}

	session, err := m.Start(ctx, opts)
	if err != nil {
		t.Fatalf("Start failed: %v", err)
	}

	// Cancel the context — process should be killed.
	cancel()

	// Wait for the stdout goroutine to notice and clean up.
	select {
	case <-session.done:
		// Expected.
	case <-time.After(5 * time.Second):
		t.Fatal("session did not exit after context cancellation")
	}
}

func TestSplitEnvPair(t *testing.T) {
	tests := []struct {
		input   string
		wantKey string
		wantVal string
	}{
		{"KEY=value", "KEY", "value"},
		{"KEY=val=ue", "KEY", "val=ue"},
		{"KEY=", "KEY", ""},
		{"KEY", "KEY", ""},
		{"", "", ""},
	}
	for _, tc := range tests {
		got := splitEnvPair(tc.input)
		if got[0] != tc.wantKey || got[1] != tc.wantVal {
			t.Errorf("splitEnvPair(%q) = %v, want [%q, %q]", tc.input, got, tc.wantKey, tc.wantVal)
		}
	}
}
