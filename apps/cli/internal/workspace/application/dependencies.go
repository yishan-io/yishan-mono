package application

import (
	"context"

	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/instance"
)

// The interfaces in this file are the capabilities the Service needs from the
// outside world. The daemon implements them with its manager, API client,
// SQLite store, relay connection, and event hub; the application package never
// imports daemon or transport types. They are injected via the constructor so
// tests can substitute fakes.

// Project is the domain-shaped project metadata needed for create routing
// (a transport-free view of the api-service project record).
type Project struct {
	ID             string
	RepoKey        string
	RepoURL        string
	SetupScript    string
	ContextEnabled bool
}

// Node is the domain-shaped node record used for create routing.
type Node struct {
	ID string
}

// Environment resolves projects, workspaces, and nodes from the cloud API.
type Environment interface {
	APIConfigured() bool
	ListProjects(ctx context.Context, organizationID string) ([]Project, error)
	ListWorkspaces(ctx context.Context, organizationID string, projectID string) ([]workspace.Record, error)
	ListNodes(ctx context.Context, organizationID string) ([]Node, error)
	// EnsureSharedRepoClone returns a local clone path for a repo (cross-node
	// creates need a shared clone when no primary workspace exists).
	EnsureSharedRepoClone(ctx context.Context, repoKey string, repoURL string) (string, error)
}

// WorkspaceRecords owns workspace record persistence: the cloud API record and
// the local SQLite row. Cloud writes are best-effort (failures are logged by
// the implementation and the local record stays authoritative).
type WorkspaceRecords interface {
	// CreateRemoteRecord writes the cloud record (provisioning) before the
	// worktree is provisioned.
	CreateRemoteRecord(ctx context.Context, registration Registration)
	// UpdateRemoteRecord records the final worktree path (provisioning → active).
	UpdateRemoteRecord(ctx context.Context, registration Registration, localPath string)
	// CloseRemoteRecord marks the cloud record closing/closed (best-effort).
	CloseRemoteRecord(ctx context.Context, organizationID string, projectID string, workspaceID string, status workspace.Status)
	// PersistPrepared writes the local SQLite row (provisioning) for a local
	// create. Remote-target creates skip it (the executor writes its own row).
	PersistPrepared(ctx context.Context, plan CreatePlan) error
	// FinalizePersisted flips the local row to active with the worktree path.
	FinalizePersisted(ctx context.Context, plan CreatePlan, created workspace.Workspace) error
	// ClosePersisted flips the local row to closed (tolerates a missing row:
	// relayed creates leave no row on the origin).
	ClosePersisted(ctx context.Context, workspaceID string) error
	// LocalRow returns the local SQLite row for a workspace as a domain record.
	LocalRow(ctx context.Context, workspaceID string) (workspace.Record, bool)
}

// Instances owns the runtime instances of open workspaces (the manager today,
// the instance registry in Phase 3).
type Instances interface {
	CreateWorkspaceWithProgress(ctx context.Context, req workspace.CreateRequest, report workspace.CreateProgressReporter) (workspace.Workspace, error)
	StopWorkspaceTerminals(workspaceID string) []string
	CloseWorkspace(ctx context.Context, req workspace.CloseRequest) (workspace.CloseResult, error)
	CloseWorkspacePath(ctx context.Context, req workspace.ClosePathRequest) (workspace.CloseResult, error)
	SetState(workspaceID string, state instance.State, health instance.Health) error
	Get(workspaceID string) (workspace.Workspace, error)
	RemoveFromMemory(workspaceID string)
	// WatchAndTrack registers the filesystem watcher and PR tracker for an
	// open workspace; Unwatch and StopTracking remove them independently
	// (the create-rollback cleanup mirrors createflow's split hooks).
	WatchAndTrack(ws workspace.Workspace) error
	Unwatch(path string)
	StopTracking(workspaceID string)
}

// Relay delivers workspace create/close envelopes to the relay.
type Relay interface {
	// DispatchCreate sends a workspace.create.request envelope and waits for
	// the routing verdict (rejected when the target node is offline).
	DispatchCreate(ctx context.Context, plan CreatePlan, command CreateCommand) error
	// DispatchClose sends a workspace.close.request envelope to the owner node.
	DispatchClose(ctx context.Context, command CloseCommand, targetNodeID string) error
}

// Events publishes frontend events and relays create progress/completion back
// to the origin node. The CreateCompleted implementation stays daemon-side
// because task-run start needs the agent manager and desktop connection state.
type Events interface {
	Publish(topic string, payload any)
	SnapshotChanged(organizationID string, projectID string, workspaceID string, change string)
	CreateStarted(event StartedEvent)
	CreateProgress(plan CreatePlan, event workspace.CreateProgressEvent)
	CreateFailed(plan CreatePlan, failed FailedEvent)
	CreateCompleted(plan CreatePlan, created workspace.Workspace, warnings []any)
}

// Dependencies wires the Service. The function hooks are the daemon-side side
// effects of close/rollback (pending cleanup store, token-usage sync, agent
// summarization, hook warnings) that have no domain shape yet.
type Dependencies struct {
	NodeID string
	Now    func() string

	Environment Environment
	Records     WorkspaceRecords
	Instances   Instances
	Relay       Relay
	Events      Events

	// WorkspaceAvailabilityChanged notifies consumers only after a newly
	// created workspace is both registered and successfully persisted.
	WorkspaceAvailabilityChanged func()

	// HookWarnings builds the lifecycle-script warnings for the completed
	// event (daemon-side: needs the daemon log path).
	HookWarnings func(setupHook string, result *workspace.HookResult) []any

	// Agent cleanup is an opaque three-phase lifecycle supplied by the node agent
	// service. Keeping the handle untyped avoids an application → node package
	// dependency cycle.
	BeginAgentCleanup  func(ctx context.Context, workspaceID string) (any, error)
	AbortAgentCleanup  func(handle any)
	CommitAgentCleanup func(handle any)

	// Close / rollback side effects (daemon infrastructure).
	SyncUsage          func(source string)
	RegisterCleanup    func(req CleanupRequest) error
	RemoveCleanup      func(workspaceID string) error
	MarkCleanupFailure func(workspaceID string, cleanupErr error) error
	ClaimAgentSummary  func(workspaceID string) (bool, error)
	SummarizeAgents    func(workspaceID string, req workspace.CloseRequest)
	ClearAgentUsage    func(workspaceID string)
	Warn               func(workspaceID string, path string, message string, err error)
}
