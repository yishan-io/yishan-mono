package daemon

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"
	"time"
)

const agentHookIngestPath = "/v1/agent-hook/ingest"

type hookIngressEvent struct {
	Agent        string         `json:"agent"`
	RawEventType string         `json:"rawEventType"`
	Event        string         `json:"event"`
	EventType    string         `json:"eventType"`
	HookEvent    string         `json:"hookEventName"`
	HookEventAlt string         `json:"hook_event_name"`
	Type         string         `json:"type"`
	WorkspaceID  string         `json:"workspaceId"`
	TabID        string         `json:"tabId"`
	PaneID       string         `json:"paneId"`
	Payload      map[string]any `json:"payload"`
	PayloadRaw   string         `json:"payloadRaw"`
}

type normalizedHookEvent struct {
	agent        string
	rawEventType string
	eventType    string
	workspaceID  string
	tabID        string
	paneID       string
	sessionKey   string
}

func (h *JSONRPCHandler) ServeAgentHook(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	var payload hookIngressEvent
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	if payload.PayloadRaw != "" {
		var rawPayload hookIngressEvent
		if err := json.Unmarshal([]byte(payload.PayloadRaw), &rawPayload); err == nil {
			payload = mergeHookIngressPayload(payload, rawPayload)
		}
	}

	if isBrowserURLEvent(payload) {
		h.handleBrowserURLEvent(w, payload)
		return
	}

	event, ok := normalizeHookIngressPayload(payload)
	if !ok {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	if h.tokenUsage != nil {
		h.tokenUsage.Trigger(event.agent, "hook")
	}

	if notification := buildHookNotificationPayload(event); notification != nil {
		h.events.Publish(frontendEvent{Topic: "notificationEvent", Payload: notification})
	}

	w.WriteHeader(http.StatusOK)
}

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

func buildHookNotificationPayload(event normalizedHookEvent) map[string]any {
	// Ignore explicit TaskComplete events from plugins — they are task-level
	// notifications and should not be treated as session-level terminal events.
	if strings.Contains(strings.ToLower(event.rawEventType), "taskcomplete") {
		return nil
	}

	switch event.eventType {
	case "start":
		return hookNotificationPayload(event, "Run Started", "Workspace "+event.workspaceID+" is running.", "success", true, "")
	case "wait_input":
		return hookNotificationPayload(event, "Input Required", "Workspace "+event.workspaceID+" is waiting for your approval or input.", "error", false, "pending-question")
	case "stop":
		if isFailedHookEvent(event.rawEventType) {
			return hookNotificationPayload(event, "Run Failed", "Workspace "+event.workspaceID+" has stopped with an error.", "error", false, "run-failed")
		}
		return hookNotificationPayload(event, "Run Completed", "Workspace "+event.workspaceID+" has completed successfully.", "success", false, "run-finished")
	default:
		return nil
	}
}

func hookNotificationPayload(event normalizedHookEvent, title string, body string, tone string, silent bool, notificationEventType string) map[string]any {
	payload := map[string]any{
		"id":          newHookEventID(),
		"title":       title,
		"body":        body,
		"tone":        tone,
		"createdAt":   time.Now().UTC().Format(time.RFC3339Nano),
		"agent":       event.agent,
		"workspaceId": event.workspaceID,
		"silent":      silent,
		"observerStatus": map[string]string{
			"normalizedEventType": event.eventType,
			"sessionKey":          event.sessionKey,
		},
	}
	if notificationEventType != "" {
		payload["notificationEventType"] = notificationEventType
	}
	return payload
}

func normalizeHookAgent(agent string) string {
	normalized := strings.ToLower(strings.TrimSpace(agent))
	if normalized == "cursor-agent" {
		return "cursor"
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

func newHookEventID() string {
	var bytes [8]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return "hook-" + time.Now().UTC().Format("20060102150405.000000000")
	}
	return "hook-" + hex.EncodeToString(bytes[:])
}

func isBrowserURLEvent(payload hookIngressEvent) bool {
	raw := strings.ToLower(strings.TrimSpace(payload.RawEventType))
	if raw != "openbrowserurl" {
		return false
	}
	if payload.Payload == nil {
		return false
	}
	urlVal, _ := payload.Payload["url"].(string)
	return strings.TrimSpace(urlVal) != ""
}

func (h *JSONRPCHandler) handleBrowserURLEvent(w http.ResponseWriter, payload hookIngressEvent) {
	workspaceID := strings.TrimSpace(payload.WorkspaceID)
	tabID := strings.TrimSpace(payload.TabID)
	paneID := strings.TrimSpace(payload.PaneID)
	if workspaceID == "" || tabID == "" || paneID == "" {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	urlVal, _ := payload.Payload["url"].(string)
	urlVal = strings.TrimSpace(urlVal)
	if urlVal == "" {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	h.events.Publish(frontendEvent{
		Topic: "openBrowserUrl",
		Payload: map[string]any{
			"url":         urlVal,
			"workspaceId": workspaceID,
			"tabId":       tabID,
			"paneId":      paneID,
		},
	})

	w.WriteHeader(http.StatusOK)
}
