package dsh

import (
	"context"
	"encoding/json"
	"errors"
)

const (
	yishanSessionStartMethod     = "yishan.v1.session.start"
	yishanSessionPromptMethod    = "yishan.v1.session.prompt"
	yishanSessionCancelMethod    = "yishan.v1.session.cancel"
	yishanSessionFlushMethod     = "yishan.v1.session.flush"
	yishanSessionSubscribeMethod = "yishan.v1.session.subscribe"
)

var ErrSessionReplayReset = errors.New("DSH session replay reset required")

type SessionExecutionRequest struct {
	CWD       string `json:"cwd"`
	SessionID string `json:"sessionId"`
}
type SessionStartRequest = SessionExecutionRequest
type SessionCancelRequest = SessionExecutionRequest
type SessionFlushRequest = SessionExecutionRequest

type TextPromptContentBlock struct {
	Type string `json:"type"`
	Text string `json:"text"`
}
type SessionPromptRequest struct {
	CWD           string                   `json:"cwd"`
	SessionID     string                   `json:"sessionId"`
	ContentBlocks []TextPromptContentBlock `json:"contentBlocks"`
}
type SessionSubscribeRequest struct {
	CWD       string `json:"cwd"`
	SessionID string `json:"sessionId"`
	AfterSeq  int64  `json:"afterSeq"`
}
type SessionStartResult struct {
	SessionID   string `json:"sessionId"`
	Incarnation string `json:"incarnation"`
}
type SessionPromptResult struct {
	MessageID string `json:"messageId"`
}
type SessionCancelResult struct {
	SessionID string `json:"sessionId"`
	Cancelled bool   `json:"cancelled"`
}
type DurableCursor struct {
	SessionID         string `json:"sessionId"`
	DurableThroughSeq int64  `json:"durableThroughSeq"`
	Incarnation       string `json:"incarnation"`
}
type SessionEvent struct {
	SessionID string          `json:"sessionId"`
	Seq       int64           `json:"seq"`
	Event     json.RawMessage `json:"event"`
}
type SessionStatus struct {
	SessionID string `json:"sessionId"`
	Status    string `json:"status"`
}
type TranscriptReset struct {
	SessionID   string `json:"sessionId"`
	Incarnation string `json:"incarnation"`
	HeadSeq     int64  `json:"headSeq"`
}
type SessionSubscribeResult struct {
	SessionID         string
	Incarnation       string
	Events            []SessionEvent
	AsOfSeq           int64
	DurableThroughSeq int64
	HeadSeq           int64
}
type SessionUpdate struct {
	Event       *SessionEvent    `json:"event,omitempty"`
	Status      *SessionStatus   `json:"status,omitempty"`
	Cursor      *DurableCursor   `json:"cursor,omitempty"`
	Reset       *TranscriptReset `json:"reset,omitempty"`
	Unavailable bool             `json:"unavailable,omitempty"`
}
type SessionSubscription struct {
	Updates     <-chan SessionUpdate
	Unsubscribe func()
	// Incarnation and Baseline identify the transcript snapshot that seeded Updates.
	Incarnation string
	Baseline    int64
}

func (s *Supervisor) StartSession(ctx context.Context, request SessionStartRequest) (SessionStartResult, error) {
	if err := validateExecutionRequest(request); err != nil {
		return SessionStartResult{}, err
	}
	var response sessionStartWireResult
	process, err := s.callWithProcess(ctx, yishanSessionStartMethod, request, &response)
	if err != nil {
		return SessionStartResult{}, err
	}
	result, err := response.validate(request.SessionID)
	if err != nil {
		return SessionStartResult{}, err
	}
	process.replay.setIncarnation(request.SessionID, result.Incarnation)
	return result, nil
}
func (s *Supervisor) PromptSession(ctx context.Context, request SessionPromptRequest) (SessionPromptResult, error) {
	if err := validatePromptRequest(request); err != nil {
		return SessionPromptResult{}, err
	}
	var response sessionPromptWireResult
	if err := s.call(ctx, yishanSessionPromptMethod, request, &response); err != nil {
		return SessionPromptResult{}, err
	}
	return response.validate()
}
func (s *Supervisor) CancelSession(ctx context.Context, request SessionCancelRequest) (SessionCancelResult, error) {
	if err := validateExecutionRequest(request); err != nil {
		return SessionCancelResult{}, err
	}
	var response sessionCancelWireResult
	if err := s.call(ctx, yishanSessionCancelMethod, request, &response); err != nil {
		return SessionCancelResult{}, err
	}
	return response.validate(request.SessionID)
}
func (s *Supervisor) FlushSession(ctx context.Context, request SessionFlushRequest) (DurableCursor, error) {
	if err := validateExecutionRequest(request); err != nil {
		return DurableCursor{}, err
	}
	var response durableCursorWire
	process, err := s.callWithProcess(ctx, yishanSessionFlushMethod, request, &response)
	if err != nil {
		return DurableCursor{}, err
	}
	result, err := response.validate(request.SessionID)
	if err != nil {
		return DurableCursor{}, err
	}
	if err := process.replay.acceptCursor(result); err != nil {
		return DurableCursor{}, err
	}
	return result, nil
}
func (s *Supervisor) SubscribeSession(ctx context.Context, request SessionSubscribeRequest) (SessionSubscription, error) {
	if err := validateSubscribeRequest(request); err != nil {
		return SessionSubscription{}, err
	}
	var response sessionSubscribeWireResult
	process, err := s.callWithProcess(ctx, yishanSessionSubscribeMethod, request, &response)
	if err != nil {
		return SessionSubscription{}, err
	}
	result, err := response.validate(request)
	if err != nil {
		return SessionSubscription{}, err
	}
	return process.replay.subscribe(result, request)
}
