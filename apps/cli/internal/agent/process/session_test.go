package process

import (
	"context"
	"runtime"
	"testing"
	"time"
)

func TestSessionClose_KillsDescendantHoldingStdout(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("shell descendant test is unix-only")
	}

	m := NewManager()
	ready := make(chan struct{})
	session, err := m.Start(context.Background(), StartOptions{
		SessionID: "descendant-stdout",
		Binary:    "sh",
		// The shell exits immediately, but sleep retains its inherited stdout.
		Args: []string{"-c", "sleep 30 & printf 'ready\\n'"},
		OnEvent: func(sessionID, tabID, workspaceID string, event []byte) {
			if string(event) == "ready" {
				close(ready)
			}
		},
	})
	if err != nil {
		t.Fatalf("Start failed: %v", err)
	}
	defer func() { _ = session.Close() }()

	waitForProcessSignal(t, ready, "descendant startup")
	closeDone := make(chan error, 1)
	go func() { closeDone <- session.Close() }()
	select {
	case err := <-closeDone:
		if err != nil {
			t.Fatalf("Close failed: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("Close hung while descendant retained stdout")
	}
}
