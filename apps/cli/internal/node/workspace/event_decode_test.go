package workspace

import (
	"testing"

	eventbus "yishan/apps/cli/internal/events"
	"yishan/apps/cli/internal/workspace"
)

func decodeCreateStartedEvent(t *testing.T, event eventbus.Event) workspaceCreateStartedEvent {
	t.Helper()
	started, ok := event.Payload.(workspaceCreateStartedEvent)
	if !ok {
		t.Fatalf("workspaceCreateStarted payload = %T, want workspaceCreateStartedEvent", event.Payload)
	}
	return started
}

func decodeProgressEvents(t *testing.T, events []eventbus.Event) []workspace.CreateProgressEvent {
	t.Helper()
	var progress []workspace.CreateProgressEvent
	for _, event := range events {
		if event.Topic != "workspaceCreateProgress" {
			continue
		}
		progressEvent, ok := event.Payload.(workspace.CreateProgressEvent)
		if !ok {
			t.Fatalf("workspaceCreateProgress payload = %T, want workspace.CreateProgressEvent", event.Payload)
		}
		progress = append(progress, progressEvent)
	}
	return progress
}

func progressStepSequence(progress []workspace.CreateProgressEvent) []string {
	out := make([]string, 0, len(progress))
	for _, event := range progress {
		out = append(out, event.StepID+":"+string(event.Status))
	}
	return out
}

// newBehaviorHandler builds a handler with the given runtime and node. When
// database is non-nil it is attached directly (bypassing SetLocalDatabase so
// no token-usage collector is wired into the test).
