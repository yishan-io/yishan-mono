// Package hook owns the agent hook HTTP ingress (the pi notify bridge): it
// normalizes hook payloads, triggers token-usage collection, records agent
// usage per workspace, summarizes memory on agent stop, and publishes
// frontend notifications. It is the transport adapter for hook events; the
// node.Service delegates its ServeAgentHook handler here.
package hook

import (
	"encoding/json"
	"net/http"

	"yishan/apps/cli/internal/events"
	"yishan/apps/cli/internal/memory"
	"yishan/apps/cli/internal/tokenusage"
	"yishan/apps/cli/internal/workspace/instance"
)

// AgentHookIngestPath is the HTTP path the daemon serves the hook ingress on.
const AgentHookIngestPath = "/v1/agent-hook/ingest"

// IngressDeps wires the hook ingress. It needs only the application services
// the hook pipeline touches: token usage triggers, memory summarization, the
// frontend event hub, and the workspace registry for path/project resolution.
type IngressDeps struct {
	Events     *eventbus.Hub
	TokenUsage tokenusage.Service
	Memory     *memory.Service
	Registry   *instance.Registry
	// Usage tracks which agents ran in each workspace (for close-time
	// summarization); owned here so the ingress never reaches into the
	// node.Service.
	Usage *UsageTracker
}

// Ingress is the agent hook HTTP handler.
type Ingress struct {
	events     *eventbus.Hub
	tokenUsage tokenusage.Service
	memory     *memory.Service
	registry   *instance.Registry
	usage      *UsageTracker
}

// NewIngress builds the hook ingress.
func NewIngress(deps IngressDeps) *Ingress {
	return &Ingress{
		events:     deps.Events,
		tokenUsage: deps.TokenUsage,
		memory:     deps.Memory,
		registry:   deps.Registry,
		usage:      deps.Usage,
	}
}

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

// ServeHTTP handles the agent hook ingress.
func (i *Ingress) ServeHTTP(w http.ResponseWriter, r *http.Request) {
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
		i.handleBrowserURLEvent(w, payload)
		return
	}

	event, ok := normalizeHookIngressPayload(payload)
	if !ok {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	if i.tokenUsage != nil && event.eventType == "stop" {
		i.tokenUsage.Trigger(event.agent, "hook-stop")
	}

	i.usage.Record(event.workspaceID, event.agent)

	if event.eventType == "stop" && i.memory != nil {
		if ws, ok := i.registry.Get(event.workspaceID); ok {
			i.memory.SummarizeSession(event.agent, ws.Path, ws.ProjectID)
		}
		// Trigger the daily persona batch independently of workspace lookup — persona
		// extraction is user-level (not workspace-level) so it fires on every stop.
		i.memory.MaybeRunDailyPersonaBatch(event.agent)
	}

	if notification := buildHookNotificationPayload(event); notification != nil {
		i.events.Publish(eventbus.Event{Topic: "notificationEvent", Payload: notification})
	}

	if event.tabID != "" && (event.eventType == "start" || event.eventType == "stop" || event.eventType == "launched") {
		agentForEvent := event.agent
		if event.eventType == "stop" {
			agentForEvent = ""
		}
		i.events.Publish(eventbus.Event{
			Topic: "terminalAgentChanged",
			Payload: map[string]any{
				"tabId": event.tabID,
				"agent": agentForEvent,
			},
		})
	}

	w.WriteHeader(http.StatusOK)
}
