package daemon

import (
	"slices"

	"yishan/apps/cli/internal/agentkind"
)

// allAgentKinds is the canonical list of supported AI agent kinds.
// Must stay in sync with packages/core/src/agentKinds.ts AGENT_KINDS.
var allAgentKinds = agentkind.All

// agentKindsWithTokenTracking lists agents that have token tracking (even if stub scanners).
var agentKindsWithTokenTracking = agentkind.WithTokenTracking

// agentKindsWithActiveTokenScanners lists agents whose scanners produce actual token data.
var agentKindsWithActiveTokenScanners = agentkind.WithActiveTokenScanners

func isKnownAgentKind(kind string) bool {
	return slices.Contains(allAgentKinds, kind)
}

func isTokenTrackingAgentKind(kind string) bool {
	return slices.Contains(agentKindsWithTokenTracking, kind)
}
