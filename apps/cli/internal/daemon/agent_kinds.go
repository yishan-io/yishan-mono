package daemon

import (
	"slices"

	"yishan/apps/cli/internal/agentkind"
)

func isKnownAgentKind(kind string) bool {
	return slices.Contains(agentkind.All, kind)
}

func isTokenTrackingAgentKind(kind string) bool {
	return slices.Contains(agentkind.WithTokenTracking, kind)
}
