package hook

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	agentkind "yishan/apps/cli/internal/agent/kind"
	internalevents "yishan/apps/cli/internal/events"
)

func TestServeAgentHookPublishesStartNotificationEvent(t *testing.T) {
	hub := internalevents.NewHub()
	ingress := newIngressForTest(hub)
	subscriptionID, events := hub.Subscribe()
	defer hub.Unsubscribe(subscriptionID)

	response := postHookPayload(t, ingress, map[string]any{
		"agent":       "codex",
		"workspaceId": "ws-1",
		"tabId":       "tab-1",
		"paneId":      "pane-1",
		"event":       "Start",
	})
	if response.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, response.Code)
	}

	event := readPublishedEvent(t, events)
	if event.Topic != "notificationEvent" {
		t.Fatalf("expected notificationEvent topic, got %q", event.Topic)
	}
	payload, ok := event.Payload.(map[string]any)
	if !ok {
		t.Fatalf("expected map payload, got %T", event.Payload)
	}
	if payload["title"] != "Run Started" || payload["agent"] != "codex" || payload["workspaceId"] != "ws-1" || payload["silent"] != true {
		t.Fatalf("unexpected payload: %#v", payload)
	}
	observerStatus, ok := payload["observerStatus"].(map[string]string)
	if !ok {
		t.Fatalf("expected observer status payload, got %#v", payload["observerStatus"])
	}
	if observerStatus["normalizedEventType"] != "start" || observerStatus["sessionKey"] != "ws-1:tab-1:pane-1" {
		t.Fatalf("unexpected observer status: %#v", observerStatus)
	}
}

func TestServeAgentHookPublishesFailedNotificationEvent(t *testing.T) {
	hub := internalevents.NewHub()
	ingress := newIngressForTest(hub)
	subscriptionID, events := hub.Subscribe()
	defer hub.Unsubscribe(subscriptionID)

	response := postHookPayload(t, ingress, map[string]any{
		"agent":        "claude",
		"workspaceId":  "ws-1",
		"tabId":        "tab-1",
		"paneId":       "pane-1",
		"rawEventType": "Failed",
	})
	if response.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, response.Code)
	}

	event := readPublishedEvent(t, events)
	payload, ok := event.Payload.(map[string]any)
	if !ok {
		t.Fatalf("expected map payload, got %T", event.Payload)
	}
	if payload["title"] != "Run Failed" || payload["tone"] != "error" || payload["notificationEventType"] != "run-failed" {
		t.Fatalf("unexpected payload: %#v", payload)
	}
	if _, ok := payload["showSystemNotification"]; ok {
		t.Fatalf("expected renderer to resolve system notification preference, got %#v", payload)
	}
}

func TestServeAgentHookSilencesPerToolFailureEvents(t *testing.T) {
	hub := internalevents.NewHub()
	ingress := newIngressForTest(hub)
	subscriptionID, events := hub.Subscribe()
	defer hub.Unsubscribe(subscriptionID)

	response := postHookPayload(t, ingress, map[string]any{
		"agent":        "claude",
		"workspaceId":  "ws-1",
		"tabId":        "tab-1",
		"paneId":       "pane-1",
		"rawEventType": "PostToolUseFailure",
	})
	if response.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, response.Code)
	}

	// PostToolUseFailure is a per-tool event — it should not produce a notification.
	select {
	case event := <-events:
		t.Fatalf("expected no notification for PostToolUseFailure, got topic=%q", event.Topic)
	case <-time.After(50 * time.Millisecond):
		// No event published — correct.
	}
}

func TestServeAgentHookPublishesPendingQuestionNotificationEvent(t *testing.T) {
	hub := internalevents.NewHub()
	ingress := newIngressForTest(hub)
	subscriptionID, events := hub.Subscribe()
	defer hub.Unsubscribe(subscriptionID)

	response := postHookPayload(t, ingress, map[string]any{
		"agent":       "opencode",
		"workspaceId": "ws-1",
		"tabId":       "tab-1",
		"paneId":      "pane-1",
		"event":       "wait_input",
	})
	if response.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, response.Code)
	}

	event := readPublishedEvent(t, events)
	payload, ok := event.Payload.(map[string]any)
	if !ok {
		t.Fatalf("expected map payload, got %T", event.Payload)
	}
	if payload["title"] != "Input Required" || payload["tone"] != "error" || payload["notificationEventType"] != "pending-question" {
		t.Fatalf("unexpected payload: %#v", payload)
	}
}

