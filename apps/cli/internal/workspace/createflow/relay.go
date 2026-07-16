package createflow

import (
	"encoding/json"
	"strings"

	"yishan/apps/cli/internal/events"
	"yishan/apps/cli/internal/workspace"
)

const (
	RelayChangeCreateRequest   = "workspace.create.request"
	RelayChangeCreateProgress  = "workspace.create.progress"
	RelayChangeCreateCompleted = "workspace.create.completed"
	RelayChangeCreateFailed    = "workspace.create.failed"
)

func BuildRelayRequestEnvelope(req WorkspaceCreateParams, sourceNodeID string, started WorkspaceCreateStartedEvent) RelayWorkspaceCreateEnvelope {
	return RelayWorkspaceCreateEnvelope{
		OrganizationID: req.OrganizationID,
		ProjectID:      req.ProjectID,
		WorkspaceID:    req.ID,
		SourceNodeID:   sourceNodeID,
		TargetNodeID:   req.NodeID,
		Change:         RelayChangeCreateRequest,
		Started:        &started,
		Request:        &req,
	}
}

func BuildRelayProgressEnvelope(workspaceID string, organizationID string, projectID string, sourceNodeID string, targetNodeID string, event workspace.CreateProgressEvent) RelayWorkspaceCreateEnvelope {
	return RelayWorkspaceCreateEnvelope{
		OrganizationID: organizationID,
		ProjectID:      projectID,
		WorkspaceID:    workspaceID,
		SourceNodeID:   sourceNodeID,
		TargetNodeID:   targetNodeID,
		Change:         RelayChangeCreateProgress,
		Progress:       &event,
	}
}

func BuildRelayCompletedEnvelope(workspaceID string, organizationID string, projectID string, sourceNodeID string, targetNodeID string, completed map[string]any) RelayWorkspaceCreateEnvelope {
	return RelayWorkspaceCreateEnvelope{
		OrganizationID: organizationID,
		ProjectID:      projectID,
		WorkspaceID:    workspaceID,
		SourceNodeID:   sourceNodeID,
		TargetNodeID:   targetNodeID,
		Change:         RelayChangeCreateCompleted,
		Completed:      completed,
	}
}

func BuildRelayFailedEnvelope(workspaceID string, organizationID string, projectID string, sourceNodeID string, targetNodeID string, failed WorkspaceCreateFailedEvent) RelayWorkspaceCreateEnvelope {
	return RelayWorkspaceCreateEnvelope{
		OrganizationID: organizationID,
		ProjectID:      projectID,
		WorkspaceID:    workspaceID,
		SourceNodeID:   sourceNodeID,
		TargetNodeID:   targetNodeID,
		Change:         RelayChangeCreateFailed,
		Failed:         &failed,
	}
}

func DecodeRelayWorkspaceCreateEnvelope(params json.RawMessage) (RelayWorkspaceCreateEnvelope, bool) {
	var payload RelayWorkspaceCreateEnvelope
	if len(params) == 0 {
		return RelayWorkspaceCreateEnvelope{}, false
	}
	if err := json.Unmarshal(params, &payload); err != nil {
		return RelayWorkspaceCreateEnvelope{}, false
	}
	if !strings.HasPrefix(strings.TrimSpace(payload.Change), "workspace.create.") {
		return RelayWorkspaceCreateEnvelope{}, false
	}
	return payload, true
}

func RepublishedRelayCreateEvent(payload RelayWorkspaceCreateEnvelope, localNodeID string) (*events.Event, bool) {
	switch payload.Change {
	case RelayChangeCreateRequest:
		if payload.Started != nil && strings.TrimSpace(payload.SourceNodeID) == strings.TrimSpace(localNodeID) {
			event := events.Event{Topic: "workspaceCreateStarted", Payload: *payload.Started}
			return &event, true
		}
	case RelayChangeCreateProgress:
		if strings.TrimSpace(payload.TargetNodeID) == strings.TrimSpace(localNodeID) && payload.Progress != nil {
			event := events.Event{Topic: "workspaceCreateProgress", Payload: *payload.Progress}
			return &event, true
		}
	case RelayChangeCreateCompleted:
		if strings.TrimSpace(payload.TargetNodeID) == strings.TrimSpace(localNodeID) && payload.Completed != nil {
			event := events.Event{Topic: "workspaceCreateCompleted", Payload: payload.Completed}
			return &event, true
		}
	case RelayChangeCreateFailed:
		if strings.TrimSpace(payload.TargetNodeID) == strings.TrimSpace(localNodeID) && payload.Failed != nil {
			event := events.Event{Topic: "workspaceCreateFailed", Payload: *payload.Failed}
			return &event, true
		}
	}
	return nil, false
}
