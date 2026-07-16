package tokenusage

import (
	"encoding/json"
	"path/filepath"
	"strings"
	"time"
)

type codexLineKind int

const (
	codexLineOther codexLineKind = iota
	codexLineSessionMeta
	codexLineTurnContext
	codexLineTokenCount
)

type codexParsedLine struct {
	kind      codexLineKind
	sessionID string
	cwd       string
	model     string
	timestamp time.Time
	usage     codexUsage
	text      string
	toolCalls int64
}

func parseCodexLine(rawLine []byte) codexParsedLine {
	var top map[string]any
	if err := json.Unmarshal(rawLine, &top); err != nil {
		return codexParsedLine{}
	}
	nested, _ := top["payload"].(map[string]any)
	if nested == nil {
		return codexParsedLine{}
	}

	lineType := getString(top, "type")
	switch lineType {
	case "session_meta":
		return codexParsedLine{
			kind:      codexLineSessionMeta,
			sessionID: getString(nested, "id"),
			cwd:       cleanCWDPath(getString(nested, "cwd")),
		}
	case "turn_context":
		return codexParsedLine{
			kind:      codexLineTurnContext,
			cwd:       cleanCWDPath(getString(nested, "cwd")),
			model:     getString(nested, "model"),
			timestamp: mustParseCodexTimestamp(getString(top, "timestamp")),
			text:      getCodexUserInputText(top),
		}
	case "event_msg":
		if getString(nested, "type") != "token_count" {
			return codexParsedLine{}
		}
		eventTime, ok := parseTimestamp(getString(top, "timestamp"))
		if !ok {
			return codexParsedLine{}
		}
		tokenInfo, _ := nested["info"].(map[string]any)
		usage, ok := parseCodexTokenUsage(tokenInfo)
		if !ok {
			return codexParsedLine{}
		}
		return codexParsedLine{
			kind:      codexLineTokenCount,
			timestamp: eventTime,
			usage:     usage,
		}
	default:
		if lineType == "response_item" {
			return parseCodexResponseItem(top)
		}
		return codexParsedLine{}
	}
}

func parseCodexResponseItem(top map[string]any) codexParsedLine {
	payload, _ := top["payload"].(map[string]any)
	if payload == nil {
		return codexParsedLine{}
	}
	eventTime, ok := parseTimestamp(getString(top, "timestamp"))
	if !ok {
		return codexParsedLine{}
	}
	switch getString(payload, "type") {
	case "message":
		if getString(payload, "role") != "user" {
			return codexParsedLine{}
		}
		text := getCodexInputTextFromContent(payload["content"])
		if shouldSkipCodexUserText(text) {
			return codexParsedLine{}
		}
		return codexParsedLine{
			kind:      codexLineTurnContext,
			timestamp: eventTime,
			text:      text,
		}
	case "function_call", "custom_tool_call":
		return codexParsedLine{kind: codexLineOther, timestamp: eventTime, toolCalls: 1}
	default:
		return codexParsedLine{}
	}
}

func getCodexUserInputText(top map[string]any) string {
	payload, _ := top["payload"].(map[string]any)
	if payload == nil {
		return ""
	}
	text := getCodexInputTextFromContent(payload["content"])
	if shouldSkipCodexUserText(text) {
		return ""
	}
	return text
}

func getCodexInputTextFromContent(content any) string {
	items, ok := content.([]any)
	if !ok {
		return ""
	}
	for _, item := range items {
		entry, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if getString(entry, "type") == "input_text" {
			return normalizeInjectedUserText(getString(entry, "text"))
		}
	}
	return ""
}

func shouldSkipCodexUserText(text string) bool {
	trimmed := normalizeInjectedUserText(text)
	if trimmed == "" {
		return true
	}
	return strings.HasPrefix(trimmed, "<turn_aborted>")
}

func mustParseCodexTimestamp(rawTime string) time.Time {
	timestamp, ok := parseTimestamp(rawTime)
	if !ok {
		return time.Time{}
	}
	return timestamp
}

func parseTimestamp(rawTime string) (time.Time, bool) {
	if rawTime == "" {
		return time.Time{}, false
	}
	parsed, err := time.Parse(time.RFC3339Nano, rawTime)
	if err != nil {
		return time.Time{}, false
	}
	return parsed, true
}

func parseCodexTokenUsage(info map[string]any) (codexUsage, bool) {
	totalUsage, totalOK := usageFromAny(info["total_token_usage"])
	if !totalOK {
		totalUsage, totalOK = usageFromAny(info["usage"])
	}
	if !totalOK {
		return codexUsage{}, false
	}
	lastUsage, _ := usageFromAny(info["last_token_usage"])
	if lastUsage.TotalTokens > 0 {
		return lastUsage, true
	}
	return totalUsage, true
}

func usageFromAny(value any) (codexUsage, bool) {
	record, ok := value.(map[string]any)
	if !ok {
		return codexUsage{}, false
	}
	input := getInt64(record, "input_tokens")
	output := getInt64(record, "output_tokens")
	cachedInput := getInt64(record, "cached_input_tokens", "cache_read_input_tokens")
	cachedWrite := getInt64(record, "cached_output_tokens", "cache_creation_output_tokens", "cache_creation_input_tokens")
	reasoning := getInt64(record, "reasoning_output_tokens")
	total := getInt64(record, "total_tokens")
	return codexUsage{InputTokens: input, OutputTokens: output, CachedInputTokens: cachedInput, CachedWriteTokens: cachedWrite, ReasoningTokens: reasoning, TotalTokens: total}, true
}

func cleanCWDPath(cwd string) string {
	if cwd == "" {
		return ""
	}
	cleaned := filepath.Clean(cwd)
	if cleaned == "." {
		return ""
	}
	return cleaned
}

func getString(record map[string]any, keys ...string) string {
	for _, key := range keys {
		value, ok := record[key]
		if !ok {
			continue
		}
		asString, ok := value.(string)
		if ok && strings.TrimSpace(asString) != "" {
			return strings.TrimSpace(asString)
		}
	}
	return ""
}

func getInt64(record map[string]any, keys ...string) int64 {
	for _, key := range keys {
		value, ok := record[key]
		if !ok {
			continue
		}
		number, ok := value.(float64)
		if ok {
			return int64(number)
		}
	}
	return 0
}

func maxInt64(left int64, right int64) int64 {
	if left > right {
		return left
	}
	return right
}
