package instance

import "fmt"

// Transition validates and applies a runtime state change, returning the new
// state. Idempotent self-transitions are allowed. Any transition from an
// unknown/empty state or to an unknown/empty state is rejected so callers
// cannot manufacture states that the rest of the daemon does not understand.
//
// Valid matrix (mirrors today's manager.SetWorkspaceState call sites):
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
