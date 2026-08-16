// Package workspace is the Node application service for the workspace.*,
// file.*, and git.* RPC namespaces: workspace lifecycle application
// operations and the workspace-scoped file and git capability operations.
// It receives a small dependency set and never imports the composition root
// or the daemon.
package workspace

import (
	"yishan/apps/cli/internal/files"
	"yishan/apps/cli/internal/git"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/terminal"
	"yishan/apps/cli/internal/workspace/instance"
)

// Deps are the explicit dependencies of the workspace application service.
type Deps struct {
	Registry  *instance.Registry
	Files     *files.FileService
	Git       *git.GitService
	Terminals *terminal.Manager
}

// Service implements the workspace.*, file.*, and git.* RPC namespaces. Each
// method is named after the wire method tail; the service type already
// carries the namespace.
type Service struct {
	deps Deps

	// router is the namespace routing table for tests (callRPCForTest routes
	// through the same path rpc.Server uses for live connections). Production
	// composes the router in internal/app and leaves this nil.
	router *rpc.Router
}

// NewService builds the workspace application service.
func NewService(deps Deps) *Service {
	return &Service{deps: deps}
}
