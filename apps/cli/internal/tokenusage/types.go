package tokenusage

import localdb "yishan/apps/cli/internal/db"

// Re-exported from db so scanner and collector code references are unchanged.
type HourlyUsageRow = localdb.HourlyUsageRow
type HourlyUsageSyncState = localdb.HourlyUsageSyncState
type AttributionConfidence = localdb.AttributionConfidence
type ScannerSourceKind = localdb.ScannerSourceKind
type CostSource = localdb.CostSource

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

const (
	CostSourceUnknown   CostSource = localdb.CostSourceUnknown
	CostSourceEstimated CostSource = localdb.CostSourceEstimated
	CostSourceDirect    CostSource = localdb.CostSourceDirect
)

type WorktreeRef struct {
	ProjectID     string
	WorkspaceID   string
	WorkspacePath string
}

type ScanInput struct {
	RunID               string
	IngestedAt          int64
	ScanSinceUnixMilli  int64
	Worktrees           []WorktreeRef
	SessionRoot         string
	ModelPricingCatalog *modelPricingCatalog
}
