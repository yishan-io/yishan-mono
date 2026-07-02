package daemon

import (
	"testing"
	"time"
)

func TestEventHub_Publish_DoesNotUnsubscribeSlowSubscriberOnOverflow(t *testing.T) {
	hub := newEventHub()
	subscriptionID, events := hub.Subscribe()
	defer hub.Unsubscribe(subscriptionID)

	for i := 0; i < 128; i++ {
		hub.Publish(frontendEvent{Topic: "fill"})
	}

	hub.Publish(frontendEvent{Topic: "overflow"})

	for i := 0; i < 128; i++ {
		select {
		case <-events:
		case <-time.After(time.Second):
			t.Fatalf("timed out draining buffered event %d", i)
		}
	}

	hub.Publish(frontendEvent{Topic: "after-overflow"})

	select {
	case event := <-events:
		if event.Topic != "after-overflow" {
			t.Fatalf("event topic = %q, want %q", event.Topic, "after-overflow")
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for event after overflow")
	}
}
