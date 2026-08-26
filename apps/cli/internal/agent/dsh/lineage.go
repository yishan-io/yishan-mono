package dsh

import (
	"context"
	"errors"
)

const yishanSessionLineageMethod = "yishan.v1.session.lineage"

// SessionLineageMode selects direct children or the complete descendant tree.
type SessionLineageMode string

const (
	SessionLineageChildren    SessionLineageMode = "children"
	SessionLineageDescendants SessionLineageMode = "descendants"
)

// SessionLineageChildMode selects whether a child session can be continued.
type SessionLineageChildMode string

const (
	SessionLineageChildOneShot     SessionLineageChildMode = "one-shot"
	SessionLineageChildContinuable SessionLineageChildMode = "continuable"
)

// SessionLineageOrigin identifies the native DSH origin of a lineage entry.
type SessionLineageOrigin string

const sessionLineageSubagentOrigin SessionLineageOrigin = "subagent"

// SessionLineageActivity reports the public DSH lifecycle state of an entry.
type SessionLineageActivity string

const (
	SessionLineageRunning  SessionLineageActivity = "running"
	SessionLineageInactive SessionLineageActivity = "inactive"
)

// SessionLineageRequest lists DSH-native subagents below one workspace session.
type SessionLineageRequest struct {
	CWD           string             `json:"cwd"`
	RootSessionID string             `json:"rootSessionId"`
	Mode          SessionLineageMode `json:"mode"`
}

// SessionLineageEntry is one DSH-native subagent in a lineage response.
type SessionLineageEntry struct {
	SessionID       string                  `json:"sessionId"`
	ParentSessionID string                  `json:"parentSessionId"`
	Origin          SessionLineageOrigin    `json:"origin"`
	DelegationDepth int64                   `json:"delegationDepth"`
	RelativeDepth   int64                   `json:"relativeDepth"`
	Live            bool                    `json:"live"`
	Persisted       bool                    `json:"persisted"`
	Activity        SessionLineageActivity  `json:"activity,omitempty"`
	Mode            SessionLineageChildMode `json:"mode,omitempty"`
	Label           string                  `json:"label,omitempty"`
}

// SessionLineageResult is the validated lineage for the requested root.
type SessionLineageResult struct {
	RootSessionID string                `json:"rootSessionId"`
	Mode          SessionLineageMode    `json:"mode"`
	Children      []SessionLineageEntry `json:"children"`
}

// ListSessionLineage requests DSH-native subagent lineage for one workspace root.
func (s *Supervisor) ListSessionLineage(ctx context.Context, request SessionLineageRequest) (SessionLineageResult, error) {
	if err := validateSessionLineageRequest(request); err != nil {
		return SessionLineageResult{}, err
	}
	var response sessionLineageWireResult
	if err := s.call(ctx, yishanSessionLineageMethod, request, &response); err != nil {
		return SessionLineageResult{}, err
	}
	return response.validate(request)
}

func validateSessionLineageRequest(request SessionLineageRequest) error {
	if request.CWD == "" || request.RootSessionID == "" {
		return errors.New("DSH session lineage requires cwd and rootSessionId")
	}
	if request.Mode != SessionLineageChildren && request.Mode != SessionLineageDescendants {
		return errors.New("DSH session lineage mode must be children or descendants")
	}
	return nil
}
