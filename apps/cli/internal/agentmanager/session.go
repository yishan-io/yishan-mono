package agentmanager

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os/exec"
	"sync"
	"syscall"
	"time"
)

// abortGracePeriod is how long we wait after sending abort before force-killing.
const abortGracePeriod = 3 * time.Second

// Session represents a running agent subprocess. It is safe for concurrent use:
// Send can be called from one goroutine while the stdout reader goroutine calls
// OnEvent.
type Session struct {
	id          string
	tabID       string
	workspaceID string

	cmd    *exec.Cmd
	stdin  io.WriteCloser
	cancel context.CancelFunc

	// done is closed when the stdout reader goroutine exits.
	done chan struct{}

	// manager is used to unregister this session on exit.
	manager *Manager

	// mu protects stdin writes so concurrent Send calls are safe.
	mu sync.Mutex
}

// ID returns the session's unique identifier.
func (s *Session) ID() string { return s.id }

// TabID returns the frontend tab that owns this session.
func (s *Session) TabID() string { return s.tabID }

// WorkspaceID returns the workspace this session belongs to.
func (s *Session) WorkspaceID() string { return s.workspaceID }

// Send writes a JSON-RPC command to the agent's stdin. The command is
// serialized as a single JSONL line (appends \n).
func (s *Session) Send(cmd json.RawMessage) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.stdin == nil {
		return fmt.Errorf("session stdin is closed")
	}

	line := append([]byte{}, cmd...)
	line = append(line, '\n')

	_, err := s.stdin.Write(line)
	if err != nil {
		return fmt.Errorf("write to agent stdin: %w", err)
	}
	return nil
}

// Close terminates the agent session. It sends an abort command to stdin, waits
// for the process to exit gracefully (up to abortGracePeriod), then force-kills.
func (s *Session) Close() error {
	// Best-effort abort: if the stdin pipe is already broken, skip the write.
	s.mu.Lock()
	if s.stdin != nil {
		abortCmd := json.RawMessage(`{"type":"abort"}`)
		line := append([]byte{}, abortCmd...)
		line = append(line, '\n')
		_, _ = s.stdin.Write(line)
	}
	s.mu.Unlock()

	// Wait for graceful exit.
	done := make(chan error, 1)
	go func() {
		done <- s.cmd.Wait()
	}()

	select {
	case <-done:
		// Process exited on its own.
	case <-time.After(abortGracePeriod):
		// Force kill.
		_ = s.cmd.Process.Signal(syscall.SIGKILL)
		<-done
	}

	// Cancel the context to clean up any remaining resources.
	s.cancel()

	return nil
}
