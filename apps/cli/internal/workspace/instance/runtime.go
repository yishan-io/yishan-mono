// Package instance owns the runtime representation of an open workspace on
// this node: its local path, runtime state, and health. A workspace instance
// exists only while the workspace is open; closing a workspace removes the
// instance from the registry (there is deliberately no "closed" runtime
// state — closed workspaces are records, not instances).
package instance

import "yishan/apps/cli/internal/workspace"

// State is the runtime state of an open workspace instance.
type State string

const (
	// StateActive is the normal running state.
	StateActive State = "active"
	// StateClosing marks a workspace whose close/teardown is in flight.
	// A failed teardown leaves the instance in this state.
	StateClosing State = "closing"
	// StateError marks a workspace whose worktree is unusable (missing path,
	// not a worktree); the UI offers close-only for it.
	StateError State = "error"
)

// Health is the health detail of an instance. The empty value means healthy.
type Health string

const (
	// HealthOK means the instance is healthy (no detail).
	HealthOK Health = ""
	// HealthPathMissing means the worktree path does not exist.
	HealthPathMissing Health = "path-missing"
	// HealthNotWorktree means the path exists but is not a git worktree.
	HealthNotWorktree Health = "not-worktree"
)

// Runtime is the runtime record for one open workspace instance.
type Runtime struct {
	WorkspaceID workspace.ID
	LocalPath   string
	State       State
	Health      Health
}
