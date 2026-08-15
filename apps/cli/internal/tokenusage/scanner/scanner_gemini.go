package scanner

import (
	"context"

	"yishan/apps/cli/internal/agentkind"
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
