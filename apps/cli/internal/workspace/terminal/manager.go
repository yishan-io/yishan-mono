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
	"sync"
	"sync/atomic"
	"time"

	"github.com/creack/pty"
)

type Manager struct {
	mu        sync.RWMutex
	nextID    atomic.Uint64
	nextSubID atomic.Uint64
	sessions  map[string]*session
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

func (m *Manager) Start(_ context.Context, cwd string, req StartRequest) (StartResponse, error) {
	command, args := resolveCommand(req, runtime.GOOS, os.Getenv("SHELL"))

	cmd := exec.Command(command, args...)
	cmd.Dir = cwd
	cmd.Env = resolveEnv(os.Environ(), req.Env)

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
	childrenByPPID := make(map[int][]int)
	for _, process := range processes {
		if process.PID <= 0 || process.PPID <= 0 {
			continue
		}
		childrenByPPID[process.PPID] = append(childrenByPPID[process.PPID], process.PID)
	}

	pidToRoot := make(map[int]int)
	for _, rootPID := range rootPIDs {
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

	listeningPorts, err := listListeningTCPPorts()
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
	ch := make(chan Event, 64)

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
			chunk := string(buf[:n])
			s.outputMu.Lock()
			_, _ = s.output.WriteString(chunk)
			s.outputMu.Unlock()
			s.broadcast(Event{SessionID: s.id, Type: "output", Chunk: chunk})
		}
		if err != nil {
			if errors.Is(err, io.EOF) {
				return
			}
			return
		}
	}
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
