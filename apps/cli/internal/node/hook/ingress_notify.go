package hook

import (
	"crypto/rand"
	"encoding/hex"
	"strings"
	"time"

	"yishan/apps/cli/internal/node/notification"
)

func buildHookNotificationPayload(event normalizedHookEvent) map[string]any {
	// Ignore explicit TaskComplete events from plugins — they are task-level
	// notifications and should not be treated as session-level terminal events.
	if strings.Contains(strings.ToLower(event.rawEventType), "taskcomplete") {
		return nil
	}

	switch event.eventType {
	case "start":
		return hookNotificationPayload(event, true, "")
	case "wait_input":
		return hookNotificationPayload(event, false, "pending-question")
	case "stop":
		if isFailedHookEvent(event.rawEventType) {
			return hookNotificationPayload(event, false, "run-failed")
		}
		return hookNotificationPayload(event, false, "run-finished")
	default:
		return nil
	}
}

func hookNotificationPayload(event normalizedHookEvent, silent bool, notificationEventType string) map[string]any {
	return notification.BuildLifecyclePayload(notification.LifecycleInput{
		ID:                    newHookEventID(),
		CreatedAt:             time.Now().UTC().Format(time.RFC3339Nano),
		Agent:                 event.agent,
		WorkspaceID:           event.workspaceID,
		ObserverEventType:     event.eventType,
		SessionKey:            event.sessionKey,
		Silent:                silent,
		NotificationEventType: notificationEventType,
	})
}

func newHookEventID() string {
	var bytes [8]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return "hook-" + time.Now().UTC().Format("20060102150405.000000000")
	}
	return "hook-" + hex.EncodeToString(bytes[:])
}
