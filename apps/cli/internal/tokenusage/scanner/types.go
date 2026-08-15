package scanner

import (
	"yishan/apps/cli/internal/tokenusage/pricing"
	"yishan/apps/cli/internal/tokenusage/record"
)

// ScanInput is the input bundle every provider scanner receives: the scan
// window, the open workspaces the events can be attributed to, the session
// root, and the pricing catalog for estimated costs.
type ScanInput struct {
	RunID              string
	IngestedAt         int64
	ScanSinceUnixMilli int64
	Worktrees          []record.WorktreeRef
	SessionRoot        string
	Catalog            pricing.Catalog
}
