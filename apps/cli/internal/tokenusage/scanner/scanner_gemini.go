package scanner

import (
	"context"

	agentkind "yishan/apps/cli/internal/agent/kind"
	"yishan/apps/cli/internal/tokenusage/record"
)

const geminiAgentKind = agentkind.Gemini

// ScanGeminiHourlyUsage returns Gemini hourly usage rows.
//
// Current behavior: no stable local token source is integrated yet, so this
// scanner returns an empty result set.
func ScanGeminiHourlyUsage(_ context.Context, _ ScanInput) ([]record.UsageRecord, error) {
	return []record.UsageRecord{}, nil
}
