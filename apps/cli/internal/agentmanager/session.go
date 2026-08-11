package agentmanager

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os/exec"
	"sync"
	"syscall"
	"time"
)

// abortGracePeriod is how long we wait after sending abort + closing stdin
// before force-killing the agent process. Closing stdin makes agents such as
// pi exit promptly on EOF, so the grace is only reached for agents that keep
// running after stdin closes.
const abortGracePeriod = 3 * time.Second

// ErrStdinClosed is returned by Session.Send when the session is being or has
// been torn down (stdin pipe closed). Callers can treat it as "session gone".
var ErrStdinClosed = errors.New("session stdin is closed")

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

	// onExit is invoked once after the process exits and the session has been
	// unregistered from the manager. It runs on the stdout reader goroutine.
	onExit func(session *Session)

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
		return ErrStdinClosed
	}

	line := append([]byte{}, cmd...)
	line = append(line, '\n')

	_, err := s.stdin.Write(line)
	if err != nil {
		// The pipe is dead (process exited or was killed). Mark it closed so
		// later Send calls fail fast and callers can treat the session as gone.
		s.stdin = nil
		return fmt.Errorf("%w: %v", ErrStdinClosed, err)
	}
	return nil
}

// Close terminates the agent session. It sends an abort command to stdin and
// closes the stdin pipe (RPC-mode agents such as pi exit promptly on stdin
// EOF), waits for the process to exit gracefully (up to abortGracePeriod), then
// force-kills.
func (s *Session) Close() error {
	// Best-effort abort, then close stdin. Closing stdin both signals agents
	// that read commands from stdin (e.g. pi --mode rpc exits on EOF) and stops
	// any further Send calls from reaching a session being torn down.
	s.mu.Lock()
	if s.stdin != nil {
		abortCmd := json.RawMessage(`{"type":"abort"}`)
		line := append([]byte{}, abortCmd...)
		line = append(line, '\n')
		_, _ = s.stdin.Write(line)
		_ = s.stdin.Close()
		s.stdin = nil
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

	// Do not report the session as stopped until the stdout reader goroutine has
	// finished its deferred cleanup and unregistered the session from the
	// manager. Callers rely on Stop returning only after the session ID can be
	// reused safely.
	<-s.done

	return nil
}
