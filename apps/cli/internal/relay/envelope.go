// Package relay owns the workspace relay envelopes: the JSON payloads
// exchanged between daemon nodes for workspace create/close dispatch and
// progress relay-back. The daemon's relay transport uses these types and
// builders; the domain packages do not.
package relay

import (
	"encoding/json"
	"strings"

	"yishan/apps/cli/internal/events"
	"yishan/apps/cli/internal/workspace"
	application "yishan/apps/cli/internal/workspace/application"
)

// Relay change kinds carried by the create envelopes.
const (
	ChangeCreateRequest   = "workspace.create.request"
	ChangeCreateProgress  = "workspace.create.progress"
	ChangeCreateCompleted = "workspace.create.completed"
	ChangeCreateFailed    = "workspace.create.failed"
	// ChangeCloseRequest is the close dispatch envelope kind.
	ChangeCloseRequest = "workspace.close.request"
)

// CreateEnvelope is the relay payload for a workspace create (request,
// progress, completed, or failed).
type CreateEnvelope struct {
	OrganizationID string                         `json:"organizationId,omitempty"`
	ProjectID      string                         `json:"projectId,omitempty"`
	WorkspaceID    string                         `json:"workspaceId,omitempty"`
	SourceNodeID   string                         `json:"sourceNodeId,omitempty"`
	TargetNodeID   string                         `json:"targetNodeId,omitempty"`
	Change         string                         `json:"change,omitempty"`
	Started        *application.StartedEvent      `json:"started,omitempty"`
	Request        *application.CreateCommand     `json:"request,omitempty"`
	Progress       *workspace.CreateProgressEvent `json:"progress,omitempty"`
	Completed      map[string]any                 `json:"completed,omitempty"`
	Failed         *application.FailedEvent       `json:"failed,omitempty"`
}

// CloseEnvelope is the relay payload for a workspace close request.
type CloseEnvelope struct {
	OrganizationID string `json:"organizationId,omitempty"`
	ProjectID      string `json:"projectId,omitempty"`
	WorkspaceID    string `json:"workspaceId,omitempty"`
	SourceNodeID   string `json:"sourceNodeId,omitempty"`
	TargetNodeID   string `json:"targetNodeId,omitempty"`
	Change         string `json:"change,omitempty"`
	Branch         string `json:"branch,omitempty"`
	RemoveBranch   bool   `json:"removeBranch,omitempty"`
	ForceWorktree  bool   `json:"forceWorktree,omitempty"`
	ForceBranch    bool   `json:"forceBranch,omitempty"`
	PostHook       string `json:"postHook,omitempty"`
}

// BuildCreateRequest builds the relay envelope that dispatches a create to its
// executor node.
func BuildCreateRequest(req application.CreateCommand, sourceNodeID string, started application.StartedEvent) CreateEnvelope {
	return CreateEnvelope{
		OrganizationID: req.OrganizationID,
		ProjectID:      req.ProjectID,
		WorkspaceID:    req.ID,
		SourceNodeID:   sourceNodeID,
		TargetNodeID:   req.NodeID,
		Change:         ChangeCreateRequest,
		Started:        &started,
		Request:        &req,
	}
}

// BuildCreateProgress builds the relay envelope that relays a progress event
// back to the origin node.
func BuildCreateProgress(workspaceID string, organizationID string, projectID string, sourceNodeID string, targetNodeID string, event workspace.CreateProgressEvent) CreateEnvelope {
	return CreateEnvelope{
		OrganizationID: organizationID,
		ProjectID:      projectID,
		WorkspaceID:    workspaceID,
		SourceNodeID:   sourceNodeID,
		TargetNodeID:   targetNodeID,
		Change:         ChangeCreateProgress,
		Progress:       &event,
	}
}

// BuildCreateCompleted builds the relay envelope that relays the completion
// payload back to the origin node.
func BuildCreateCompleted(workspaceID string, organizationID string, projectID string, sourceNodeID string, targetNodeID string, completed map[string]any) CreateEnvelope {
	return CreateEnvelope{
		OrganizationID: organizationID,
		ProjectID:      projectID,
		WorkspaceID:    workspaceID,
		SourceNodeID:   sourceNodeID,
		TargetNodeID:   targetNodeID,
		Change:         ChangeCreateCompleted,
		Completed:      completed,
	}
}

