// Package application owns the workspace create/close orchestration. The
// JSON-RPC handler is a thin wrapper: it decodes input, calls one
// Service method, and encodes output. Rollback policy lives here; the daemon
// implements the ports with its manager / SQLite store / event hub. Every
// workspace is created and closed on the daemon's own node.
package application

import "yishan/apps/cli/internal/workspace"

// CreateResult is the synchronous result of a create request; the actual
// create executes asynchronously.
type CreateResult struct {
	ID            string
	Status        string
	WorkspaceName string
	Branch        string
}

// CreatePlan is a prepared create: all state needed to execute a create
// request, produced by prepare and consumed by execute.
type CreatePlan struct {
	WorkspaceID    string
	LocalTaskID    string
	OrganizationID string
	ProjectID      string
	StartedEvent   StartedEvent
	LocalCreate    *workspace.CreateRequest
	Registration   *Registration
}

// Registration is the workspace record registration persisted as the local
// row. Kind is the typed domain value.
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
	WorkspaceID      string
	Path             string
	Branch           string
	RemoveBranch     bool
	ForceWorktree    bool
	ForceBranch      bool
	PostHook         string
	AgentSummaryDone bool
}
