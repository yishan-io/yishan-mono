package daemon

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"yishan/apps/cli/internal/workspace"
)

func TestServeAgentHookPublishesStartNotificationEvent(t *testing.T) {
	handler := NewJSONRPCHandler(workspace.NewManager(), "node-1", nil)
	subscriptionID, events := handler.events.Subscribe()
	defer handler.events.Unsubscribe(subscriptionID)

	response := postHookPayload(t, handler, map[string]any{
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
	if payload["title"] != "Run Started" || payload["workspaceId"] != "ws-1" || payload["silent"] != true {
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
	handler := NewJSONRPCHandler(workspace.NewManager(), "node-1", nil)
	subscriptionID, events := handler.events.Subscribe()
	defer handler.events.Unsubscribe(subscriptionID)

	response := postHookPayload(t, handler, map[string]any{
		"agent":        "claude",
		"workspaceId":  "ws-1",
		"tabId":        "tab-1",
		"paneId":       "pane-1",
		"rawEventType": "PostToolUseFailure",
	})
	if response.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, response.Code)
	}

	event := readPublishedEvent(t, events)
	payload, ok := event.Payload.(map[string]any)
	if !ok {
		t.Fatalf("expected map payload, got %T", event.Payload)
	}
	if payload["title"] != "Run Failed" || payload["tone"] != "error" || payload["showSystemNotification"] != true {
		t.Fatalf("unexpected payload: %#v", payload)
	}
	sound, ok := payload["soundToPlay"].(map[string]any)
	if !ok || sound["soundId"] != "alert" {
		t.Fatalf("unexpected sound payload: %#v", payload["soundToPlay"])
	}
}

func TestServeAgentHookRejectsInvalidPayload(t *testing.T) {
	handler := NewJSONRPCHandler(workspace.NewManager(), "node-1", nil)
	response := postHookPayload(t, handler, map[string]any{"event": "Start"})

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, response.Code)
	}
}

func postHookPayload(t *testing.T, handler *JSONRPCHandler, payload map[string]any) *httptest.ResponseRecorder {
	t.Helper()
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, agentHookIngestPath, bytes.NewReader(body))
	request.Header.Set("content-type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeAgentHook(response, request)
	return response
}

func readPublishedEvent(t *testing.T, events <-chan frontendEvent) frontendEvent {
	t.Helper()
	select {
	case event := <-events:
		return event
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for frontend event")
	}
	return frontendEvent{}
}
