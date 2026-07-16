package terminal

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/creack/pty"
	"github.com/rs/zerolog/log"

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

func (m *Manager) Start(_ context.Context, cwd string, req StartRequest) (StartResponse, error) {
	command, args := resolveCommand(req, runtime.GOOS, os.Getenv("SHELL"))

	cmd := exec.Command(command, args...)
	cmd.Dir = cwd
	cmd.Env = resolveSessionMetadataEnv(resolveEnv(os.Environ(), req.Env), req)

	ptyFile, err := pty.Start(cmd)
	if err != nil {
		return StartResponse{}, err
	}

	id := fmt.Sprintf("term-%d", m.nextID.Add(1))
	s := &session{
		id:          id,
		workspaceID: req.WorkspaceID,
		tabID:       strings.TrimSpace(req.TabID),
		paneID:      strings.TrimSpace(req.PaneID),
		cmd:         cmd,
		pty:         ptyFile,
		startedAt:   time.Now().UTC(),
		subs:        make(map[uint64]chan Event),
	}
	s.portHintFn = m.requestPortScanHint
	s.running.Store(true)
	s.exitCode.Store(-1)
	s.lastActivityUnixNano.Store(time.Now().UTC().UnixNano())

	m.mu.Lock()
	m.sessions[id] = s
	m.mu.Unlock()
	m.ensurePortScanLoop()

	m.publishSessionChanged(m.buildSessionLifecycleEvent(s, "created", "running"))

	go s.capture()
	go func() {
		err := cmd.Wait()
		code := int32(0)
		if err != nil {
			if exitErr, ok := err.(*exec.ExitError); ok {
				code = int32(exitErr.ExitCode())
			} else {
				code = -1
			}
		}
		s.exitCode.Store(code)
		s.running.Store(false)
		s.exitedAtUnixNano.Store(time.Now().UTC().UnixNano())
		_ = s.pty.Close()
		// Immediately scan so ports owned by this session are cleared
		// without waiting for the fallback ticker.
		m.requestPortScanHint()

		exit := int(code)
		s.broadcast(Event{SessionID: s.id, Type: "exit", ExitCode: &exit})
		s.closeSubscribers()

		if s.destroyedPublished.CompareAndSwap(false, true) {
			m.publishSessionChanged(m.buildSessionLifecycleEvent(s, "destroyed", "exited"))
		}
	}()

	return StartResponse{SessionID: id}, nil
}

func (m *Manager) ListSessions(req ListSessionsRequest) []SessionSummary {
	m.mu.RLock()
	sessions := make([]*session, 0, len(m.sessions))
	for _, s := range m.sessions {
		sessions = append(sessions, s)
	}
	m.mu.RUnlock()

	out := make([]SessionSummary, 0, len(sessions))
	for _, s := range sessions {
		running := s.running.Load()
		if !running && !req.IncludeExited {
			continue
		}

		status := "exited"
		if running {
			status = "running"
		}

		summary := SessionSummary{
			SessionID:   s.id,
			WorkspaceID: s.workspaceID,
			PID:         s.cmd.Process.Pid,
			Status:      status,
			StartedAt:   s.startedAt.Format(time.RFC3339Nano),
		}
		if exitedAtUnixNano := s.exitedAtUnixNano.Load(); exitedAtUnixNano > 0 {
			summary.ExitedAt = time.Unix(0, exitedAtUnixNano).UTC().Format(time.RFC3339Nano)
		}
		out = append(out, summary)
	}

	sort.Slice(out, func(i, j int) bool {
		return out[i].SessionID < out[j].SessionID
	})
	return out
}

func (m *Manager) ListDetectedPorts() []DetectedPort {
	return m.collectDetectedPortsForWindow(0, m.currentPortScopeWorkspaceID())
}

