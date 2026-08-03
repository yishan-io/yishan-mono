package db

import "fmt"

func normalizedCostSource(source CostSource) CostSource {
	if source == "" {
		return CostSourceUnknown
	}
	return source
}

func costSourcePriority(source CostSource) int {
	switch normalizedCostSource(source) {
	case CostSourceDirect:
		return 3
	case CostSourceEstimated:
		return 2
	default:
		return 1
	}
}

func shouldPreferExistingCost(existingRow, nextRow HourlyUsageRow) bool {
	existingPriority := costSourcePriority(existingRow.CostSource)
	nextPriority := costSourcePriority(nextRow.CostSource)
	if existingPriority != nextPriority {
		return existingPriority > nextPriority
	}
	if existingRow.TotalCostMicrosUSD == nextRow.TotalCostMicrosUSD {
		return false
	}
	switch normalizedCostSource(existingRow.CostSource) {
	case CostSourceDirect:
		return false
	case CostSourceEstimated:
		return nextRow.TotalCostMicrosUSD == 0 && existingRow.TotalCostMicrosUSD > 0
	default:
		return existingRow.TotalCostMicrosUSD > nextRow.TotalCostMicrosUSD
	}
}

// HourlyUsageRowKey returns the natural composite key for an hourly usage row.
func HourlyUsageRowKey(row HourlyUsageRow) string {
	return row.ProjectID + "\x00" + row.WorkspaceID + "\x00" + row.AgentKind + "\x00" + row.ModelNormalized + "\x00" + fmt.Sprintf("%d", row.BucketStartHourUTC)
}

// MergeHourlyUsageRow merges a scanned row into an existing row, preserving higher
// token totals and sync metadata.
func MergeHourlyUsageRow(existingRow HourlyUsageRow, hasExisting bool, scannedRow HourlyUsageRow) HourlyUsageRow {
	if !hasExisting {
		scannedRow.Dirty = true
		return scannedRow
	}
	if existingRow.TotalTokens > scannedRow.TotalTokens || HourlyRowsMatchForSync(existingRow, scannedRow) {
		return existingRow
	}
	if existingRow.TotalTokens == scannedRow.TotalTokens && shouldPreferExistingCost(existingRow, scannedRow) {
		return existingRow
	}
	scannedRow.Dirty = true
	scannedRow.LastSyncedAt = existingRow.LastSyncedAt
	return scannedRow
}

// HourlyRowsMatchForSync returns true when two rows carry the same observable token state.
// MergeImportedHourlyUsageRow merges one remote-imported row into existing local state.
func MergeImportedHourlyUsageRow(existingRow HourlyUsageRow, hasExisting bool, importedRow HourlyUsageRow) HourlyUsageRow {
	if !hasExisting {
		return importedRow
	}
	if existingRow.Dirty {
		return existingRow
	}
	if existingRow.TotalTokens > importedRow.TotalTokens || HourlyRowsMatchForSync(existingRow, importedRow) {
		return existingRow
	}
	if existingRow.TotalTokens == importedRow.TotalTokens && shouldPreferExistingCost(existingRow, importedRow) {
		return existingRow
	}
	importedRow.LastSyncedAt = existingRow.LastSyncedAt
	return importedRow
}

func HourlyRowsMatchForSync(left, right HourlyUsageRow) bool {
	return left.ProjectID == right.ProjectID &&
		left.WorkspaceID == right.WorkspaceID &&
		left.WorkspacePath == right.WorkspacePath &&
		left.AgentKind == right.AgentKind &&
		left.Model == right.Model &&
		left.ModelNormalized == right.ModelNormalized &&
		left.BucketStartHourUTC == right.BucketStartHourUTC &&
		left.InputTokens == right.InputTokens &&
		left.OutputTokens == right.OutputTokens &&
		left.CachedInputTokens == right.CachedInputTokens &&
		left.CachedWriteTokens == right.CachedWriteTokens &&
		left.ReasoningTokens == right.ReasoningTokens &&
		left.TotalTokens == right.TotalTokens &&
		left.TotalCostMicrosUSD == right.TotalCostMicrosUSD &&
		normalizedCostSource(left.CostSource) == normalizedCostSource(right.CostSource) &&
		left.EventCount == right.EventCount &&
		left.SessionCount == right.SessionCount &&
		left.TurnCount == right.TurnCount &&
		left.ToolCallCount == right.ToolCallCount &&
		left.AttributionConfidence == right.AttributionConfidence
}

// CompareHourlyUsageRows orders rows by bucket time then composite key.
func CompareHourlyUsageRows(left, right HourlyUsageRow) int {
	if left.BucketStartHourUTC != right.BucketStartHourUTC {
		if left.BucketStartHourUTC < right.BucketStartHourUTC {
			return -1
		}
		return 1
	}
	leftKey, rightKey := HourlyUsageRowKey(left), HourlyUsageRowKey(right)
	if leftKey < rightKey {
		return -1
	}
	if leftKey > rightKey {
		return 1
	}
	return 0
}
