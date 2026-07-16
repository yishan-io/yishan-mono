package terminal

import (
	"bytes"
	"os"
	"os/exec"
	"sync"
	"sync/atomic"
	"time"

	"yishan/apps/cli/internal/rpcerror"
)

const (
	rpcCodeInvalidParams   = rpcerror.CodeInvalidParams
	rpcCodeNotFound        = rpcerror.CodeNotFound
	rpcCodeSessionInactive = rpcerror.CodeSessionInactive
)

const maxSessionOutputBytes = 2 * 1024 * 1024
const portScanActivityWindow = 15 * time.Second
const portScanHintDebounce = 500 * time.Millisecond

// portScanTailSize is the number of bytes kept from the end of recent PTY
// output so that port announcements split across multiple small read chunks
// are still detected reliably.
const portScanTailSize = 256

type portsChangedListener func([]DetectedPort)

type Manager struct {
	mu                   sync.RWMutex
	nextID               atomic.Uint64
	nextSubID            atomic.Uint64
	sessions             map[string]*session
	portsListenerMu      sync.RWMutex
	onPortsChanged       portsChangedListener
	portLoopMu           sync.Mutex
	portLoopRunning      bool
	portSnapshotMu       sync.Mutex
	lastPortSnapshotKey  string
	portScopeWorkspaceID string
	portScanHintCh       chan struct{}
	sessionsListenerMu   sync.RWMutex
	onSessionsChanged    SessionLifecycleListener
}

type session struct {
	id                   string
	workspaceID          string
	tabID                string
	paneID               string
	cmd                  *exec.Cmd
	pty                  *os.File
	output               bytes.Buffer
	outputMu             sync.Mutex
	running              atomic.Bool
	exitCode             atomic.Int32
	startedAt            time.Time
	exitedAtUnixNano     atomic.Int64
	lastActivityUnixNano atomic.Int64
	subsMu               sync.Mutex
	subs                 map[uint64]chan Event
	portHintFn           func()
	portScanTail         []byte
	destroyedPublished   atomic.Bool
}

func NewManager() *Manager {
	return &Manager{sessions: make(map[string]*session), portScanHintCh: make(chan struct{}, 1)}
}

func (m *Manager) SetPortsChangedListener(listener portsChangedListener) {
	m.portsListenerMu.Lock()
	m.onPortsChanged = listener
	m.portsListenerMu.Unlock()
}

func (m *Manager) SetSessionsChangedListener(listener SessionLifecycleListener) {
	m.sessionsListenerMu.Lock()
	m.onSessionsChanged = listener
	m.sessionsListenerMu.Unlock()
}

func (m *Manager) publishPortsChanged(ports []DetectedPort) {
	m.portsListenerMu.RLock()
	listener := m.onPortsChanged
	m.portsListenerMu.RUnlock()
	if listener == nil {
		return
	}
	listener(ports)
}

func (m *Manager) publishSessionChanged(event SessionLifecycleEvent) {
	m.sessionsListenerMu.RLock()
	listener := m.onSessionsChanged
	m.sessionsListenerMu.RUnlock()
	if listener == nil {
		return
	}
	listener(event)
}

func (m *Manager) buildSessionLifecycleEvent(s *session, action string, status string) SessionLifecycleEvent {
	return SessionLifecycleEvent{
		Action:      action,
		SessionID:   s.id,
		WorkspaceID: s.workspaceID,
		TabID:       s.tabID,
		PaneID:      s.paneID,
		PID:         s.cmd.Process.Pid,
		Status:      status,
		StartedAt:   s.startedAt.Format(time.RFC3339Nano),
	}
}