// BuildCreateFailed builds the relay envelope that relays a create failure
// back to the origin node.
func BuildCreateFailed(workspaceID string, organizationID string, projectID string, sourceNodeID string, targetNodeID string, failed application.FailedEvent) CreateEnvelope {
	return CreateEnvelope{
		OrganizationID: organizationID,
		ProjectID:      projectID,
		WorkspaceID:    workspaceID,
		SourceNodeID:   sourceNodeID,
		TargetNodeID:   targetNodeID,
		Change:         ChangeCreateFailed,
		Failed:         &failed,
	}
}

// BuildCloseEnvelope builds the relay envelope that dispatches a close to the
// workspace's owner node.
func BuildCloseEnvelope(organizationID string, projectID string, workspaceID string, sourceNodeID string, targetNodeID string, branch string, removeBranch bool, forceWorktree bool, forceBranch bool, postHook string) CloseEnvelope {
	return CloseEnvelope{
		OrganizationID: organizationID,
		ProjectID:      projectID,
		WorkspaceID:    workspaceID,
		SourceNodeID:   sourceNodeID,
		TargetNodeID:   targetNodeID,
		Change:         ChangeCloseRequest,
		Branch:         branch,
		RemoveBranch:   removeBranch,
		ForceWorktree:  forceWorktree,
		ForceBranch:    forceBranch,
		PostHook:       postHook,
	}
}

// DecodeCreateEnvelope decodes a relay create envelope from raw JSON params.
// Returns false when the payload is not a create envelope.
func DecodeCreateEnvelope(params json.RawMessage) (CreateEnvelope, bool) {
	var payload CreateEnvelope
	if len(params) == 0 {
		return CreateEnvelope{}, false
	}
	if err := json.Unmarshal(params, &payload); err != nil {
		return CreateEnvelope{}, false
	}
	if !strings.HasPrefix(strings.TrimSpace(payload.Change), "workspace.create.") {
		return CreateEnvelope{}, false
	}
	return payload, true
}

// DecodeCloseEnvelope decodes a relay close envelope from raw JSON params.
// Returns false when the payload is not a close envelope.
func DecodeCloseEnvelope(params json.RawMessage) (CloseEnvelope, bool) {
	var payload CloseEnvelope
	if len(params) == 0 {
		return CloseEnvelope{}, false
	}
	if err := json.Unmarshal(params, &payload); err != nil {
		return CloseEnvelope{}, false
	}
	if !strings.HasPrefix(strings.TrimSpace(payload.Change), "workspace.close.") {
		return CloseEnvelope{}, false
	}
	return payload, true
}

// RepublishedCreateEvent maps an incoming create envelope to the frontend event
// it should republish locally (create started on the source node, progress /
// completed / failed on the target node). Returns nil when the envelope is not
// destined for this node.
func RepublishedCreateEvent(payload CreateEnvelope, localNodeID string) (*events.Event, bool) {
	switch payload.Change {
	case ChangeCreateRequest:
		if payload.Started != nil && strings.TrimSpace(payload.SourceNodeID) == strings.TrimSpace(localNodeID) {
			event := events.Event{Topic: "workspaceCreateStarted", Payload: *payload.Started}
			return &event, true
		}
	case ChangeCreateProgress:
		if strings.TrimSpace(payload.TargetNodeID) == strings.TrimSpace(localNodeID) && payload.Progress != nil {
			event := events.Event{Topic: "workspaceCreateProgress", Payload: *payload.Progress}
			return &event, true
		}
	case ChangeCreateCompleted:
		if strings.TrimSpace(payload.TargetNodeID) == strings.TrimSpace(localNodeID) && payload.Completed != nil {
			event := events.Event{Topic: "workspaceCreateCompleted", Payload: payload.Completed}
			return &event, true
		}
	case ChangeCreateFailed:
		if strings.TrimSpace(payload.TargetNodeID) == strings.TrimSpace(localNodeID) && payload.Failed != nil {
			event := events.Event{Topic: "workspaceCreateFailed", Payload: *payload.Failed}
			return &event, true
		}
	}
	return nil, false
}
