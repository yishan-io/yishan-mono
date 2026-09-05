package agent

import (
	"time"

	"yishan/apps/cli/internal/events"
	"yishan/apps/cli/internal/node/notification"
)

func (s *Service) publishDSHNotification(route dshRoute, projection dshNotificationProjection) {
	if s.deps.Events == nil {
		return
	}
	paneID := route.paneID
	if paneID == "" {
		paneID = route.sessionID
	}
	payload := notification.BuildLifecyclePayload(notification.LifecycleInput{
		ID:                    projection.id,
		CreatedAt:             time.Now().UTC().Format(time.RFC3339Nano),
		Agent:                 "dsh",
		WorkspaceID:           route.workspaceID,
		ObserverEventType:     projection.observer,
		SessionKey:            route.workspaceID + ":" + route.tabID + ":" + paneID,
		Silent:                projection.silent,
		NotificationEventType: projection.eventType,
	})
	s.deps.Events.Publish(eventbus.Event{Topic: "notificationEvent", Payload: payload})
}
