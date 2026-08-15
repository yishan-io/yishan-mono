package workspace

import "fmt"

// State is the runtime state of an open workspace instance. Defined here (not
// in the instance package) because the workspace record carries it and the
// workspace package cannot import instance; instance aliases it so application
// code keeps the instance.State spelling.
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

// Health is the health detail of a workspace instance. The empty value means
// healthy.
type Health string

const (
	// HealthOK means the instance is healthy (no detail).
	HealthOK Health = ""
	// HealthPathMissing means the worktree path does not exist.
	HealthPathMissing Health = "path-missing"
	// HealthNotWorktree means the path exists but is not a git worktree.
	HealthNotWorktree Health = "not-worktree"
)

// Transition validates and applies a runtime state change, returning the new
// state. Idempotent self-transitions are allowed. Any transition from an
// unknown/empty state or to an unknown/empty state is rejected so callers
// cannot manufacture states that the rest of the daemon does not understand.
//
// Valid matrix (mirrors the daemon's state mutation call sites):
//
//	StateActive  → active (idempotent), closing (close), error (health failure)
//	StateError   → error (idempotent), closing (close-only), active (recovery)
//	StateClosing → closing (idempotent), active (aborted teardown), error (health re-check)
//
// There is no closed runtime state: a successfully closed workspace is removed
// from the instance registry entirely.
func (s State) Transition(next State) (State, error) {
	if s == "" || next == "" {
		return s, fmt.Errorf("invalid instance state transition %q → %q: state must not be empty", s, next)
	}
	if s == next {
		return s, nil
	}
	switch s {
	case StateActive:
		if next == StateClosing || next == StateError {
			return next, nil
		}
	case StateError:
		if next == StateActive || next == StateClosing {
			return next, nil
		}
	case StateClosing:
		if next == StateActive || next == StateError {
			return next, nil
		}
	}
	return s, fmt.Errorf("invalid instance state transition %q → %q", s, next)
}
