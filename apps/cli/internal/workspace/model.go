package workspace

import "yishan/apps/cli/internal/git"

// Workspace domain model. These types are the vocabulary for workspace
// lifecycle code written during the CLI/daemon refactor: new application code
// must use them instead of lifecycle string literals. Transport structs
// (JSON-RPC params, relay envelopes, API DTOs, SQLite rows) keep plain string
// fields; conversion happens in named mapper functions (see
// internal/apiclient and internal/dbconv) so the domain stays free of transport imports.

// ID is the canonical workspace identifier shared across the local SQLite
// record, the cloud API record, and relay payloads.
type ID string

// Kind distinguishes workspace record kinds. The values originate from the
// api-service schema.
type Kind string

const (
	KindPrimary  Kind = "primary"
	KindWorktree Kind = "worktree"
	// KindFolder marks a workspace that lives only in the daemon DB (project_id
	// NULL, organization_id NULL) and represents a local folder rather than a
	// remote project worktree.
	KindFolder Kind = "folder"
)

// Status is the workspace record lifecycle status, mirroring the api-service
// transition contract: provisioning → active → closing → closed, with
// closing → active as the failed-teardown revert.
type Status string

const (
	StatusProvisioning Status = "provisioning"
	StatusActive       Status = "active"
	StatusClosing      Status = "closing"
	StatusClosed       Status = "closed"
)

// Record is the domain representation of a workspace record, independent of
// the transport representations (cloud API workspace, local SQLite row).
// It carries the lifecycle fields only; runtime state and health live in
// instance.Runtime.
type Record struct {
	ID        ID
	ProjectID string
	NodeID    string
	Kind      Kind
	Status    Status
	Branch    string
	// LocalPath is the worktree path on the owning node (from the cloud
	// record; empty when the workspace has not been provisioned yet).
	LocalPath string
}

type Workspace struct {
	ID              string                `json:"id"`
	Path            string                `json:"path"`
	OrgID           string                `json:"orgId,omitempty"`
	ProjectID       string                `json:"projectId,omitempty"`
	State           State                 `json:"state"`
	Health          Health                `json:"health,omitempty"`
	SetupHookResult *HookResult           `json:"setupHookResult,omitempty"`
	PullRequest     *WorkspacePullRequest `json:"pullRequest,omitempty"`
}

type WorkspacePullRequest struct {
	Number         int                            `json:"number"`
	Title          string                         `json:"title,omitempty"`
	URL            string                         `json:"url,omitempty"`
	Branch         string                         `json:"branch,omitempty"`
	BaseBranch     string                         `json:"baseBranch,omitempty"`
	GitHubState    string                         `json:"githubState,omitempty"`
	Status         string                         `json:"status,omitempty"`
	ReviewDecision string                         `json:"reviewDecision,omitempty"`
	IsDraft        bool                           `json:"isDraft,omitempty"`
	Complete       bool                           `json:"complete,omitempty"`
	UpdatedAt      string                         `json:"updatedAt,omitempty"`
	Checks         []git.GitPullRequestCheck      `json:"checks,omitempty"`
	Deployments    []git.GitPullRequestDeployment `json:"deployments,omitempty"`
}