func (m *Manager) collectDetectedPortsForWindow(recentWindow time.Duration, workspaceScopeID string) []DetectedPort {
	sessions := m.listRunningSessions(recentWindow, workspaceScopeID)
	if len(sessions) == 0 && recentWindow > 0 {
		sessions = m.listRunningSessions(0, workspaceScopeID)
	}

	if len(sessions) == 0 {
		return nil
	}

	sessionByPID := make(map[int]*session)
	rootPIDs := make([]int, 0, len(sessions))
	for _, s := range sessions {
		pid := s.cmd.Process.Pid
		sessionByPID[pid] = s
		rootPIDs = append(rootPIDs, pid)
	}

	processes, err := listProcesses()
	if err != nil {
		return nil
	}
	pidToRoot := buildPIDToRootMap(rootPIDs, processes)

	trackedPIDs := make([]int, 0, len(pidToRoot))
	for pid := range pidToRoot {
		trackedPIDs = append(trackedPIDs, pid)
	}

	listeningPorts, err := listListeningTCPPorts(trackedPIDs)
	if err != nil {
		log.Debug().Err(err).Msg("[ports] listListeningTCPPorts error")
		return nil
	}
	log.Debug().Int("trackedPIDs", len(trackedPIDs)).Int("listeningPorts", len(listeningPorts)).Msg("[ports] lsof result")

	out := make([]DetectedPort, 0, len(listeningPorts))
	for _, port := range listeningPorts {
		rootPID, ok := pidToRoot[port.PID]
		if !ok {
			continue
		}
		session := sessionByPID[rootPID]
		log.Debug().Str("sessionId", session.id).Str("workspaceId", session.workspaceID).Int("port", port.Port).Msg("[ports] detected port")
		out = append(out, DetectedPort{
			SessionID:   session.id,
			WorkspaceID: session.workspaceID,
			PID:         port.PID,
			Port:        port.Port,
			Address:     port.Address,
			ProcessName: port.ProcessName,
		})
	}

	sort.Slice(out, func(i, j int) bool {
		if out[i].WorkspaceID != out[j].WorkspaceID {
			return out[i].WorkspaceID < out[j].WorkspaceID
		}
		if out[i].Port != out[j].Port {
			return out[i].Port < out[j].Port
		}
		return out[i].PID < out[j].PID
	})
	return out
}

func (m *Manager) listRunningSessions(recentWindow time.Duration, workspaceScopeID string) []*session {
	var threshold int64
	if recentWindow > 0 {
		threshold = time.Now().UTC().Add(-recentWindow).UnixNano()
	}
	workspaceScopeID = strings.TrimSpace(workspaceScopeID)

	m.mu.RLock()
	defer m.mu.RUnlock()

	sessions := make([]*session, 0, len(m.sessions))
	for _, currentSession := range m.sessions {
		if !currentSession.running.Load() || currentSession.cmd.Process == nil {
			continue
		}
		if workspaceScopeID != "" && currentSession.workspaceID != workspaceScopeID {
			continue
		}
		if threshold > 0 && currentSession.lastActivityUnixNano.Load() < threshold {
			continue
		}
		sessions = append(sessions, currentSession)
	}

	return sessions
}

func (m *Manager) ensurePortScanLoop() {
	m.portLoopMu.Lock()
	if m.portLoopRunning {
		m.portLoopMu.Unlock()
		return
	}
	m.portLoopRunning = true
	m.portLoopMu.Unlock()

	go m.runPortScanLoop()
}

func (m *Manager) runPortScanLoop() {
	defer func() {
		m.portLoopMu.Lock()
		m.portLoopRunning = false
		m.portLoopMu.Unlock()
	}()

	// debounce timer: started when a hint arrives, fires after portScanHintDebounce
	// to coalesce rapid bursts (e.g. multi-line startup log).
	debounce := time.NewTimer(0)
	if !debounce.Stop() {
		<-debounce.C
	}
	debouncing := false

	// idle check: periodically verify that sessions are still alive so the
	// loop can exit when all sessions have ended. No subprocess is spawned.
	idleCheck := time.NewTicker(30 * time.Second)
	defer idleCheck.Stop()

	scan := func() bool {
		debouncing = false
		if !m.hasActiveSessions() {
			if m.shouldPublishPortsUpdate(nil) {
				m.publishPortsChanged(nil)
			}
			return false
		}
		recentWindow := time.Duration(0)
		workspaceScopeID := m.currentPortScopeWorkspaceID()
		if m.hasRecentlyActiveSessions(portScanActivityWindow) {
			recentWindow = portScanActivityWindow
		}
		ports := m.collectDetectedPortsForWindow(recentWindow, workspaceScopeID)
		log.Debug().Int("count", len(ports)).Str("workspaceScopeID", workspaceScopeID).Msg("[ports] scan complete")
		if m.shouldPublishPortsUpdate(ports) {
			log.Debug().Int("count", len(ports)).Msg("[ports] publishing ports changed")
			m.publishPortsChanged(ports)
		}
		return true
	}

	for {
		select {
		case <-idleCheck.C:
			// No subprocess scan — just check whether any sessions are still
			// running so we can shut down the loop when they're all gone.
			if !m.hasActiveSessions() {
				if m.shouldPublishPortsUpdate(nil) {
					m.publishPortsChanged(nil)
				}
				return
			}

		case <-m.portScanHintCh:
			// Coalesce: reset the debounce window on every incoming hint so
			// that a burst of matching lines (e.g. http-server printing several
			// "Available on: http://…:port" lines) results in a single scan
			// fired portScanHintDebounce after the last hint.
			if debouncing {
				if !debounce.Stop() {
					select {
					case <-debounce.C:
					default:
					}
				}
			}
			debounce.Reset(portScanHintDebounce)
			debouncing = true

		case <-debounce.C:
			if !scan() {
				return
			}
		}
	}
}

