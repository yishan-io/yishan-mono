// Package application owns the workspace create/close orchestration. The
// JSON-RPC handler is a thin wrapper: it decodes input, calls one
// Service method, and encodes output. Routing (local vs remote node) and
// rollback policy live here; the daemon implements the ports with its existing
// manager / API client / SQLite store / relay connection / event hub.
package application

import "yishan/apps/cli/internal/workspace"

// CreateResult is the synchronous result of a create request; the actual
// create executes asynchronously.
type CreateResult struct {
	ID     string
	Status string
}

// CreatePlan is a prepared create: all state needed to execute (locally or via
// relay) a create request, produced by prepare and consumed by execute.
type CreatePlan struct {
	WorkspaceID      string
	OrganizationID   string
	ProjectID        string
	StartedEvent     StartedEvent
	RelayReplyNodeID string
	IsRelayed        bool // true when dispatched from another node via relay
	LocalCreate      *workspace.CreateRequest
	Registration     *Registration
	RemoteRequest    *CreateCommand
}

// Registration is the workspace record registration shared by the local row,
// the cloud record, and the relayed request. Moved from the daemon
// WorkspaceCreation; Kind is the typed domain value.
type Registration struct {
	ID             string
	NodeID         string
	SourceNodeID   string
	OrganizationID string
	ProjectID      string
	Kind           workspace.Kind
	Branch         string
	SourceBranch   string
	LocalPath      string
}

// CloseCommand is the decoded workspace.close JSON-RPC request.
type CloseCommand struct {
	WorkspaceID    string `json:"workspaceId"`
	OrganizationID string `json:"organizationId,omitempty"`
	ProjectID      string `json:"projectId,omitempty"`
	Branch         string `json:"branch,omitempty"`
	WorktreePath   string `json:"worktreePath,omitempty"`
	RemoveBranch   bool   `json:"removeBranch,omitempty"`
	ForceWorktree  bool   `json:"forceWorktree,omitempty"`
	ForceBranch    bool   `json:"forceBranch,omitempty"`
	PostHook       string `json:"postHook,omitempty"`
}

// CleanupRequest mirrors workspace.ClosePathRequest for the daemon's pending
// cleanup store (create rollback / close retry).
type CleanupRequest struct {
	WorkspaceID   string
	Path          string
	Branch        string
	RemoveBranch  bool
	ForceWorktree bool
	ForceBranch   bool
	PostHook      string
}