func TestServeAgentHookNormalizesSupportedAgentNames(t *testing.T) {
	for _, agent := range agentkind.All {
		t.Run(agent, func(t *testing.T) {
			hub := internalevents.NewHub()
			ingress := newIngressForTest(hub)
			subscriptionID, events := hub.Subscribe()
			defer hub.Unsubscribe(subscriptionID)

			response := postHookPayload(t, ingress, map[string]any{
				"agent":       agent,
				"workspaceId": "ws-1",
				"tabId":       "tab-1",
				"paneId":      "pane-1",
				"event":       "Start",
			})
			if response.Code != http.StatusOK {
				t.Fatalf("expected status %d, got %d", http.StatusOK, response.Code)
			}

			event := readPublishedEvent(t, events)
			payload, ok := event.Payload.(map[string]any)
			if !ok {
				t.Fatalf("expected map payload, got %T", event.Payload)
			}
			if payload["agent"] != agent {
				t.Fatalf("expected agent %q, got %#v", agent, payload["agent"])
			}
		})
	}
}

func TestServeAgentHookNormalizesCursorAgentAlias(t *testing.T) {
	hub := internalevents.NewHub()
	ingress := newIngressForTest(hub)
	subscriptionID, events := hub.Subscribe()
	defer hub.Unsubscribe(subscriptionID)

	response := postHookPayload(t, ingress, map[string]any{
		"agent":       "cursor-agent",
		"workspaceId": "ws-1",
		"tabId":       "tab-1",
		"paneId":      "pane-1",
		"event":       "Stop",
	})
	if response.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, response.Code)
	}

	event := readPublishedEvent(t, events)
	payload, ok := event.Payload.(map[string]any)
	if !ok {
		t.Fatalf("expected map payload, got %T", event.Payload)
	}
	if payload["agent"] != "cursor" {
		t.Fatalf("expected agent %q, got %q", "cursor", payload["agent"])
	}
}

func TestServeAgentHookRejectsInvalidPayload(t *testing.T) {
	hub := internalevents.NewHub()
	ingress := newIngressForTest(hub)
	response := postHookPayload(t, ingress, map[string]any{"event": "Start"})

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, response.Code)
	}
}

func postHookPayload(t *testing.T, handler http.Handler, payload map[string]any) *httptest.ResponseRecorder {
	t.Helper()
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, AgentHookIngestPath, bytes.NewReader(body))
	request.Header.Set("content-type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}

func readPublishedEvent(t *testing.T, events <-chan internalevents.Event) internalevents.Event {
	t.Helper()
	select {
	case event := <-events:
		return event
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for frontend event")
	}
	return internalevents.Event{}
}

// drainHookEvents reads all events published within a short window.
func drainHookEvents(t *testing.T, events <-chan internalevents.Event) []internalevents.Event {
	t.Helper()
	var collected []internalevents.Event
	for {
		select {
		case event := <-events:
			collected = append(collected, event)
		case <-time.After(50 * time.Millisecond):
			return collected
		}
	}
}

func TestServeAgentHookPublishesTerminalAgentChangedOnStart(t *testing.T) {
	hub := internalevents.NewHub()
	ingress := newIngressForTest(hub)
	subscriptionID, events := hub.Subscribe()
	defer hub.Unsubscribe(subscriptionID)

	response := postHookPayload(t, ingress, map[string]any{
		"agent":       "opencode",
		"workspaceId": "ws-1",
		"tabId":       "tab-1",
		"paneId":      "pane-1",
		"event":       "Start",
	})
	if response.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, response.Code)
	}

	published := drainHookEvents(t, events)
	var agentEvent *internalevents.Event
	for i := range published {
		if published[i].Topic == "terminalAgentChanged" {
			agentEvent = &published[i]
			break
		}
	}
	if agentEvent == nil {
		topics := make([]string, len(published))
		for i, e := range published {
			topics[i] = e.Topic
		}
		t.Fatalf("terminalAgentChanged not published; got topics: %v", topics)
	}
	payload, ok := agentEvent.Payload.(map[string]any)
	if !ok {
		t.Fatalf("expected map payload, got %T", agentEvent.Payload)
	}
	if payload["tabId"] != "tab-1" || payload["agent"] != "opencode" {
		t.Fatalf("unexpected terminalAgentChanged payload: %#v", payload)
	}
}

