package dsh

import "errors"

type sessionLineageWireEntry struct {
	SessionID       string                   `json:"sessionId"`
	ParentSessionID string                   `json:"parentSessionId"`
	Origin          string                   `json:"origin"`
	DelegationDepth *int64                   `json:"delegationDepth"`
	RelativeDepth   *int64                   `json:"relativeDepth"`
	Live            *bool                    `json:"live"`
	Persisted       *bool                    `json:"persisted"`
	Activity        *string                  `json:"activity,omitempty"`
	Mode            *SessionLineageChildMode `json:"mode,omitempty"`
	Label           *string                  `json:"label,omitempty"`
}

type sessionLineageWireResult struct {
	RootSessionID string                    `json:"rootSessionId"`
	Mode          SessionLineageMode        `json:"mode"`
	Children      []sessionLineageWireEntry `json:"children"`
}

func (response sessionLineageWireResult) validate(request SessionLineageRequest) (SessionLineageResult, error) {
	if response.RootSessionID != request.RootSessionID || response.Mode != request.Mode || response.Children == nil {
		return SessionLineageResult{}, errors.New("invalid DSH session lineage response")
	}
	children := make([]SessionLineageEntry, 0, len(response.Children))
	ids := make(map[string]struct{}, len(response.Children))
	for _, entry := range response.Children {
		child, err := entry.validate()
		if err != nil {
			return SessionLineageResult{}, err
		}
		if _, duplicate := ids[child.SessionID]; duplicate {
			return SessionLineageResult{}, errors.New("invalid DSH session lineage response: duplicate sessionId")
		}
		if err := validateLineageResponseEntry(request, child); err != nil {
			return SessionLineageResult{}, err
		}
		ids[child.SessionID] = struct{}{}
		children = append(children, child)
	}
	return SessionLineageResult{RootSessionID: response.RootSessionID, Mode: response.Mode, Children: children}, nil
}

func validateLineageResponseEntry(request SessionLineageRequest, entry SessionLineageEntry) error {
	if request.Mode != SessionLineageChildren {
		return nil
	}
	if entry.ParentSessionID != request.RootSessionID || entry.RelativeDepth != 1 {
		return errors.New("invalid DSH session lineage entry for children mode")
	}
	return nil
}

func (entry sessionLineageWireEntry) validate() (SessionLineageEntry, error) {
	if entry.SessionID == "" || entry.ParentSessionID == "" || entry.ParentSessionID == entry.SessionID || entry.Origin != "subagent" {
		return SessionLineageEntry{}, errors.New("invalid DSH session lineage entry")
	}
	if entry.DelegationDepth == nil || *entry.DelegationDepth < 0 || entry.RelativeDepth == nil || *entry.RelativeDepth < 1 || entry.Live == nil || entry.Persisted == nil {
		return SessionLineageEntry{}, errors.New("invalid DSH session lineage entry")
	}
	if entry.Activity != nil && *entry.Activity != string(SessionLineageRunning) && *entry.Activity != string(SessionLineageInactive) {
		return SessionLineageEntry{}, errors.New("invalid DSH session lineage entry")
	}
	if entry.Mode != nil && *entry.Mode != SessionLineageChildOneShot && *entry.Mode != SessionLineageChildContinuable {
		return SessionLineageEntry{}, errors.New("invalid DSH session lineage entry")
	}
	return SessionLineageEntry{SessionID: entry.SessionID, ParentSessionID: entry.ParentSessionID, Origin: SessionLineageOrigin(entry.Origin), DelegationDepth: *entry.DelegationDepth, RelativeDepth: *entry.RelativeDepth, Live: *entry.Live, Persisted: *entry.Persisted, Activity: optionalActivity(entry.Activity), Mode: optionalMode(entry.Mode), Label: optionalString(entry.Label)}, nil
}

func optionalString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func optionalActivity(value *string) SessionLineageActivity {
	if value == nil {
		return ""
	}
	return SessionLineageActivity(*value)
}

func optionalMode(value *SessionLineageChildMode) SessionLineageChildMode {
	if value == nil {
		return ""
	}
	return *value
}