func (m *Manager) requestPortScanHint() {
	select {
	case m.portScanHintCh <- struct{}{}:
	default:
	}
}

func (m *Manager) SetActiveWorkspace(req SetActiveWorkspaceRequest) (SetActiveWorkspaceResponse, error) {
	m.portSnapshotMu.Lock()
	m.portScopeWorkspaceID = strings.TrimSpace(req.WorkspaceID)
	m.lastPortSnapshotKey = ""
	m.portSnapshotMu.Unlock()
	return SetActiveWorkspaceResponse{Updated: true}, nil
}

func (m *Manager) currentPortScopeWorkspaceID() string {
	m.portSnapshotMu.Lock()
	defer m.portSnapshotMu.Unlock()
	return m.portScopeWorkspaceID
}

func (m *Manager) hasRecentlyActiveSessions(window time.Duration) bool {
	threshold := time.Now().UTC().Add(-window).UnixNano()
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, currentSession := range m.sessions {
		if !currentSession.running.Load() || currentSession.cmd.Process == nil {
			continue
		}
		if currentSession.lastActivityUnixNano.Load() >= threshold {
			return true
		}
	}
	return false
}

func (m *Manager) hasActiveSessions() bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, session := range m.sessions {
		if session.running.Load() && session.cmd.Process != nil {
			return true
		}
	}
	return false
}

func (m *Manager) shouldPublishPortsUpdate(ports []DetectedPort) bool {
	key := buildPortSnapshotKey(ports)

	m.portSnapshotMu.Lock()
	defer m.portSnapshotMu.Unlock()
	if key == m.lastPortSnapshotKey {
		return false
	}
	m.lastPortSnapshotKey = key
	return true
}

