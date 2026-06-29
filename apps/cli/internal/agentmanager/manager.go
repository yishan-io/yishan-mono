// Package agentmanager manages agent subprocess lifecycles. It spawns agent
// binaries, bridges stdin/stdout JSONL streams, and tracks active sessions.
//
// The package is agent-agnostic: Start takes a binary name and args. Currently
// used for pi (pi --mode rpc) but the API accepts any JSONL-speaking agent.
package agentmanager

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"sync"

	"yishan/apps/cli/internal/runtime/shellenv"
)

// ErrBinaryNotFound is returned by Start when the agent binary cannot be
// located on the system. Callers should treat this as a configuration issue
// (agent not installed) and skip gracefully.
var ErrBinaryNotFound = errors.New("agent binary not found in PATH")

// ErrSessionExists is returned by Start when a session with the given ID is
// already active.
var ErrSessionExists = errors.New("agent session already exists")

// Manager tracks active agent sessions and provides lifecycle operations.
type Manager struct {
	mu       sync.Mutex
	sessions map[string]*Session
}

// NewManager creates a new Manager with no active sessions.
func NewManager() *Manager {
	return &Manager{
		sessions: make(map[string]*Session),
	}
}

// StartOptions configures a new agent session.
type StartOptions struct {
	// SessionID uniquely identifies this session. Must be non-empty.
	SessionID string
	// TabID identifies the frontend tab that owns this session.
	TabID string
	// WorkspaceID identifies the workspace this session belongs to.
	WorkspaceID string
	// Binary is the agent executable name (e.g. "pi").
	Binary string
	// Args are passed to the agent binary.
	Args []string
	// CWD is the working directory for the agent process.
	CWD string
	// Env is the environment for the agent process. If nil, os.Environ() is
	// used after augmenting with login-shell PATH.
	Env []string
	// OnEvent is called for each JSONL line read from the agent's stdout.
	// It is called from a dedicated goroutine and must be safe for concurrent
	// use with Send (which runs in a different goroutine).
	OnEvent func(sessionID, tabID, workspaceID string, event []byte)
}

// Start spawns a new agent session. It resolves the binary against the login-shell
// PATH, starts the subprocess, and begins reading stdout events on a background
// goroutine. The session is automatically removed from the manager when the
// process exits.
func (m *Manager) Start(ctx context.Context, opts StartOptions) (*Session, error) {
	if opts.SessionID == "" {
		return nil, fmt.Errorf("sessionID is required")
	}

	m.mu.Lock()
	if _, exists := m.sessions[opts.SessionID]; exists {
		m.mu.Unlock()
		return nil, ErrSessionExists
	}
	m.mu.Unlock()

	env := opts.Env
	if env == nil {
		env = shellenv.ResolveEnvWithUserPath(os.Environ(), os.Getenv("SHELL"))
	}

	binaryPath := shellenv.ResolveExecutablePathFromEnv(opts.Binary, env)
	if binaryPath == "" {
		return nil, fmt.Errorf("%w: %s", ErrBinaryNotFound, opts.Binary)
	}

	execCtx, cancel := context.WithCancel(ctx)

	execCmd := exec.CommandContext(execCtx, binaryPath, opts.Args...)
	execCmd.Dir = opts.CWD
	execCmd.Env = env
	// Detach from daemon process group so signals sent to the daemon don't
	// propagate to the agent subprocess.
	execCmd.SysProcAttr = sysProcAttr()

	stdin, err := execCmd.StdinPipe()
	if err != nil {
		cancel()
		return nil, fmt.Errorf("create stdin pipe: %w", err)
	}

	stdout, err := execCmd.StdoutPipe()
	if err != nil {
		cancel()
		return nil, fmt.Errorf("create stdout pipe: %w", err)
	}

	// Capture stderr to the daemon log so we can diagnose agent crashes.
	execCmd.Stderr = os.Stderr

	if err := execCmd.Start(); err != nil {
		cancel()
		return nil, fmt.Errorf("start agent: %w", err)
	}

	session := &Session{
		id:          opts.SessionID,
		tabID:       opts.TabID,
		workspaceID: opts.WorkspaceID,
		cmd:         execCmd,
		stdin:       stdin,
		cancel:      cancel,
		done:        make(chan struct{}),
		manager:     m,
	}

	m.mu.Lock()
	m.sessions[opts.SessionID] = session
	m.mu.Unlock()

	// Read stdout JSONL on a background goroutine. When the goroutine exits
	// (process terminates or pipe closes), cleanup the session.
	go readStdout(session, stdout, opts.OnEvent)

	return session, nil
}

// Stop terminates an agent session by sending abort to stdin and killing the
// process. Returns nil if the session was not found.
func (m *Manager) Stop(sessionID string) error {
	m.mu.Lock()
	session, exists := m.sessions[sessionID]
	m.mu.Unlock()

	if !exists {
		return nil
	}
	return session.Close()
}

// StopAll terminates all active sessions concurrently. Called during daemon
// shutdown.
func (m *Manager) StopAll() {
	m.mu.Lock()
	sessions := make([]*Session, 0, len(m.sessions))
	for _, s := range m.sessions {
		sessions = append(sessions, s)
	}
	m.mu.Unlock()

	var wg sync.WaitGroup
	for _, s := range sessions {
		wg.Add(1)
		go func(session *Session) {
			defer wg.Done()
			_ = session.Close()
		}(s)
	}
	wg.Wait()
}

// removeSession removes a session from the manager. Called by the stdout reader
// goroutine when the process exits.
func (m *Manager) removeSession(sessionID string) {
	m.mu.Lock()
	delete(m.sessions, sessionID)
	m.mu.Unlock()
}
