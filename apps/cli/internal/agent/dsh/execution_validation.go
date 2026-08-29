package dsh

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
)

const maxSafeInteger int64 = 9_007_199_254_740_991

type sessionStartWireResult struct {
	SessionID  string `json:"sessionId"`
	InstanceID string `json:"instanceId"`
}
type sessionPromptWireResult struct {
	MessageID string `json:"messageId"`
}
type sessionCancelWireResult struct {
	SessionID string `json:"sessionId"`
	Cancelled *bool  `json:"cancelled"`
}
type durableCursorWire DurableCursor
type sessionSubscribeWireResult struct {
	SessionID         string            `json:"sessionId"`
	InstanceID        string            `json:"instanceId"`
	Events            []json.RawMessage `json:"events"`
	AsOfSeq           *int64            `json:"asOfSeq"`
	DurableThroughSeq *int64            `json:"durableThroughSeq"`
	HeadSeq           *int64            `json:"headSeq"`
}

func validateExecutionRequest(request SessionExecutionRequest) error {
	if request.CWD == "" || request.SessionID == "" {
		return errors.New("DSH session execution requires cwd and sessionId")
	}
	return nil
}

func validateStartRequest(request SessionStartRequest) error {
	if err := validateExecutionRequest(SessionExecutionRequest{CWD: request.CWD, SessionID: request.SessionID}); err != nil {
		return err
	}
	binding := request.Binding
	if binding.Version != 1 || binding.WorkspaceID == "" || binding.OwnerNodeID == "" || binding.CWD != request.CWD {
		return errors.New("DSH session start requires an authoritative binding")
	}
	return nil
}
func validatePromptRequest(request SessionPromptRequest) error {
	if err := validateExecutionRequest(SessionExecutionRequest{CWD: request.CWD, SessionID: request.SessionID}); err != nil {
		return err
	}
	if len(request.ContentBlocks) == 0 {
		return errors.New("DSH prompt requires text content blocks")
	}
	for _, block := range request.ContentBlocks {
		if block.Type != "text" {
			return errors.New("DSH prompt content block must be text")
		}
	}
	return nil
}
func validateSubscribeRequest(request SessionSubscribeRequest) error {
	if err := validateExecutionRequest(SessionExecutionRequest{CWD: request.CWD, SessionID: request.SessionID}); err != nil {
		return err
	}
	if !isSafeSequence(request.AfterSeq, -1) || request.AfterSeq >= maxSafeInteger {
		return errors.New("DSH subscribe afterSeq is invalid")
	}
	return nil
}
func (response sessionStartWireResult) validate(sessionID string) (SessionStartResult, error) {
	if response.SessionID != sessionID || response.InstanceID == "" {
		return SessionStartResult{}, errors.New("invalid DSH session start response")
	}
	return SessionStartResult{SessionID: response.SessionID, InstanceID: response.InstanceID}, nil
}
func (response sessionPromptWireResult) validate() (SessionPromptResult, error) {
	if response.MessageID == "" {
		return SessionPromptResult{}, errors.New("invalid DSH session prompt response")
	}
	return SessionPromptResult{MessageID: response.MessageID}, nil
}
func (response sessionCancelWireResult) validate(sessionID string) (SessionCancelResult, error) {
	if response.SessionID != sessionID || response.Cancelled == nil {
		return SessionCancelResult{}, errors.New("invalid DSH session cancel response")
	}
	return SessionCancelResult{SessionID: response.SessionID, Cancelled: *response.Cancelled}, nil
}
func (response durableCursorWire) validate(sessionID string) (DurableCursor, error) {
	cursor := DurableCursor(response)
	if cursor.SessionID != sessionID || cursor.InstanceID == "" || !isSafeSequence(cursor.DurableThroughSeq, -1) {
		return DurableCursor{}, errors.New("invalid DSH durable cursor")
	}
	return cursor, nil
}
func (response sessionSubscribeWireResult) validate(request SessionSubscribeRequest) (SessionSubscribeResult, error) {
	if response.SessionID != request.SessionID || response.InstanceID == "" || response.Events == nil || response.AsOfSeq == nil || response.DurableThroughSeq == nil || response.HeadSeq == nil {
		return SessionSubscribeResult{}, errors.New("invalid DSH session subscribe response")
	}
	result := SessionSubscribeResult{SessionID: response.SessionID, InstanceID: response.InstanceID, AsOfSeq: *response.AsOfSeq, DurableThroughSeq: *response.DurableThroughSeq, HeadSeq: *response.HeadSeq}
	if !isSafeSequence(result.AsOfSeq, -1) || !isSafeSequence(result.DurableThroughSeq, -1) || !isSafeSequence(result.HeadSeq, -1) || result.DurableThroughSeq != result.AsOfSeq || result.HeadSeq < result.AsOfSeq {
		return SessionSubscribeResult{}, errors.New("invalid DSH session subscribe cursor")
	}
	for _, raw := range response.Events {
		event, err := parseEvent(raw, request.SessionID)
		if err != nil {
			return SessionSubscribeResult{}, err
		}
		result.Events = append(result.Events, event)
	}
	if err := validateSubscribeEvents(result, request.AfterSeq); err != nil {
		return SessionSubscribeResult{}, err
	}
	return result, nil
}
func validateSubscribeEvents(result SessionSubscribeResult, after int64) error {
	if len(result.Events) == 0 && result.AsOfSeq != after {
		return errors.New("invalid DSH empty subscribe tail")
	}
	for index, event := range result.Events {
		if event.Seq != after+int64(index)+1 {
			return errors.New("invalid DSH non-contiguous subscribe tail")
		}
	}
	if len(result.Events) > 0 && result.Events[len(result.Events)-1].Seq != result.AsOfSeq {
		return errors.New("invalid DSH subscribe tail cursor")
	}
	return nil
}
func parseEvent(raw json.RawMessage, sessionID string) (SessionEvent, error) {
	var record struct {
		Seq *int64 `json:"seq"`
	}
	if !isJSONObject(raw) || json.Unmarshal(raw, &record) != nil || record.Seq == nil || !isSafeSequence(*record.Seq, 0) {
		return SessionEvent{}, errors.New("invalid DSH session event")
	}
	return SessionEvent{SessionID: sessionID, Seq: *record.Seq, Event: bytes.Clone(raw)}, nil
}
func isSafeSequence(sequence, minimum int64) bool {
	return sequence >= minimum && sequence <= maxSafeInteger
}

func isJSONObject(raw json.RawMessage) bool {
	var fields map[string]json.RawMessage
	return json.Unmarshal(raw, &fields) == nil && fields != nil
}

func parseNotificationParams(raw json.RawMessage, target any) error {
	if err := decodeStrictJSON(raw, target); err != nil {
		return fmt.Errorf("invalid DSH notification params: %w", err)
	}
	return nil
}
