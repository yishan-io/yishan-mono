// Package instance owns the runtime state of open workspaces on this node:
// the instance registry (map + state/health mutation + path lookup) and the
// workspace-scoped handle. A workspace instance exists only while the
// workspace is open; closing a workspace removes the instance from the
// registry (there is deliberately no "closed" runtime state — closed
// workspaces are records, not instances).
//
// State and Health are aliases of the workspace-package types: the workspace
// record carries them, and the workspace package cannot import instance.
package instance

import "yishan/apps/cli/internal/workspace"

// State is the runtime state of an open workspace instance.
type State = workspace.State

// State values (aliases so application code reads instance.StateActive).
const (
	StateActive  = workspace.StateActive
	StateClosing = workspace.StateClosing
	StateError   = workspace.StateError
)

// Health is the health detail of an instance. The empty value means healthy.
type Health = workspace.Health

// Health values (aliases so application code reads instance.HealthPathMissing).
const (
	HealthOK          = workspace.HealthOK
	HealthPathMissing = workspace.HealthPathMissing
	HealthNotWorktree = workspace.HealthNotWorktree
)
