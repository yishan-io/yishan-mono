package agent

import (
	"encoding/json"
	"math"
)

func parseDSHEventEnvelope(raw json.RawMessage) (string, json.RawMessage, bool) {
	var event struct {
		Type string          `json:"type"`
		Data json.RawMessage `json:"data"`
	}
	if json.Unmarshal(raw, &event) != nil || event.Type == "" || len(event.Data) == 0 {
		return "", nil, false
	}
	return event.Type, event.Data, true
}

func parseApprovalAsked(raw json.RawMessage) (string, bool) {
	var data map[string]json.RawMessage
	if !parseExactObject(raw, &data, "id", "toolName", "callId", "reason") {
		return "", false
	}
	id, idOK := parseNonEmptyString(data["id"])
	_, toolOK := parseNonEmptyString(data["toolName"])
	if !idOK || !toolOK {
		return "", false
	}
	for _, name := range []string{"callId", "reason"} {
		if value, exists := data[name]; exists {
			if _, ok := parseString(value); !ok {
				return "", false
			}
		}
	}
	return id, true
}
func parseApprovalDecided(raw json.RawMessage) (string, bool) {
	var data map[string]json.RawMessage
	if !parseExactObject(raw, &data, "id", "outcome") {
		return "", false
	}
	id, idOK := parseNonEmptyString(data["id"])
	outcome, outcomeOK := parseNonEmptyString(data["outcome"])
	if !idOK || !outcomeOK {
		return "", false
	}
	switch outcome {
	case "allowed-once", "rejected", "cancelled", "unavailable":
		return id, true
	}
	return "", false
}
func parseTurnStart(raw json.RawMessage) (int64, bool) {
	var data map[string]json.RawMessage
	if !parseExactObject(raw, &data, "turn") {
		return 0, false
	}
	return parseNonnegativeInteger(data["turn"])
}
func parseTurnEnd(raw json.RawMessage) (int64, string, bool) {
	var data map[string]json.RawMessage
	if !parseExactObject(raw, &data, "turn", "reason") {
		return 0, "", false
	}
	turn, turnOK := parseNonnegativeInteger(data["turn"])
	if !turnOK {
		return 0, "", false
	}
	var reason map[string]json.RawMessage
	if json.Unmarshal(data["reason"], &reason) != nil {
		return 0, "", false
	}
	kind, kindOK := parseNonEmptyString(reason["kind"])
	if !kindOK {
		return 0, "", false
	}
	switch kind {
	case "completed", "blocked", "max-tokens", "interrupted":
		if !parseExactMap(reason, "kind") {
			return 0, "", false
		}
	case "error":
		if !parseExactMap(reason, "kind", "error") || !parseFailure(reason["error"]) {
			return 0, "", false
		}
	case "aborted":
		if !parseExactMap(reason, "kind", "reason") || !parseCancelReason(reason["reason"]) {
			return 0, "", false
		}
	default:
		return 0, "", false
	}
	return turn, kind, true
}
func parseFailure(raw json.RawMessage) bool {
	var failure map[string]json.RawMessage
	if json.Unmarshal(raw, &failure) != nil || !parseExactMap(failure, "message", "code", "status", "providerRetryAfterMs", "requestId") {
		return false
	}
	if _, ok := parseNonEmptyString(failure["message"]); !ok {
		return false
	}
	if _, ok := parseNonEmptyString(failure["code"]); !ok {
		return false
	}
	if value, exists := failure["status"]; exists {
		status, ok := parseNonnegativeInteger(value)
		if !ok || status < 100 || status > 599 {
			return false
		}
	}
	if value, exists := failure["providerRetryAfterMs"]; exists {
		retryAfter, ok := parseFiniteNumber(value)
		if !ok || retryAfter <= 0 {
			return false
		}
	}
	if value, exists := failure["requestId"]; exists {
		if _, ok := parseNonEmptyString(value); !ok {
			return false
		}
	}
	return true
}
func parseCancelReason(raw json.RawMessage) bool {
	var reason map[string]json.RawMessage
	if json.Unmarshal(raw, &reason) != nil {
		return false
	}
	kind, ok := parseNonEmptyString(reason["kind"])
	if !ok {
		return false
	}
	if kind == "hook" {
		if !parseExactMap(reason, "kind", "reason") {
			return false
		}
		_, ok := parseNonEmptyString(reason["reason"])
		return ok
	}
	switch kind {
	case "user", "parent", "disposed", "legacy":
		return parseExactMap(reason, "kind")
	}
	return false
}
func parseExactObject(raw json.RawMessage, target *map[string]json.RawMessage, allowed ...string) bool {
	if json.Unmarshal(raw, target) != nil {
		return false
	}
	return parseExactMap(*target, allowed...)
}
func parseExactMap(fields map[string]json.RawMessage, allowed ...string) bool {
	for name := range fields {
		found := false
		for _, allowedName := range allowed {
			if name == allowedName {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}
	return true
}
func parseString(raw json.RawMessage) (string, bool) {
	var value string
	return value, json.Unmarshal(raw, &value) == nil
}
func parseNonEmptyString(raw json.RawMessage) (string, bool) {
	value, ok := parseString(raw)
	return value, ok && value != ""
}
func parseNonnegativeInteger(raw json.RawMessage) (int64, bool) {
	var value int64
	return value, json.Unmarshal(raw, &value) == nil && value >= 0
}
func parseFiniteNumber(raw json.RawMessage) (float64, bool) {
	var value float64
	return value, json.Unmarshal(raw, &value) == nil && !math.IsInf(value, 0) && !math.IsNaN(value)
}
