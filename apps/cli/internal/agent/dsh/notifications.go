package dsh

import (
	"encoding/json"
	"errors"
	"fmt"
)

const (
	sessionEventMethod      = "session.event"
	sessionStatusMethod     = "session.status"
	durableCursorMethod     = "yishan.v1.session.durable-cursor"
	transcriptResetMethod   = "yishan.v1.session.transcript-reset"
	subagentLifecycleMethod = "yishan.v1.subagent.lifecycle"
)

func (s *Supervisor) routeNotification(process *runtimeProcess, frame rpcEnvelope) {
	if !isKnownNotification(frame.Method) {
		s.diagnose("DSH notification: " + frame.Method)
		return
	}
	err := s.handleNotification(process, frame)
	if err == nil {
		return
	}
	s.diagnose(fmt.Sprintf("invalid DSH notification %s: %v", frame.Method, err))
	s.invalidateProcess(process, err)
}
func (s *Supervisor) handleNotification(process *runtimeProcess, frame rpcEnvelope) error {
	switch frame.Method {
	case sessionEventMethod:
		event, err := parseSessionEventNotification(frame.Params)
		if err == nil {
			err = process.replay.recordEvent(event.SessionID, event)
		}
		return err
	case sessionStatusMethod:
		status, err := parseSessionStatusNotification(frame.Params)
		if err == nil {
			process.replay.publishStatus(status)
		}
		return err
	case durableCursorMethod:
		cursor, err := parseDurableCursorNotification(frame.Params)
		if err == nil {
			err = process.replay.acceptCursor(cursor)
		}
		return err
	case subagentLifecycleMethod:
		lifecycle, err := parseSubagentLifecycleNotification(frame.Params)
		if err == nil {
			err = process.replay.recordLifecycle(lifecycle)
		}
		return err
	case transcriptResetMethod:
		reset, err := parseTranscriptResetNotification(frame.Params)
		if err == nil {
			process.replay.reset(reset)
		}
		return err
	default:
		return nil
	}
}
func isKnownNotification(method string) bool {
	return method == sessionEventMethod || method == sessionStatusMethod || method == durableCursorMethod || method == transcriptResetMethod || method == subagentLifecycleMethod
}
func parseSessionEventNotification(raw json.RawMessage) (SessionEvent, error) {
	var fields map[string]json.RawMessage
	if err := requireNotificationFields(raw, &fields, "sessionId", "event"); err != nil {
		return SessionEvent{}, err
	}
	sessionID, ok := rawString(fields["sessionId"])
	if !ok || sessionID == "" {
		return SessionEvent{}, errors.New("sessionId is invalid")
	}
	return parseEvent(fields["event"], sessionID)
}
func parseSessionStatusNotification(raw json.RawMessage) (SessionStatus, error) {
	var fields map[string]json.RawMessage
	if err := requireNotificationFields(raw, &fields, "sessionId", "status"); err != nil {
		return SessionStatus{}, err
	}
	sessionID, sessionOK := rawString(fields["sessionId"])
	status, statusOK := rawString(fields["status"])
	if !sessionOK || sessionID == "" || !statusOK || (status != "idle" && status != "running") {
		return SessionStatus{}, errors.New("session status is invalid")
	}
	return SessionStatus{SessionID: sessionID, Status: status}, nil
}
func parseDurableCursorNotification(raw json.RawMessage) (DurableCursor, error) {
	var cursor durableCursorWire
	if err := parseExactNotification(raw, &cursor, "sessionId", "durableThroughSeq", "incarnation"); err != nil {
		return DurableCursor{}, err
	}
	return cursor.validate(cursor.SessionID)
}

type subagentLifecycleWire struct {
	Version         int    `json:"version"`
	ParentSessionID string `json:"parentSessionId"`
	Incarnation     string `json:"incarnation"`
	Revision        int64  `json:"revision"`
	Event           string `json:"event"`
	RunID           string `json:"runId"`
	ChildSessionID  string `json:"childSessionId"`
	Provider        string `json:"provider"`
	Local           *bool  `json:"local"`
	StopReason      string `json:"stopReason,omitempty"`
}

