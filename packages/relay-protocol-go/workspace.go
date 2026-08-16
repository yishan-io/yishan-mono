package relayprotocol

// WorkspaceSnapshotChangedParams is the routing header the relay reads from
// workspace.snapshot.changed params. The full payload is the CLI's workspace
// create/close envelope; the relay parses only these three fields for
// routing and forwards the rest opaquely.
type WorkspaceSnapshotChangedParams struct {
	OrganizationID string `json:"organizationId"`
	SourceNodeID   string `json:"sourceNodeId"`
	TargetNodeID   string `json:"targetNodeId"`
}

// DispatchVerdict is the relay's routing answer for a targeted workspace
// create/close envelope sent as a JSON-RPC request. Accepted means the target
// was online at verdict time; TargetOnline is reported when accepted.
type DispatchVerdict struct {
	Accepted     bool   `json:"accepted"`
	TargetOnline bool   `json:"targetOnline,omitempty"`
	Reason       string `json:"reason,omitempty"`
}
