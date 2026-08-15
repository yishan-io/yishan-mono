package node

import (
	"slices"

	agentkind "yishan/apps/cli/internal/agent/kind"
)

func isKnownAgentKind(kind string) bool {
	return slices.Contains(agentkind.All, kind)
}

func isTokenTrackingAgentKind(kind string) bool {
	return slices.Contains(agentkind.WithTokenTracking, kind)
}
