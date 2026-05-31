package tokenusage

import "context"

type HourlyUsageRepository interface {
	ReplaceAgentHourlyRows(ctx context.Context, agentKind string, rows []HourlyUsageRow) error
}
