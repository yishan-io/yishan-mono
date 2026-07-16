package daemon

import (
	"strings"

	"yishan/apps/cli/internal/agentkind"
)

func mergeHookIngressPayload(envelope hookIngressEvent, rawPayload hookIngressEvent) hookIngressEvent {
	if envelope.Agent == "" {
		envelope.Agent = rawPayload.Agent
	}
	if envelope.RawEventType == "" {
		envelope.RawEventType = firstNonEmpty(rawPayload.RawEventType, rawPayload.Event, rawPayload.EventType, rawPayload.HookEvent, rawPayload.HookEventAlt, rawPayload.Type)
	}
	if envelope.WorkspaceID == "" {
		envelope.WorkspaceID = rawPayload.WorkspaceID
	}
	if envelope.TabID == "" {
		envelope.TabID = rawPayload.TabID
	}
	if envelope.PaneID == "" {
		envelope.PaneID = rawPayload.PaneID
	}
	if envelope.Payload == nil {
		envelope.Payload = rawPayload.Payload
	}
	return envelope
}

func normalizeHookIngressPayload(payload hookIngressEvent) (normalizedHookEvent, bool) {
	workspaceID := strings.TrimSpace(payload.WorkspaceID)
	tabID := strings.TrimSpace(payload.TabID)
	paneID := strings.TrimSpace(payload.PaneID)
	if workspaceID == "" || tabID == "" || paneID == "" {
		return normalizedHookEvent{}, false
	}

	rawEventType := firstNonEmpty(payload.RawEventType, payload.Event, payload.EventType, payload.HookEvent, payload.HookEventAlt, payload.Type)
	if rawEventType == "" {
		rawEventType = "unknown"
	}

	return normalizedHookEvent{
		agent:        normalizeHookAgent(payload.Agent),
		rawEventType: rawEventType,
		eventType:    normalizeHookEventType(rawEventType),
		workspaceID:  workspaceID,
		tabID:        tabID,
		paneID:       paneID,
		sessionKey:   workspaceID + ":" + tabID + ":" + paneID,
	}, true
}

func normalizeHookAgent(agent string) string {
	normalized := strings.ToLower(strings.TrimSpace(agent))
	if normalized == "cursor-agent" {
		return agentkind.Cursor
	}
	if isKnownAgentKind(normalized) {
		return normalized
	}
	return "unknown"
}

// isPerToolHookEvent returns true for hook events that fire per tool invocation
// rather than per session. These are intermediate events that should not trigger
// session-level notifications (e.g. "PostToolUse", "PostToolUseFailure").
func isPerToolHookEvent(normalized string) bool {
	return strings.HasPrefix(normalized, "posttooluse")
}

func normalizeHookEventType(rawEventType string) string {
	normalized := strings.ToLower(strings.TrimSpace(rawEventType))
	if normalized == "" || normalized == "unknown" {
		return "unknown"
	}
	// Treat explicit TaskComplete events as non-terminal — they represent task-level
	// completions inside a session and should not be normalized to a session "stop".
	if strings.Contains(normalized, "taskcomplete") {
		return "unknown"
	}

	// Per-tool events are intermediate — they do not represent session-level
	// lifecycle transitions and must not trigger start/stop/wait_input notifications.
	if isPerToolHookEvent(normalized) {
		return "unknown"
	}
	// "Launched" is emitted by wrapper scripts when the agent process starts.
	// It sets the tab icon (via terminalAgentChanged) but does NOT trigger
	// workspace-running status (no notificationEvent with observerStatus).
	// The plugin's "Start" event handles workspace-running when the agent
	// actually begins processing.
	if normalized == "launched" {
		return "launched"
	}
	if strings.Contains(normalized, "start") || strings.Contains(normalized, "begin") || strings.Contains(normalized, "submit") {
		return "start"
	}
	if strings.Contains(normalized, "wait") || strings.Contains(normalized, "permission") || strings.Contains(normalized, "approval") {
		return "wait_input"
	}
	if isFailedHookEvent(normalized) || strings.Contains(normalized, "stop") || strings.Contains(normalized, "complete") || strings.Contains(normalized, "end") {
		return "stop"
	}
	return "unknown"
}

func isFailedHookEvent(rawEventType string) bool {
	normalized := strings.ToLower(strings.TrimSpace(rawEventType))
	return strings.Contains(normalized, "fail") || strings.Contains(normalized, "error") || strings.Contains(normalized, "interrupt") || strings.Contains(normalized, "abort")
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}
