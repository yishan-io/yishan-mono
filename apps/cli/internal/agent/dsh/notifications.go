package dsh

import (
	"encoding/json"
	"errors"
	"fmt"
)

const (
	sessionEventMethod    = "session.event"
	sessionStatusMethod   = "session.status"
	durableCursorMethod   = "yishan.v1.session.durable-cursor"
	transcriptResetMethod = "yishan.v1.session.transcript-reset"
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
	return method == sessionEventMethod || method == sessionStatusMethod || method == durableCursorMethod || method == transcriptResetMethod
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
