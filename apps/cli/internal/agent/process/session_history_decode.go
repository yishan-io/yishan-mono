package process

import (
	"bytes"
	"encoding/json"
	"strconv"
	"strings"
)

// parseSessionSummaryLine validates syntax before inspecting zero-copy field spans.
// All number tokens, including overwritten/ignored fields, must also fit float64,
// matching the generic JSON decoder used by the legacy summary reader.
func parseSessionSummaryLine(line []byte, shouldReadPreview bool) (map[string]any, bool) {
	if !json.Valid(line) {
		return nil, false
	}
	line = bytes.TrimSpace(line)
	if bytes.Equal(line, []byte("null")) {
		return nil, true
	}
	if line[0] != '{' {
		return nil, false
	}
	fields, isValid := readSessionSummaryFields(line)
	if !isValid {
		return nil, false
	}
	top := make(map[string]any)
	decodeSessionSummaryFields(top, fields, "type")
	switch strings.TrimSpace(getString(top, "type")) {
	case "session":
		decodeSessionSummaryFields(top, fields, "id", "sessionId", "session_id", "cwd", "timestamp", "model", "modelId", "parentSession")
	case "session_info":
		decodeSessionSummaryFields(top, fields, "name")
	case "model_change":
		decodeSessionSummaryFields(top, fields, "model", "modelId", "timestamp")
	case "message":
		decodeSessionSummaryFields(top, fields, "model", "modelId", "timestamp")
		if shouldReadPreview {
			decodeSessionSummaryPreview(top, fields["message"])
		}
	}
	return top, true
}

func decodeSessionSummaryFields(top map[string]any, fields map[string]json.RawMessage, keys ...string) {
	for _, key := range keys {
		if encoded, hasField := fields[key]; hasField {
			// Syntax and numeric ranges were already validated. Decode only metadata,
			// retaining legacy string aliases and timestamp number coercion.
			var decoded any
			if err := json.Unmarshal(encoded, &decoded); err == nil {
				top[key] = decoded
			}
		}
	}
}

func decodeSessionSummaryPreview(top map[string]any, encoded json.RawMessage) {
	if len(encoded) == 0 || encoded[0] != '{' {
		return
	}
	messageFields, isValid := readSessionSummaryFields(encoded)
	if !isValid {
		return
	}
	var role string
	if err := json.Unmarshal(messageFields["role"], &role); err != nil {
		return
	}
	role = strings.TrimSpace(role)
	if role != "user" && role != "assistant" {
		return
	}
	var message map[string]any
	if err := json.Unmarshal(encoded, &message); err == nil {
		top["message"] = message
	}
}

// readSessionSummaryFields requires a syntactically valid object. Spans borrow
// the scanner buffer and are decoded before the next Scan; none escape in top.
func readSessionSummaryFields(encoded []byte) (map[string]json.RawMessage, bool) {
	fields := make(map[string]json.RawMessage)
	for offset := skipSummarySpace(encoded, 1); encoded[offset] != '}'; {
		keyEnd := skipSummaryString(encoded, offset)
		key := decodeSummaryKey(encoded[offset:keyEnd])
		start := skipSummarySpace(encoded, skipSummarySpace(encoded, keyEnd)+1)
		end, isValid := skipSummaryValue(encoded, start)
		if !isValid {
			return nil, false
		}
		if isSummaryField(key) {
			fields[key] = encoded[start:end]
		}
		offset = skipSummarySpace(encoded, end)
		if encoded[offset] == ',' {
			offset = skipSummarySpace(encoded, offset+1)
		}
	}
	return fields, true
}

func isSummaryField(key string) bool {
	switch key {
	case "type", "id", "sessionId", "session_id", "cwd", "timestamp", "model", "modelId", "parentSession", "name", "message", "role":
		return true
	default:
		return false
	}
}

func decodeSummaryKey(encoded []byte) string {
	if !bytes.ContainsRune(encoded, '\\') {
		return string(encoded[1 : len(encoded)-1])
	}
	var key string
	_ = json.Unmarshal(encoded, &key) // Syntax was validated; string decoding cannot fail.
	return key
}

func skipSummarySpace(encoded []byte, offset int) int {
	for offset < len(encoded) {
		switch encoded[offset] {
		case ' ', '\t', '\r', '\n':
			offset++
		default:
			return offset
		}
	}
	return offset
}

func skipSummaryString(encoded []byte, offset int) int {
	for {
		end := offset + 1 + bytes.IndexByte(encoded[offset+1:], '"')
		backslashes := 0
		for previous := end - 1; encoded[previous] == '\\'; previous-- {
			backslashes++
		}
		if backslashes%2 == 0 {
			return end + 1
		}
		offset = end
	}
}

// skipSummaryValue does not parse JSON syntax: json.Valid already established
// balanced compounds and valid tokens. It only locates a span and checks numeric
// range. Walking every token preserves rejection even before duplicate keys.
func skipSummaryValue(encoded []byte, start int) (int, bool) {
	depth := 0
	for offset := start; offset < len(encoded); {
		switch token := encoded[offset]; {
		case token == '"':
			offset = skipSummaryString(encoded, offset)
		case token == '{' || token == '[':
			depth++
			offset++
		case token == '}' || token == ']':
			if depth == 0 {
				return offset, true
			}
			depth--
			offset++
			if depth == 0 {
				return offset, true
			}
		case depth == 0 && (token == ',' || token <= ' '):
			return offset, true
		case token == '-' || (token >= '0' && token <= '9'):
			end := offset + 1
			for end < len(encoded) && isSummaryNumberByte(encoded[end]) {
				end++
			}
			if !isSummaryNumberInRange(encoded[offset:end]) {
				return end, false
			}
			offset = end
		default:
			offset++
		}
	}
	return len(encoded), true
}

func isSummaryNumberByte(token byte) bool {
	return (token >= '0' && token <= '9') || token == '-' || token == '+' || token == '.' || token == 'e' || token == 'E'
}

func isSummaryNumberInRange(encoded []byte) bool {
	// Without an exponent, fewer than 309 bytes cannot exceed float64's
	// maximum (~1.798e308). Longer mantissas and all exponents use strconv,
	// including its accepted underflow-to-zero behavior, just like json.Unmarshal.
	if len(encoded) < 309 && !bytes.ContainsAny(encoded, "eE") {
		return true
	}
	_, err := strconv.ParseFloat(string(encoded), 64)
	return err == nil
}
