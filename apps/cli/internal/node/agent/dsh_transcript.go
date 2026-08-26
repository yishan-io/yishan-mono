package agent

import (
	"bytes"
	"encoding/json"
	"errors"
	"strings"

	"yishan/apps/cli/internal/agent/dsh"
)

var errDSHTranscriptProtocolUnavailable = errors.New("DSH transcript protocol unavailable")

func projectDSHEvent(event dsh.SessionEvent) (dsh.SessionEvent, error) {
	projection, err := projectDSHEventRaw(event.Event, event.Seq)
	if err != nil {
		return dsh.SessionEvent{}, err
	}
	event.Event = projection
	return event, nil
}

func projectDSHEvents(events []dsh.SessionEvent) ([]json.RawMessage, error) {
	projected := make([]json.RawMessage, len(events))
	for index, event := range events {
		mapped, err := projectDSHEvent(event)
		if err != nil {
			return nil, err
		}
		projected[index] = mapped.Event
	}
	return projected, nil
}

func projectDSHHistoryEvents(events []json.RawMessage) ([]json.RawMessage, error) {
	projected := make([]json.RawMessage, len(events))
	for index, event := range events {
		mapped, err := projectDSHEventRaw(event, -1)
		if err != nil {
			return nil, err
		}
		projected[index] = mapped
	}
	return projected, nil
}

func projectDSHEventRaw(raw json.RawMessage, expectedSequence int64) (json.RawMessage, error) {
	var envelope transcriptEventEnvelope
	if err := json.Unmarshal(raw, &envelope); err != nil {
		return nil, errDSHTranscriptProtocolUnavailable
	}
	if !strings.HasPrefix(envelope.Type, "yishan/") {
		return bytes.Clone(raw), nil
	}
	if !isHiddenDSHEventType(envelope.Type) || envelope.Seq == nil || envelope.Time == nil || (expectedSequence >= 0 && *envelope.Seq != expectedSequence) {
		return nil, errDSHTranscriptProtocolUnavailable
	}
	return marshalHiddenDSHEvent(*envelope.Seq, *envelope.Time)
}

type transcriptEventEnvelope struct {
	Type string           `json:"type"`
	Seq  *int64           `json:"seq"`
	Time *json.RawMessage `json:"time"`
}

func isHiddenDSHEventType(eventType string) bool {
	return eventType == "yishan/session-bound.v1" || eventType == "yishan/session-summary.v1" || eventType == "yishan/session-title.v1"
}

func marshalHiddenDSHEvent(sequence int64, eventTime json.RawMessage) (json.RawMessage, error) {
	marker := struct {
		Type string          `json:"type"`
		Seq  int64           `json:"seq"`
		Time json.RawMessage `json:"time"`
		Data struct {
			Version int `json:"version"`
		} `json:"data"`
		Ignorable bool `json:"ignorable"`
	}{Type: "dsh/hidden.v1", Seq: sequence, Time: eventTime, Ignorable: true}
	marker.Data.Version = 1
	encoded, err := json.Marshal(marker)
	if err != nil {
		return nil, errDSHTranscriptProtocolUnavailable
	}
	return encoded, nil
}

func projectDSHUpdate(update dsh.SessionUpdate) (dsh.SessionUpdate, error) {
	if update.Event == nil {
		return update, nil
	}
	projected, err := projectDSHEvent(*update.Event)
	if err != nil {
		return dsh.SessionUpdate{}, err
	}
	update.Event = &projected
	return update, nil
}
