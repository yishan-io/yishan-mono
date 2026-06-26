package tokenusage

import "time"

const HourlyUsageLocalRetentionWindow = 15 * 24 * time.Hour

type AttributionConfidence string

const (
	AttributionExact           AttributionConfidence = "exact"
	AttributionPrefixMatch     AttributionConfidence = "prefix_match"
	AttributionFallbackUnknown AttributionConfidence = "fallback_unknown"
)

type ScannerSourceKind string

const (
	SourceKindJSONL  ScannerSourceKind = "jsonl"
	SourceKindSQLite ScannerSourceKind = "sqlite"
	SourceKindAPI    ScannerSourceKind = "api"
)

type HourlyUsageRow struct {
	ProjectID             string
	WorkspaceID           string
	WorkspacePath         string
	AgentKind             string
	Model                 string
	ModelNormalized       string
	BucketStartHourUTC    int64
	InputTokens           int64
	OutputTokens          int64
	CachedInputTokens     int64
	CachedWriteTokens     int64
	ReasoningTokens       int64
	TotalTokens           int64
	EventCount            int64
	SessionCount          int64
	TurnCount             int64
	ToolCallCount         int64
	AttributionConfidence AttributionConfidence
	ScannerSourceKind     ScannerSourceKind
	ScannerSourceID       string
	IngestedAt            int64
	RunID                 string
	UpdatedAt             int64
	Dirty                 bool
	LastSyncedAt          int64
}

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
