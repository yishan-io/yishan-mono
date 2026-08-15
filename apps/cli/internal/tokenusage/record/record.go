// Package record defines the normalized token-usage domain types: the scanner
// output record and the attribution/source vocabulary shared by the scanner,
// attribution, pricing, and collection packages. It is a leaf package — no
// other tokenusage sub-package imports it except as the shared vocabulary.
package record

// UsageRecord is the normalized usage record produced by every provider
// scanner and persisted (via the repository package) as an hourly usage row.
// It mirrors the SQLite row shape so the repository conversion stays 1:1;
// scanners never import the database package.
type UsageRecord struct {
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

// AttributionConfidence is how confidently a usage event was attributed to a
// workspace (exact path match, prefix match, or unknown).
type AttributionConfidence string

const (
	AttributionExact           AttributionConfidence = "exact"
	AttributionPrefixMatch     AttributionConfidence = "prefix_match"
	AttributionFallbackUnknown AttributionConfidence = "fallback_unknown"
)

// ScannerSourceKind is the input format a scanner read.
type ScannerSourceKind string

const (
	SourceKindJSONL  ScannerSourceKind = "jsonl"
	SourceKindSQLite ScannerSourceKind = "sqlite"
	SourceKindAPI    ScannerSourceKind = "api"
)

// CostSource says whether a cost value is direct (reported by the provider) or
// estimated (computed from the pricing catalog).
type CostSource string

const (
	CostSourceUnknown   CostSource = "unknown"
	CostSourceEstimated CostSource = "estimated"
	CostSourceDirect    CostSource = "direct"
)

// WorktreeRef is the workspace identity a usage event is attributed to.
type WorktreeRef struct {
	ProjectID     string
	WorkspaceID   string
	WorkspacePath string
}

// NormalizedCostSource returns the canonical cost source value (empty maps to
// unknown).
func NormalizedCostSource(source CostSource) CostSource {
	if source == "" {
		return CostSourceUnknown
	}
	return source
}

// CostSourcePriority orders cost sources so accumulation keeps the most
// trustworthy value (direct > estimated > unknown).
func CostSourcePriority(source CostSource) int {
	switch NormalizedCostSource(source) {
	case CostSourceDirect:
		return 3
	case CostSourceEstimated:
		return 2
	default:
		return 1
	}
}
