package daemon

import (
	"encoding/json"
	"testing"
)

func TestPublishWorkspaceSnapshotChanged_RepublishesCreateStartedForSourceNode(t *testing.T) {
	handler := newTestHandler(t)
	handler.nodeID = "node-source"
	subscriptionID, events := handler.events.Subscribe()
	defer handler.events.Unsubscribe(subscriptionID)

	params, err := json.Marshal(relayWorkspaceCreateEnvelope{
		OrganizationID: "org-1",
		ProjectID:      "project-1",
		WorkspaceID:    "workspace-1",
		SourceNodeID:   "node-source",
		TargetNodeID:   "node-remote",
		Change:         workspaceRelayChangeCreateRequest,
		Started: &workspaceCreateStartedEvent{
			WorkspaceID:    "workspace-1",
			OrganizationID: "org-1",
			ProjectID:      "project-1",
			WorkspaceName:  "feature-a",
			SourceBranch:   "main",
			Branch:         "feature-a",
			NodeID:         "node-remote",
		},
		Request: &workspaceCreateParams{
			ID:             "workspace-1",
			OrganizationID: "org-1",
			ProjectID:      "project-1",
			NodeID:         "node-remote",
			WorkspaceName:  "feature-a",
			Branch:         "feature-a",
			SourceBranch:   "main",
		},
	})
	if err != nil {
		t.Fatalf("marshal params: %v", err)
	}

	publishWorkspaceSnapshotChanged(handler, params)

	event := expectEventTopic(t, events, "workspaceCreateStarted")
	payload, ok := event.Payload.(workspaceCreateStartedEvent)
	if !ok {
		t.Fatalf("expected workspaceCreateStarted payload, got %T", event.Payload)
	}
	if payload.WorkspaceID != "workspace-1" || payload.NodeID != "node-remote" {
		t.Fatalf("unexpected payload: %+v", payload)
	}
	if payload.WorkspaceName != "feature-a" || payload.SourceBranch != "main" || payload.Branch != "feature-a" {
		t.Fatalf("unexpected branch payload: %+v", payload)
	}
}
