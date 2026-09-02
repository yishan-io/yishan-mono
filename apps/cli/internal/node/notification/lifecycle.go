// Package notification builds product notification payloads from producer-owned lifecycle facts.
package notification

const (
	pendingQuestionEvent = "pending-question"
	runFinishedEvent     = "run-finished"
	runFailedEvent       = "run-failed"
)

// LifecycleInput contains producer-supplied notification identity and lifecycle facts.
type LifecycleInput struct {
	ID, CreatedAt, Agent, WorkspaceID                    string
	ObserverEventType, SessionKey, NotificationEventType string
	Silent                                               bool
}

// BuildLifecyclePayload formats a product notification payload from lifecycle facts.
func BuildLifecyclePayload(input LifecycleInput) map[string]any {
	title, body, tone := lifecycleCopy(input.NotificationEventType, input.ObserverEventType, input.WorkspaceID)
	payload := map[string]any{
		"id":          input.ID,
		"title":       title,
		"body":        body,
		"tone":        tone,
		"createdAt":   input.CreatedAt,
		"agent":       input.Agent,
		"workspaceId": input.WorkspaceID,
		"silent":      input.Silent,
		"observerStatus": map[string]string{
			"normalizedEventType": input.ObserverEventType,
			"sessionKey":          input.SessionKey,
		},
	}
	if input.NotificationEventType != "" {
		payload["notificationEventType"] = input.NotificationEventType
	}
	return payload
}

func lifecycleCopy(notificationEventType, observerEventType, workspaceID string) (string, string, string) {
	switch notificationEventType {
	case pendingQuestionEvent:
		return "Input Required", "Workspace " + workspaceID + " is waiting for your approval or input.", "error"
	case runFinishedEvent:
		return "Run Completed", "Workspace " + workspaceID + " has completed successfully.", "success"
	case runFailedEvent:
		return "Run Failed", "Workspace " + workspaceID + " has stopped with an error.", "error"
	}
	if observerEventType == "start" {
		return "Run Started", "Workspace " + workspaceID + " is running.", "success"
	}
	return "Run Stopped", "Workspace " + workspaceID + " is no longer active.", "success"
}
