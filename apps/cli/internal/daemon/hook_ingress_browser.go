package daemon

import (
	"net/http"
	"strings"
)

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
