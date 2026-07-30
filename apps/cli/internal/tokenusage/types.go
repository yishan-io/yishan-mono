package tokenusage

import localdb "yishan/apps/cli/internal/db"

// Re-exported from db so scanner and collector code references are unchanged.
type HourlyUsageRow = localdb.HourlyUsageRow
type HourlyUsageSyncState = localdb.HourlyUsageSyncState
type AttributionConfidence = localdb.AttributionConfidence
type ScannerSourceKind = localdb.ScannerSourceKind

// HourlyUsageLocalRetentionWindow aliases the db-owned retention window.
const HourlyUsageLocalRetentionWindow = localdb.HourlyUsageRetentionWindow

const (
	AttributionExact           AttributionConfidence = "exact"
	AttributionPrefixMatch     AttributionConfidence = "prefix_match"
	AttributionFallbackUnknown AttributionConfidence = "fallback_unknown"
)

const (
	SourceKindJSONL  ScannerSourceKind = "jsonl"
	SourceKindSQLite ScannerSourceKind = "sqlite"
	SourceKindAPI    ScannerSourceKind = "api"
)

type WorktreeRef struct {
	ProjectID     string
	WorkspaceID   string
	WorkspacePath string
}

type ScanInput struct {
	RunID              string
	IngestedAt         int64
	ScanSinceUnixMilli int64
	Worktrees          []WorktreeRef
	SessionRoot        string
}