func buildPortSnapshotKey(ports []DetectedPort) string {
	if len(ports) == 0 {
		return ""
	}

	var builder strings.Builder
	for _, port := range ports {
		builder.WriteString(port.SessionID)
		builder.WriteByte('|')
		builder.WriteString(port.WorkspaceID)
		builder.WriteByte('|')
		builder.WriteString(strconv.Itoa(port.PID))
		builder.WriteByte('|')
		builder.WriteString(strconv.Itoa(port.Port))
		builder.WriteByte('|')
		builder.WriteString(port.Address)
		builder.WriteByte('|')
		builder.WriteString(port.ProcessName)
		builder.WriteByte('\n')
	}

	return builder.String()
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

func (m *Manager) Send(req SendRequest) (SendResponse, error) {
	s, err := m.session(req.SessionID)
	if err != nil {
		return SendResponse{}, err
	}

	if !s.running.Load() {
		return SendResponse{}, rpcerror.New(rpcCodeSessionInactive, "terminal session not running")
	}

	n, err := io.WriteString(s.pty, req.Input)
	if err != nil {
		return SendResponse{}, err
	}
	s.lastActivityUnixNano.Store(time.Now().UTC().UnixNano())
	if strings.ContainsRune(req.Input, rune(0x03)) {
		m.requestPortScanHint()
	}
	return SendResponse{Written: n}, nil
}

// SendRaw writes raw bytes directly to a PTY session without any
// string conversion. Used by the binary WebSocket fast-path.
func (m *Manager) SendRaw(sessionID string, data []byte) {
	s, err := m.session(sessionID)
	if err != nil {
		return
	}
	if !s.running.Load() {
		return
	}
	s.lastActivityUnixNano.Store(time.Now().UTC().UnixNano())
	for _, currentByte := range data {
		if currentByte == 0x03 {
			m.requestPortScanHint()
			break
		}
	}
	_, _ = s.pty.Write(data)
}

func (m *Manager) Read(req ReadRequest) (ReadResponse, error) {
	s, err := m.session(req.SessionID)
	if err != nil {
		return ReadResponse{}, err
	}

	s.outputMu.Lock()
	out := s.output.String()
	s.output.Reset()
	s.outputMu.Unlock()

	running := s.running.Load()
	if running {
		return ReadResponse{Output: out, Running: true}, nil
	}

	code := int(s.exitCode.Load())
	return ReadResponse{Output: out, ExitCode: &code, Running: false}, nil
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

func (m *Manager) Stop(req StopRequest) (StopResponse, error) {
	s, err := m.session(req.SessionID)
	if err != nil {
		return StopResponse{}, err
	}

	if s.running.Load() {
		if err := stopListeningProcessesForSession(s); err != nil {
			return StopResponse{}, fmt.Errorf("terminal session cleanup failed: %w", err)
		}
		if err := stopProcess(s.cmd); err != nil {
			return StopResponse{}, err
		}
		s.running.Store(false)
	}
	_ = s.pty.Close()
	s.closeSubscribers()

	if s.destroyedPublished.CompareAndSwap(false, true) {
		m.publishSessionChanged(m.buildSessionLifecycleEvent(s, "destroyed", "exited"))
	}

	m.mu.Lock()
	delete(m.sessions, s.id)
	m.mu.Unlock()
	m.requestPortScanHint()

	return StopResponse{Stopped: true}, nil
}

func (m *Manager) StopAllForWorkspace(workspaceID string) []error {
	m.mu.RLock()
	var targets []*session
	for _, s := range m.sessions {
		if s.workspaceID == workspaceID {
			targets = append(targets, s)
		}
	}
	m.mu.RUnlock()

	var errs []error
	for _, s := range targets {
		if s.running.Load() {
			if err := stopListeningProcessesForSession(s); err != nil {
				errs = append(errs, fmt.Errorf("session %s: cleanup port-listening processes: %w", s.id, err))
			}
			if err := stopProcess(s.cmd); err != nil {
				errs = append(errs, fmt.Errorf("session %s: stop process: %w", s.id, err))
			}
			s.running.Store(false)
		}
		_ = s.pty.Close()
		s.closeSubscribers()

		if s.destroyedPublished.CompareAndSwap(false, true) {
			m.publishSessionChanged(m.buildSessionLifecycleEvent(s, "destroyed", "exited"))
		}

		m.mu.Lock()
		delete(m.sessions, s.id)
		m.mu.Unlock()
	}

	return errs
}

func (m *Manager) KillProcess(req KillProcessRequest) (KillProcessResponse, error) {
	if req.PID <= 0 {
		return KillProcessResponse{}, rpcerror.New(rpcCodeInvalidParams, "pid is required")
	}

	if err := stopProcessByPID(req.PID); err != nil {
		return KillProcessResponse{}, err
	}
	m.requestPortScanHint()

	return KillProcessResponse{Killed: true}, nil
}

func stopListeningProcessesForSession(s *session) error {
	if s == nil || s.cmd == nil || s.cmd.Process == nil {
		return nil
	}

	processes, err := listProcesses()
	if err != nil {
		return err
	}

	pidToRoot := buildPIDToRootMap([]int{s.cmd.Process.Pid}, processes)
	trackedPIDs := make([]int, 0, len(pidToRoot))
	for pid := range pidToRoot {
		trackedPIDs = append(trackedPIDs, pid)
	}

	listeningPorts, err := listListeningTCPPorts(trackedPIDs)
	if err != nil {
		return err
	}

	listeningPIDs := make(map[int]struct{})
	for _, port := range listeningPorts {
		rootPID, ok := pidToRoot[port.PID]
		if !ok || rootPID != s.cmd.Process.Pid {
			continue
		}
		if port.PID > 0 {
			listeningPIDs[port.PID] = struct{}{}
		}
	}

	for pid := range listeningPIDs {
		if err := stopProcessByPID(pid); err != nil {
			return fmt.Errorf("kill pid %d: %w", pid, err)
		}
	}

	return nil
}

func buildPIDToRootMap(rootPIDs []int, processes []processInfo) map[int]int {
	childrenByPPID := make(map[int][]int)
	for _, process := range processes {
		if process.PID <= 0 || process.PPID <= 0 {
			continue
		}
		childrenByPPID[process.PPID] = append(childrenByPPID[process.PPID], process.PID)
	}

	pidToRoot := make(map[int]int)
	for _, rootPID := range rootPIDs {
		if rootPID <= 0 {
			continue
		}
		stack := []int{rootPID}
		for len(stack) > 0 {
			pid := stack[len(stack)-1]
			stack = stack[:len(stack)-1]
			if _, seen := pidToRoot[pid]; seen {
				continue
			}
			pidToRoot[pid] = rootPID
			stack = append(stack, childrenByPPID[pid]...)
		}
	}

	return pidToRoot
}

func (m *Manager) Resize(req ResizeRequest) (ResizeResponse, error) {
	s, err := m.session(req.SessionID)
	if err != nil {
		return ResizeResponse{}, err
	}

	if req.Cols == 0 || req.Rows == 0 {
		return ResizeResponse{}, rpcerror.New(rpcCodeInvalidParams, "cols and rows are required")
	}

	if err := pty.Setsize(s.pty, &pty.Winsize{Cols: req.Cols, Rows: req.Rows}); err != nil {
		return ResizeResponse{}, err
	}

	return ResizeResponse{Resized: true}, nil
}

func (m *Manager) Subscribe(req SubscribeRequest) (Subscription, error) {
	s, err := m.session(req.SessionID)
	if err != nil {
		return Subscription{}, err
	}

	id := m.nextSubID.Add(1)
	ch := make(chan Event, 256)

	s.subsMu.Lock()
	s.subs[id] = ch
	s.subsMu.Unlock()

	return Subscription{ID: id, Events: ch}, nil
}

func (m *Manager) Unsubscribe(req UnsubscribeRequest) (UnsubscribeResponse, error) {
	s, err := m.session(req.SessionID)
	if err != nil {
		return UnsubscribeResponse{}, err
	}

	s.subsMu.Lock()
	ch, ok := s.subs[req.SubscriptionID]
	if ok {
		delete(s.subs, req.SubscriptionID)
		close(ch)
	}
	s.subsMu.Unlock()

	if !ok {
		return UnsubscribeResponse{}, rpcerror.New(rpcCodeNotFound, "terminal subscription not found")
	}

	return UnsubscribeResponse{Unsubscribed: true}, nil
}

func (m *Manager) session(id string) (*session, error) {
	if id == "" {
		return nil, rpcerror.New(rpcCodeInvalidParams, "sessionId is required")
	}

	m.mu.RLock()
	s, ok := m.sessions[id]
	m.mu.RUnlock()
	if !ok {
		return nil, rpcerror.New(rpcCodeNotFound, "terminal session not found")
	}
	return s, nil
}

func (s *session) capture() {
	buf := make([]byte, 4096)
	for {
		n, err := s.pty.Read(buf)
		if n > 0 {
			s.lastActivityUnixNano.Store(time.Now().UTC().UnixNano())
			// Copy the raw bytes for binary delivery before converting to string.
			raw := make([]byte, n)
			copy(raw, buf[:n])
			chunk := string(raw)
			s.outputMu.Lock()
			s.appendOutput(chunk)
			s.outputMu.Unlock()
			s.broadcast(Event{SessionID: s.id, Type: "output", Chunk: chunk, RawChunk: raw})
			// Scan tail+chunk so that port announcements split across read
			// boundaries are still detected (e.g. "Listening\n" in one chunk,
			// "on :3000" in the next).
			window := string(s.portScanTail) + chunk
			if outputMentionsPorts(window) {
				log.Debug().Str("sessionId", s.id).Str("chunk", chunk).Msg("[ports] output matches port pattern, requesting scan hint")
				s.portHintFn()
			}
			// Advance the tail: keep the last portScanTailSize bytes.
			combined := append(s.portScanTail, raw...)
			if len(combined) > portScanTailSize {
				combined = combined[len(combined)-portScanTailSize:]
			}
			s.portScanTail = combined
		}
		if err != nil {
			if errors.Is(err, io.EOF) {
				return
			}
			return
		}
	}
}

func (s *session) appendOutput(chunk string) {
	if len(chunk) >= maxSessionOutputBytes {
		s.output.Reset()
		_, _ = s.output.WriteString(chunk[len(chunk)-maxSessionOutputBytes:])
		return
	}

	if s.output.Len()+len(chunk) > maxSessionOutputBytes {
		current := s.output.String()
		retainedBytes := maxSessionOutputBytes/2 - len(chunk)
		if retainedBytes < 0 {
			retainedBytes = 0
		}
		if retainedBytes > len(current) {
			retainedBytes = len(current)
		}
		s.output.Reset()
		_, _ = s.output.WriteString(current[len(current)-retainedBytes:])
	}
	_, _ = s.output.WriteString(chunk)
}

func (s *session) broadcast(event Event) {
	s.subsMu.Lock()
	defer s.subsMu.Unlock()

	for _, ch := range s.subs {
		select {
		case ch <- event:
		default:
		}
	}
}

func (s *session) closeSubscribers() {
	s.subsMu.Lock()
	defer s.subsMu.Unlock()

	for id, ch := range s.subs {
		delete(s.subs, id)
		close(ch)
	}
}
