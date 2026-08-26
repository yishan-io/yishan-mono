package dsh

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
)

const (
	yishanSessionDisposeMethod = "yishan.v1.session.dispose"
	yishanSessionListMethod    = "yishan.v1.session.list"
	yishanSessionReadMethod    = "yishan.v1.session.read"
	yishanSessionResumeMethod  = "yishan.v1.session.resume"
)

var (
	// ErrRuntimeUnavailable reports that the current runtime cannot receive a request.
	ErrRuntimeUnavailable = errors.New("DSH runtime is unavailable")
	// ErrRequestInterrupted reports a request abandoned because its runtime stopped.
	ErrRequestInterrupted = errors.New("DSH request interrupted")
)

// RequestError is an error returned by the DSH JSON-RPC server.
type RequestError struct {
	Method  string
	Code    int
	Message string
	Data    json.RawMessage
}

func (e *RequestError) Error() string {
	return fmt.Sprintf("DSH request %s failed (%d): %s", e.Method, e.Code, e.Message)
}

// SessionListRequest lists persisted top-level sessions for a workspace.
type SessionListRequest struct {
	CWD string `json:"cwd"`
}

// SessionListEntry is one persisted DSH session.
type SessionListEntry struct {
	SessionID     string `json:"sessionId"`
	CreatedAt     int64  `json:"createdAt"`
	ParentSession string `json:"parentSession,omitempty"`
	AgentPreset   string `json:"agentPreset,omitempty"`
	Live          bool   `json:"live"`
	Persisted     bool   `json:"persisted"`
}

// SessionListResult is the response to a session list request.
type SessionListResult struct {
	Sessions []SessionListEntry `json:"sessions"`
}

// SessionReadRequest reads or resumes a persisted workspace session.
type SessionReadRequest struct {
	CWD       string `json:"cwd"`
	SessionID string `json:"sessionId"`
}

// SessionHeader is the durable header returned with a session transcript.
type SessionHeader struct {
	SessionID     string `json:"sessionId"`
	CreatedAt     int64  `json:"createdAt"`
	ParentSession string `json:"parentSession,omitempty"`
	AgentPreset   string `json:"agentPreset,omitempty"`
}

// SessionReadResult is the response to a session read request.
type SessionReadResult struct {
	Session           SessionHeader     `json:"session"`
	Events            []json.RawMessage `json:"events"`
	Incarnation       string            `json:"incarnation"`
	AsOfSeq           int64             `json:"asOfSeq"`
	DurableThroughSeq int64             `json:"durableThroughSeq"`
}

// SessionResumeResult is the response to a session resume request.
type SessionResumeResult struct {
	SessionID string `json:"sessionId"`
}

// SessionDisposeResult is the response to a session dispose request.
type SessionDisposeResult struct {
	SessionID string `json:"sessionId"`
	Disposed  bool   `json:"disposed"`
}

// DisposeSession stops one resumed live session after DSH verifies its cwd.
func (s *Supervisor) DisposeSession(ctx context.Context, request SessionReadRequest) (SessionDisposeResult, error) {
	if err := validateSessionReadRequest(request); err != nil {
		return SessionDisposeResult{}, err
	}
	var response sessionDisposeWireResult
	if err := s.call(ctx, yishanSessionDisposeMethod, request, &response); err != nil {
		return SessionDisposeResult{}, err
	}
	return response.validate(request)
}

// ListSessions requests persisted top-level sessions for one workspace.
func (s *Supervisor) ListSessions(ctx context.Context, request SessionListRequest) (SessionListResult, error) {
	if request.CWD == "" {
		return SessionListResult{}, errors.New("DSH session list cwd is required")
	}
	var response sessionListWireResult
	if err := s.call(ctx, yishanSessionListMethod, request, &response); err != nil {
		return SessionListResult{}, err
	}
	return response.validate()
}

// ReadSession requests one persisted session and its durable events.
func (s *Supervisor) ReadSession(ctx context.Context, request SessionReadRequest) (SessionReadResult, error) {
	if err := validateSessionReadRequest(request); err != nil {
		return SessionReadResult{}, err
	}
	var response sessionReadWireResult
	if err := s.call(ctx, yishanSessionReadMethod, request, &response); err != nil {
		return SessionReadResult{}, err
	}
	return response.validate(request)
}

// ResumeSession asks DSH to resume a persisted session for its workspace.
// A local deadline abandons only the response; retrying the same session is safe
// because the runtime coalesces in-flight resumes and returns an existing live session.
func (s *Supervisor) ResumeSession(ctx context.Context, request SessionReadRequest) (SessionResumeResult, error) {
	if err := validateSessionReadRequest(request); err != nil {
		return SessionResumeResult{}, err
	}
	var response SessionResumeResult
	if err := s.call(ctx, yishanSessionResumeMethod, request, &response); err != nil {
		return SessionResumeResult{}, err
	}
	if response.SessionID == "" || response.SessionID != request.SessionID {
		return SessionResumeResult{}, errors.New("invalid DSH session resume response")
	}
	return response, nil
}

func (s *Supervisor) call(ctx context.Context, method string, params any, target any) error {
	_, err := s.callWithProcess(ctx, method, params, target)
	return err
}

func (s *Supervisor) callWithProcess(ctx context.Context, method string, params any, target any) (*runtimeProcess, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	process, id, response, remove, err := s.prepareRequest()
	if err != nil {
		return nil, err
	}
	defer remove()
	if err := writeRequest(process, id, method, params); err != nil {
		return nil, err
	}
	if err := waitForResponse(ctx, response, method, target); err != nil {
		return nil, err
	}
	return process, nil
}

func (s *Supervisor) prepareRequest() (*runtimeProcess, uint64, <-chan rpcResponse, func(), error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.isClosing || s.process == nil || !s.health.IsReady {
		return nil, 0, nil, nil, ErrRuntimeUnavailable
	}
	s.nextID++
	response, remove := s.process.registerPending(s.nextID)
	return s.process, s.nextID, response, remove, nil
}

func waitForResponse(ctx context.Context, response <-chan rpcResponse, method string, target any) error {
	select {
	case frame := <-response:
		if frame.err != nil {
			return frame.err
		}
		if frame.rpcError != nil {
			return &RequestError{Method: method, Code: frame.rpcError.Code, Message: frame.rpcError.Message, Data: frame.rpcError.Data}
		}
		if err := decodeStrictJSON(frame.result, target); err != nil {
			return fmt.Errorf("decode DSH response for %s: %w", method, err)
		}
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}
