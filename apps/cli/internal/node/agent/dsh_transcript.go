package agent

import (
	"bytes"
	"encoding/json"
	"errors"
	"strings"

	"yishan/apps/cli/internal/agent/dsh"
)

var errDSHTranscriptProtocolUnavailable = errors.New("DSH transcript protocol unavailable")

const (
	maxSafeTranscriptInteger           int64 = 9_007_199_254_740_991
	maxSubagentSettlementEnvelopeBytes       = 2048
	maxSubagentSettlementDataBytes           = 1024
	maxSubagentSettlementIDBytes             = 512
)

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
	if isHiddenDSHEventType(envelope.Type) {
		sequence, eventTime, isValid := parseHiddenDSHEventEnvelope(raw, expectedSequence, envelope.Type)
		if !isValid {
			return nil, errDSHTranscriptProtocolUnavailable
		}
		return marshalHiddenDSHEvent(sequence, eventTime)
	}
	if envelope.Type == "yishan/subagent-settled.v1" {
		if !isValidSubagentSettlementEnvelope(raw, expectedSequence) {
			return nil, errDSHTranscriptProtocolUnavailable
		}
		return bytes.Clone(raw), nil
	}
	if strings.HasPrefix(envelope.Type, "yishan/") {
		return nil, errDSHTranscriptProtocolUnavailable
	}
	return bytes.Clone(raw), nil
}

type transcriptEventEnvelope struct {
	Type string `json:"type"`
}

func isHiddenDSHEventType(eventType string) bool {
	switch eventType {
	case "yishan/session-bound.v1", "subagent/descriptor", "sandbox/mode":
		return true
	default:
		return false
	}
}

func parseHiddenDSHEventEnvelope(raw json.RawMessage, expectedSequence int64, expectedType string) (int64, json.RawMessage, bool) {
	var envelope map[string]json.RawMessage
	if !parseExactObject(raw, &envelope, "type", "seq", "time", "data") {
		return 0, nil, false
	}
	eventType, typeOK := parseString(envelope["type"])
	sequence, sequenceOK := parseSafeTranscriptInteger(envelope["seq"])
	_, timeOK := parseSafeTranscriptInteger(envelope["time"])
	_, hasData := envelope["data"]
	if !typeOK || eventType != expectedType || !sequenceOK || !timeOK || !hasData || (expectedSequence >= 0 && sequence != expectedSequence) {
		return 0, nil, false
	}
	return sequence, envelope["time"], true
}

func isValidSubagentSettlementEnvelope(raw json.RawMessage, expectedSequence int64) bool {
	if len(raw) > maxSubagentSettlementEnvelopeBytes {
		return false
	}
	var envelope map[string]json.RawMessage
	if !parseExactObject(raw, &envelope, "type", "seq", "time", "data") {
		return false
	}
	eventType, typeOK := parseString(envelope["type"])
	if !typeOK || eventType != "yishan/subagent-settled.v1" {
		return false
	}
	sequence, sequenceOK := parseSafeTranscriptInteger(envelope["seq"])
	_, timeOK := parseSafeTranscriptInteger(envelope["time"])
	if !sequenceOK || !timeOK || (expectedSequence >= 0 && sequence != expectedSequence) {
		return false
	}
	return isValidSubagentSettledEvent(envelope["data"])
}

func isValidSubagentSettledEvent(raw json.RawMessage) bool {
	if len(raw) > maxSubagentSettlementDataBytes {
		return false
	}
	var data map[string]json.RawMessage
	var diagnostic json.RawMessage
	if !parseExactObject(raw, &data, "version", "childSessionId", "state") {
		if !parseExactObject(raw, &data, "version", "childSessionId", "state", "diagnostic") {
			return false
		}
		diagnostic = data["diagnostic"]
	}
	version, versionOK := parseNonnegativeInteger(data["version"])
	childSessionID, childSessionIDOK := parseNonEmptyString(data["childSessionId"])
	state, stateOK := parseNonEmptyString(data["state"])
	if !versionOK || version != 1 || !childSessionIDOK || len(childSessionID) > maxSubagentSettlementIDBytes || !stateOK {
		return false
	}
	if state != "completed" && state != "aborted" && state != "error" {
		return false
	}
	return diagnostic == nil || isValidSubagentSettlementDiagnostic(diagnostic)
}

func isValidSubagentSettlementDiagnostic(raw json.RawMessage) bool {
	var diagnostic map[string]json.RawMessage
	if !parseExactObject(raw, &diagnostic, "reason") {
		return false
	}
	reason, ok := parseNonEmptyString(diagnostic["reason"])
	return ok && (reason == "aborted" || reason == "error" || reason == "max-tokens" || reason == "refusal")
}

func parseSafeTranscriptInteger(raw json.RawMessage) (int64, bool) {
	value, ok := parseNonnegativeInteger(raw)
	return value, ok && value <= maxSafeTranscriptInteger
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
