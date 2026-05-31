package tokenusage

import "context"

const geminiAgentKind = "gemini"

// ScanGeminiHourlyUsage returns Gemini hourly usage rows.
//
// Current behavior: no stable local token source is integrated yet, so this
// scanner returns an empty result set.
func ScanGeminiHourlyUsage(_ context.Context, _ ScanInput) ([]HourlyUsageRow, error) {
	return []HourlyUsageRow{}, nil
}
