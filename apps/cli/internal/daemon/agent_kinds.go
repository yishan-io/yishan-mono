package daemon

import "slices"

// allAgentKinds is the canonical list of supported AI agent kinds.
// Must stay in sync with packages/core/src/agentKinds.ts AGENT_KINDS.
var allAgentKinds = []string{"opencode", "codex", "claude", "gemini", "pi", "copilot", "cursor"}

// agentKindsWithTokenTracking lists agents that have token tracking (even if stub scanners).
var agentKindsWithTokenTracking = []string{"opencode", "codex", "claude", "gemini", "pi"}

// agentKindsWithActiveTokenScanners lists agents whose scanners produce actual token data.
var agentKindsWithActiveTokenScanners = []string{"opencode", "codex", "claude"}

func isKnownAgentKind(kind string) bool {
	return slices.Contains(allAgentKinds, kind)
}

func isTokenTrackingAgentKind(kind string) bool {
	return slices.Contains(agentKindsWithTokenTracking, kind)
}
