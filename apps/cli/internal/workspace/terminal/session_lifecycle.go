package terminal

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"sort"
	"strings"
	"time"

	"github.com/creack/pty"

	"yishan/apps/cli/internal/rpcerror"
)

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
