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
)

const maxSessionOutputBytes = 2 * 1024 * 1024
const portScanInterval = 3 * time.Second

type portsChangedListener func([]DetectedPort)

type Manager struct {
	mu                  sync.RWMutex
	nextID              atomic.Uint64
	nextSubID           atomic.Uint64
	sessions            map[string]*session
	portsListenerMu     sync.RWMutex
	onPortsChanged      portsChangedListener
	portLoopMu          sync.Mutex
	portLoopRunning     bool
	portSnapshotMu      sync.Mutex
	lastPortSnapshotKey string
}

type session struct {
	id               string
	workspaceID      string
	cmd              *exec.Cmd
	pty              *os.File
	output           bytes.Buffer
	outputMu         sync.Mutex
	running          atomic.Bool
	exitCode         atomic.Int32
	startedAt        time.Time
	exitedAtUnixNano atomic.Int64
	subsMu           sync.Mutex
	subs             map[uint64]chan Event
}

func NewManager() *Manager {
	return &Manager{sessions: make(map[string]*session)}
}

func (m *Manager) SetPortsChangedListener(listener portsChangedListener) {
	m.portsListenerMu.Lock()
	m.onPortsChanged = listener
	m.portsListenerMu.Unlock()
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
	s := &session{id: id, workspaceID: req.WorkspaceID, cmd: cmd, pty: ptyFile, startedAt: time.Now().UTC(), subs: make(map[uint64]chan Event)}
	s.running.Store(true)
	s.exitCode.Store(-1)

	m.mu.Lock()
	m.sessions[id] = s
	m.mu.Unlock()
	m.ensurePortScanLoop()

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

		exit := int(code)
		s.broadcast(Event{SessionID: s.id, Type: "exit", ExitCode: &exit})
		s.closeSubscribers()
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
	return m.collectDetectedPorts()
}

func (m *Manager) collectDetectedPorts() []DetectedPort {
	m.mu.RLock()
	sessions := make([]*session, 0, len(m.sessions))
	for _, s := range m.sessions {
		if s.running.Load() && s.cmd.Process != nil {
			sessions = append(sessions, s)
		}
	}
	m.mu.RUnlock()

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
		return nil
	}

	out := make([]DetectedPort, 0, len(listeningPorts))
	for _, port := range listeningPorts {
		rootPID, ok := pidToRoot[port.PID]
		if !ok {
			continue
		}
		session := sessionByPID[rootPID]
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

	ticker := time.NewTicker(portScanInterval)
	defer ticker.Stop()

	for range ticker.C {
		if !m.hasActiveSessions() {
			if m.shouldPublishPortsUpdate(nil) {
				m.publishPortsChanged(nil)
			}
			return
		}

		ports := m.collectDetectedPorts()
		if !m.shouldPublishPortsUpdate(ports) {
			continue
		}
		m.publishPortsChanged(ports)
	}
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
		return SendResponse{}, NewRPCError(-32005, "terminal session not running")
	}

	n, err := io.WriteString(s.pty, req.Input)
	if err != nil {
		return SendResponse{}, err
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

	m.mu.Lock()
	delete(m.sessions, s.id)
	m.mu.Unlock()

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

		m.mu.Lock()
		delete(m.sessions, s.id)
		m.mu.Unlock()
	}

	return errs
}

func (m *Manager) KillProcess(req KillProcessRequest) (KillProcessResponse, error) {
	if req.PID <= 0 {
		return KillProcessResponse{}, NewRPCError(-32602, "pid is required")
	}

	if err := stopProcessByPID(req.PID); err != nil {
		return KillProcessResponse{}, err
	}

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
		return ResizeResponse{}, NewRPCError(-32602, "cols and rows are required")
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
		return UnsubscribeResponse{}, NewRPCError(-32004, "terminal subscription not found")
	}

	return UnsubscribeResponse{Unsubscribed: true}, nil
}

func (m *Manager) session(id string) (*session, error) {
	if id == "" {
		return nil, NewRPCError(-32602, "sessionId is required")
	}

	m.mu.RLock()
	s, ok := m.sessions[id]
	m.mu.RUnlock()
	if !ok {
		return nil, NewRPCError(-32004, "terminal session not found")
	}
	return s, nil
}

func (s *session) capture() {
	buf := make([]byte, 4096)
	for {
		n, err := s.pty.Read(buf)
		if n > 0 {
			// Copy the raw bytes for binary delivery before converting to string.
			raw := make([]byte, n)
			copy(raw, buf[:n])
			chunk := string(raw)
			s.outputMu.Lock()
			s.appendOutput(chunk)
			s.outputMu.Unlock()
			s.broadcast(Event{SessionID: s.id, Type: "output", Chunk: chunk, RawChunk: raw})
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
