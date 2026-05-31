package tokenusage

import "context"

const piAgentKind = "pi"

// ScanPiHourlyUsage returns Pi hourly usage rows.
//
// Current behavior: no stable local token source is integrated yet, so this
// scanner returns an empty result set.
func ScanPiHourlyUsage(_ context.Context, _ ScanInput) ([]HourlyUsageRow, error) {
	return []HourlyUsageRow{}, nil
}