func parseSubagentLifecycleNotification(raw json.RawMessage) (SubagentLifecycle, error) {
	var wire subagentLifecycleWire
	if err := parseExactNotification(raw, &wire, lifecycleKeys(raw)...); err != nil {
		return SubagentLifecycle{}, err
	}
	if wire.Local == nil {
		return SubagentLifecycle{}, errors.New("subagent lifecycle is invalid")
	}
	lifecycle := SubagentLifecycle{
		Version: wire.Version, ParentSessionID: wire.ParentSessionID, Incarnation: wire.Incarnation,
		Revision: wire.Revision, Event: wire.Event, RunID: wire.RunID, ChildSessionID: wire.ChildSessionID,
		Provider: wire.Provider, Local: *wire.Local, StopReason: wire.StopReason,
	}
	if !isValidLifecycle(lifecycle) {
		return SubagentLifecycle{}, errors.New("subagent lifecycle is invalid")
	}
	return lifecycle, nil
}

func lifecycleKeys(raw json.RawMessage) []string {
	var fields map[string]json.RawMessage
	if json.Unmarshal(raw, &fields) != nil {
		return nil
	}
	if _, hasStopReason := fields["stopReason"]; hasStopReason {
		return []string{"version", "parentSessionId", "incarnation", "revision", "event", "runId", "childSessionId", "provider", "local", "stopReason"}
	}
	return []string{"version", "parentSessionId", "incarnation", "revision", "event", "runId", "childSessionId", "provider", "local"}
}

func isValidLifecycle(lifecycle SubagentLifecycle) bool {
	if lifecycle.Version != 1 || lifecycle.ParentSessionID == "" || lifecycle.Incarnation == "" || !isSafeSequence(lifecycle.Revision, 0) || lifecycle.RunID == "" || lifecycle.ChildSessionID == "" || lifecycle.Provider == "" {
		return false
	}
	if lifecycle.Event == "started" {
		return lifecycle.StopReason == ""
	}
	return lifecycle.Event == "finished" && isSubagentStopReason(lifecycle.StopReason)
}

func isSubagentStopReason(reason string) bool {
	return reason == "completed" || reason == "aborted" || reason == "error" || reason == "max-tokens" || reason == "refusal"
}

func parseTranscriptResetNotification(raw json.RawMessage) (TranscriptReset, error) {
	var reset TranscriptReset
	if err := parseExactNotification(raw, &reset, "sessionId", "incarnation", "headSeq"); err != nil {
		return TranscriptReset{}, err
	}
	if reset.SessionID == "" || reset.Incarnation == "" || !isSafeSequence(reset.HeadSeq, -1) {
		return TranscriptReset{}, errors.New("transcript reset is invalid")
	}
	return reset, nil
}
func requireNotificationFields(raw json.RawMessage, target *map[string]json.RawMessage, keys ...string) error {
	if err := decodeStrictJSON(raw, target); err != nil || !hasExactKeys(*target, keys...) {
		return errors.New("notification has invalid fields")
	}
	return nil
}
func parseExactNotification(raw json.RawMessage, target any, keys ...string) error {
	var fields map[string]json.RawMessage
	if err := requireNotificationFields(raw, &fields, keys...); err != nil {
		return err
	}
	return parseNotificationParams(raw, target)
}
func (s *Supervisor) invalidateProcess(process *runtimeProcess, cause error) {
	s.markProcessUnavailable(process, cause)
	process.replay.invalidate()
	process.failPending(cause)
	if process.command != nil && process.command.Process != nil {
		_ = process.command.Process.Kill()
	}
}

func (s *Supervisor) markProcessUnavailable(process *runtimeProcess, cause error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.process != process {
		return
	}
	process.isInvalidated = true
	s.process = nil
	s.health.IsReady = false
	s.health.Incarnation = ""
	s.health.LastError = cause.Error()
}
