package workspace

import (
	"reflect"
	"testing"
	"time"
	internalevents "yishan/apps/cli/internal/events"
)

func collectUntil(t *testing.T, ch <-chan internalevents.Event, terminalTopic string, timeout time.Duration) []internalevents.Event {
	t.Helper()
	var collected []internalevents.Event
	deadline := time.After(timeout)
	for {
		select {
		case event := <-ch:
			collected = append(collected, event)
			if event.Topic == terminalTopic {
				return collected
			}
		case <-deadline:
			t.Fatalf("timed out waiting for %q; collected: %v", terminalTopic, eventTopicNames(collected))
		}
	}
}

// collectFor drains the event channel for the grace period and returns what
// arrived. Used after a terminal event to prove no further lifecycle events
// were emitted.

func collectFor(t *testing.T, ch <-chan internalevents.Event, grace time.Duration) []internalevents.Event {
	t.Helper()
	var collected []internalevents.Event
	deadline := time.After(grace)
	for {
		select {
		case event := <-ch:
			collected = append(collected, event)
		case <-deadline:
			return collected
		}
	}
}

func eventTopicNames(events []internalevents.Event) []string {
	names := make([]string, 0, len(events))
	for _, event := range events {
		names = append(names, event.Topic)
	}
	return names
}

func lifecycleTopicNames(events []internalevents.Event) []string {
	var names []string
	for _, event := range events {
		if lifecycleEventTopics[event.Topic] {
			names = append(names, event.Topic)
		}
	}
	return names
}

func assertTopicSequence(t *testing.T, events []internalevents.Event, want []string) {
	t.Helper()
	got := lifecycleTopicNames(events)
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("lifecycle topic sequence = %v, want %v", got, want)
	}
}

// wireRelayCapture runs a real relay client against a fake relay that echoes a
// verdict and forwards every received JSON-RPC message (the relay envelope) to
// the returned channel.
