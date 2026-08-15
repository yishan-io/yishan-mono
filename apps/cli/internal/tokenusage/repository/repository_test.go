package repository

import (
	"testing"

	"yishan/apps/cli/internal/tokenusage/record"
)

// TestToHourlyRows_RoundTrip ensures the scanner record → SQLite row
// conversion is 1:1 across all fields (the collection layer persists the
// normalized records; the db layer never sees the scanner types).
func TestToHourlyRows_RoundTrip(t *testing.T) {
	records := []record.UsageRecord{
		{
			ProjectID: "proj-1", WorkspaceID: "ws-1", WorkspacePath: "/work/ws-1",
			OrganizationID: "org-1", AgentKind: "codex", Model: "gpt-4o", ModelNormalized: "gpt-4o",
			BucketStartHourUTC: 1751500800000,
			InputTokens: 100, OutputTokens: 50, CachedInputTokens: 20, CachedWriteTokens: 5,
			ReasoningTokens: 10, TotalTokens: 185, TotalCostMicrosUSD: 1234,
			CostSource: record.CostSourceEstimated, EventCount: 2, SessionCount: 1,
			TurnCount: 3, ToolCallCount: 4,
			AttributionConfidence: record.AttributionExact,
			ScannerSourceKind:     record.SourceKindJSONL, ScannerSourceID: "/sessions/s.jsonl",
			IngestedAt: 1751500900000, RunID: "daemon-codex", UpdatedAt: 1751500900000,
			Dirty: true, LastSyncedAt: 1751501000000,
		},
	}

	rows := ToHourlyRows(records)
	if len(rows) != 1 {
		t.Fatalf("expected 1 row, got %d", len(rows))
	}
	row := rows[0]
	if row.ProjectID != "proj-1" || row.WorkspaceID != "ws-1" || row.WorkspacePath != "/work/ws-1" ||
		row.OrganizationID != "org-1" || row.AgentKind != "codex" || row.Model != "gpt-4o" ||
		row.BucketStartHourUTC != 1751500800000 || row.InputTokens != 100 ||
		row.TotalCostMicrosUSD != 1234 || string(row.CostSource) != string(record.CostSourceEstimated) ||
		row.EventCount != 2 || row.SessionCount != 1 || row.TurnCount != 3 || row.ToolCallCount != 4 ||
		string(row.AttributionConfidence) != string(record.AttributionExact) ||
		string(row.ScannerSourceKind) != string(record.SourceKindJSONL) ||
		row.ScannerSourceID != "/sessions/s.jsonl" || row.RunID != "daemon-codex" ||
		row.Dirty != true || row.LastSyncedAt != 1751501000000 {
		t.Fatalf("unexpected row conversion: %+v", row)
	}
}