func TestServeAgentHookPublishesTerminalAgentChangedOnStop(t *testing.T) {
	hub := internalevents.NewHub()
	ingress := newIngressForTest(hub)
	subscriptionID, events := hub.Subscribe()
	defer hub.Unsubscribe(subscriptionID)

	response := postHookPayload(t, ingress, map[string]any{
		"agent":       "opencode",
		"workspaceId": "ws-1",
		"tabId":       "tab-1",
		"paneId":      "pane-1",
		"event":       "Stop",
	})
	if response.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, response.Code)
	}

	published := drainHookEvents(t, events)
	var agentEvent *internalevents.Event
	for i := range published {
		if published[i].Topic == "terminalAgentChanged" {
			agentEvent = &published[i]
			break
		}
	}
	if agentEvent == nil {
		t.Fatalf("terminalAgentChanged not published")
	}
	payload, ok := agentEvent.Payload.(map[string]any)
	if !ok {
		t.Fatalf("expected map payload, got %T", agentEvent.Payload)
	}
	if payload["tabId"] != "tab-1" || payload["agent"] != "" {
		t.Fatalf("unexpected terminalAgentChanged payload on stop: %#v", payload)
	}
}

func TestServeAgentHookNoTerminalAgentChangedWhenTabIdMissing(t *testing.T) {
	hub := internalevents.NewHub()
	ingress := newIngressForTest(hub)
	subscriptionID, events := hub.Subscribe()
	defer hub.Unsubscribe(subscriptionID)

	// No tabId in payload — terminalAgentChanged must not be published.
	response := postHookPayload(t, ingress, map[string]any{
		"agent":       "opencode",
		"workspaceId": "ws-1",
		"paneId":      "pane-1",
		"event":       "Start",
	})
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d (missing tabId), got %d", http.StatusBadRequest, response.Code)
	}

	// No events should be published for an invalid payload.
	select {
	case event := <-events:
		t.Fatalf("expected no events for invalid payload, got topic=%q", event.Topic)
	case <-time.After(50 * time.Millisecond):
		// correct — nothing published
	}
}

func TestServeAgentHookLaunchedPublishesTerminalAgentChangedButNoNotification(t *testing.T) {
	hub := internalevents.NewHub()
	ingress := newIngressForTest(hub)
	subscriptionID, events := hub.Subscribe()
	defer hub.Unsubscribe(subscriptionID)

	response := postHookPayload(t, ingress, map[string]any{
		"agent":       "opencode",
		"workspaceId": "ws-1",
		"tabId":       "tab-1",
		"paneId":      "pane-1",
		"event":       "Launched",
	})
	if response.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, response.Code)
	}

	published := drainHookEvents(t, events)

	var agentEvent *internalevents.Event
	var notificationEvent *internalevents.Event
	for i := range published {
		if published[i].Topic == "terminalAgentChanged" {
			agentEvent = &published[i]
		}
		if published[i].Topic == "notificationEvent" {
			notificationEvent = &published[i]
		}
	}

	if agentEvent == nil {
		t.Fatal("terminalAgentChanged should be published for Launched event (tab icon)")
	}
	payload, ok := agentEvent.Payload.(map[string]any)
	if !ok {
		t.Fatalf("expected map payload, got %T", agentEvent.Payload)
	}
	if payload["tabId"] != "tab-1" || payload["agent"] != "opencode" {
		t.Fatalf("unexpected terminalAgentChanged payload: %#v", payload)
	}

	if notificationEvent != nil {
		t.Fatalf("notificationEvent should NOT be published for Launched (no workspace spin), got: %#v", notificationEvent.Payload)
	}
}

// newIngressForTest builds a hook ingress with an event hub (token usage,
// memory, and registry are nil; the ingress guards them).
func newIngressForTest(events *internalevents.Hub) *Ingress {
	return NewIngress(IngressDeps{
		Events: events,
		Usage:  NewUsageTracker(),
	})
}
