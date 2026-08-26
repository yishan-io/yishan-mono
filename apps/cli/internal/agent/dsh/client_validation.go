package dsh

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
)

type sessionDisposeWireResult struct {
	SessionID string `json:"sessionId"`
	Disposed  *bool  `json:"disposed"`
}

func (response sessionDisposeWireResult) validate(request SessionReadRequest) (SessionDisposeResult, error) {
	if response.SessionID != request.SessionID || response.Disposed == nil {
		return SessionDisposeResult{}, errors.New("invalid DSH session dispose response")
	}
	return SessionDisposeResult{SessionID: response.SessionID, Disposed: *response.Disposed}, nil
}

type sessionListWireEntry struct {
	SessionID     string `json:"sessionId"`
	CreatedAt     *int64 `json:"createdAt"`
	ParentSession string `json:"parentSession,omitempty"`
	AgentPreset   string `json:"agentPreset,omitempty"`
	Live          *bool  `json:"live"`
	Persisted     *bool  `json:"persisted"`
}

type sessionListWireResult struct {
	Sessions []sessionListWireEntry `json:"sessions"`
}

func (result sessionListWireResult) validate() (SessionListResult, error) {
	if result.Sessions == nil {
		return SessionListResult{}, errors.New("invalid DSH session list response")
	}
	sessions := make([]SessionListEntry, 0, len(result.Sessions))
	for _, entry := range result.Sessions {
		if entry.SessionID == "" || entry.CreatedAt == nil || *entry.CreatedAt < 0 || entry.Live == nil || entry.Persisted == nil {
			return SessionListResult{}, errors.New("invalid DSH session list entry")
		}
		sessions = append(sessions, SessionListEntry{
			SessionID: entry.SessionID, CreatedAt: *entry.CreatedAt, ParentSession: entry.ParentSession,
			AgentPreset: entry.AgentPreset, Live: *entry.Live, Persisted: *entry.Persisted,
		})
	}
	return SessionListResult{Sessions: sessions}, nil
}

func validateSessionReadRequest(request SessionReadRequest) error {
	if request.CWD == "" || request.SessionID == "" {
		return errors.New("DSH session request requires cwd and sessionId")
	}
	return nil
}

type sessionReadWireResult struct {
	Session struct {
		SessionID     string `json:"sessionId"`
		CreatedAt     *int64 `json:"createdAt"`
		ParentSession string `json:"parentSession,omitempty"`
		AgentPreset   string `json:"agentPreset,omitempty"`
	} `json:"session"`
	Events            []json.RawMessage `json:"events"`
	Incarnation       string            `json:"incarnation"`
	AsOfSeq           *int64            `json:"asOfSeq"`
	DurableThroughSeq *int64            `json:"durableThroughSeq"`
}

func (response sessionReadWireResult) validate(request SessionReadRequest) (SessionReadResult, error) {
	if response.Session.SessionID != request.SessionID || response.Session.CreatedAt == nil || *response.Session.CreatedAt < 0 || response.Events == nil || response.Incarnation == "" || response.AsOfSeq == nil || response.DurableThroughSeq == nil {
		return SessionReadResult{}, errors.New("invalid DSH session read response")
	}
	if !isSafeSequence(*response.AsOfSeq, -1) || !isSafeSequence(*response.DurableThroughSeq, -1) || *response.AsOfSeq != *response.DurableThroughSeq || int64(len(response.Events))-1 != *response.AsOfSeq {
		return SessionReadResult{}, errors.New("invalid DSH session read cursor")
	}
	for sequence, event := range response.Events {
		if !validJSONObject(event) || !hasSequence(event, int64(sequence)) {
			return SessionReadResult{}, errors.New("invalid DSH session event")
		}
	}
	return SessionReadResult{
		Session: SessionHeader{
			SessionID: response.Session.SessionID, CreatedAt: *response.Session.CreatedAt,
			ParentSession: response.Session.ParentSession, AgentPreset: response.Session.AgentPreset,
		},
		Events: response.Events, Incarnation: response.Incarnation, AsOfSeq: *response.AsOfSeq, DurableThroughSeq: *response.DurableThroughSeq,
	}, nil
}

func hasSequence(value json.RawMessage, expected int64) bool {
	var event struct {
		Seq *int64 `json:"seq"`
	}
	return json.Unmarshal(value, &event) == nil && event.Seq != nil && *event.Seq == expected
}

func validJSONObject(value json.RawMessage) bool {
	var event struct {
		Type string          `json:"type"`
		Seq  *int64          `json:"seq"`
		Time *int64          `json:"time"`
		Data json.RawMessage `json:"data"`
	}
	if json.Unmarshal(value, &event) != nil {
		return false
	}
	return event.Type != "" && event.Seq != nil && isSafeSequence(*event.Seq, 0) && event.Time != nil && *event.Time >= 0 && event.Data != nil
}

func decodeStrictJSON(value json.RawMessage, target any) error {
	decoder := json.NewDecoder(bytes.NewReader(value))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return errors.New("response contains trailing JSON")
	}
	return nil
}
