package daemon

import (
	"crypto/rand"
	"encoding/hex"
	"strings"
	"time"
)

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

func newHookEventID() string {
	var bytes [8]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return "hook-" + time.Now().UTC().Format("20060102150405.000000000")
	}
	return "hook-" + hex.EncodeToString(bytes[:])
}
