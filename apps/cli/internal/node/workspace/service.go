// Package workspace is the Node application service for the workspace.*,
// file.*, and git.* RPC namespaces: workspace lifecycle application
// operations (create/close/folder/health/hydrate/persist/relay/watch) and the
// workspace-scoped file and git capability operations. It receives a small
// dependency set and never imports the composition root or the daemon.
package workspace

import (
	"context"
	"database/sql"

	internalevents "yishan/apps/cli/internal/events"
	"yishan/apps/cli/internal/files"
	"yishan/apps/cli/internal/git"
	"yishan/apps/cli/internal/memory"
	"yishan/apps/cli/internal/node/hook"
	"yishan/apps/cli/internal/relay"
	"yishan/apps/cli/internal/rpc"
	cliruntime "yishan/apps/cli/internal/runtime"
	term "yishan/apps/cli/internal/terminal"
	"yishan/apps/cli/internal/tokenusage"
	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/application"
	"yishan/apps/cli/internal/workspace/instance"
	workspaceprtracker "yishan/apps/cli/internal/workspace/pr"
	workspacewatchers "yishan/apps/cli/internal/workspace/watchers"

	localdb "yishan/apps/cli/internal/db"
)

// Deps are the explicit dependencies of the workspace application service.
type Deps struct {
	Registry  *instance.Registry
	Store     workspace.WorkspaceStore
	Files     *files.FileService
	Git       *git.GitService
	Terminals *term.Manager

	Memory       *memory.Service
	TokenUsage   tokenusage.Service
	Events       *internalevents.Hub
	Watchers     *workspacewatchers.Watchers
	PRTracker    *workspaceprtracker.Tracker
	CleanupStore *localdb.WorkspaceCleanupStore
	Database     *sql.DB
	Runtime      *cliruntime.Runtime
	NodeID       string
	LogFilePath  string

	// CreateCompleted completes a workspace create with its task run (agent
	// chat tab or pi CLI terminal) and publishes the create-completed event;
	// wired by the composition root to the agent application service.
	CreateCompleted func(plan application.CreatePlan, created workspace.Workspace, warnings []any)
	// Usage tracks which agents ran per workspace (close-time summarization);
	// owned by the hook package.
	Usage *hook.UsageTracker

	// ServerCtx is the long-lived context RPC handlers use for server-side
	// work (relayed creates).
	ServerCtx context.Context
}

// Service implements the workspace.*, file.*, and git.* RPC namespaces and
// owns the workspace lifecycle application service (application.Service) and
// the relay client. Each method is named after the wire method tail; the
// service type already carries the namespace. ListWorkspaces keeps its name
// because the bare "list" method is the workspace list.
type Service struct {
	deps Deps

	// app is the application service for workspace create/close orchestration.
	app *application.Service

	// relayClient owns the relay connection state (internal/relay); the
	// composition root attaches it after the relay client is built.
	relayClient *relay.Client

	// router is the namespace routing table for tests (callRPCForTest routes
	// through the same path rpc.Server uses for live connections). Production
	// composes the router in internal/app and leaves this nil.
	router *rpc.Router
}

// NewService builds the workspace application service and wires the
// workspace create/close application service.
func NewService(deps Deps) *Service {
	if deps.ServerCtx == nil {
		deps.ServerCtx = context.Background()
	}
	service := &Service{deps: deps}
	service.app = service.newAppService()
	return service
}

// SetRelayClient attaches the relay client after it is built (needs the rpc
// server). The composition root owns relay enablement.
func (s *Service) SetRelayClient(client *relay.Client) {
	s.relayClient = client
}

// clearAgentUsage drops the recorded agents for a workspace (close-time
// cleanup).
func (s *Service) clearAgentUsage(workspaceID string) {
	s.deps.Usage.Clear(workspaceID)
}

// getAgentUsage returns the agents recorded for a workspace.
func (s *Service) getAgentUsage(workspaceID string) []string {
	return s.deps.Usage.List(workspaceID)
}
