package db

import "time"

// AttributionConfidence records how confidently a scanned usage row was associated with a workspace.
type AttributionConfidence string

// ScannerSourceKind identifies the scanner's source format.
type ScannerSourceKind string

// CostSource identifies whether a row's cost was direct, estimated, or unknown.
type CostSource string

// HourlyUsageRetentionWindow is how long clean hourly usage rows are retained locally.
const HourlyUsageRetentionWindow = 90 * 24 * time.Hour

const (
	CostSourceUnknown   CostSource = "unknown"
	CostSourceEstimated CostSource = "estimated"
	CostSourceDirect    CostSource = "direct"
)

// HourlyUsageRow is one token-usage aggregate for a workspace, model, agent, and UTC hour.
type HourlyUsageRow struct {
	ProjectID             string
	WorkspaceID           string
	WorkspacePath         string
	OrganizationID        string
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
	TotalCostMicrosUSD    int64
	CostSource            CostSource
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

// HourlyUsageSyncState summarizes durable hourly-usage synchronization state.
type HourlyUsageSyncState struct {
	TotalRows            int
	DirtyRows            int
	LastSuccessfulSyncAt int64
}
