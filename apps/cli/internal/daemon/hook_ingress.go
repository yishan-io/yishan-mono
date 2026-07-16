package daemon

import (
	"encoding/json"
	"net/http"
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

	h.recordAgentUsage(event.workspaceID, event.agent)

	if event.eventType == "stop" && h.memory != nil {
		if handle, err := h.manager.WorkspaceHandle(event.workspaceID); err == nil {
			ws := handle.Workspace()
			h.memory.SummarizeSession(event.agent, ws.Path, ws.ProjectID)
		}
		// Trigger the daily persona batch independently of workspace lookup — persona
		// extraction is user-level (not workspace-level) so it fires on every stop.
		h.memory.MaybeRunDailyPersonaBatch(event.agent)
	}

	if notification := buildHookNotificationPayload(event); notification != nil {
		h.events.Publish(frontendEvent{Topic: "notificationEvent", Payload: notification})
	}

	if event.tabID != "" && (event.eventType == "start" || event.eventType == "stop" || event.eventType == "launched") {
		agentForEvent := event.agent
		if event.eventType == "stop" {
			agentForEvent = ""
		}
		h.events.Publish(frontendEvent{
			Topic: "terminalAgentChanged",
			Payload: map[string]any{
				"tabId": event.tabID,
				"agent": agentForEvent,
			},
		})
	}

	w.WriteHeader(http.StatusOK)
}
