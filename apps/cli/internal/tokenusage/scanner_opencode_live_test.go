package tokenusage

import (
	"context"
	"fmt"
	"os"
	"sort"
	"strings"
	"testing"
	"time"
)

// TestLiveDBScanSkillManager exercises the new message-level scanner against
// the real OpenCode database and checks totals against ground truth from a
// direct SQL query.
//
// Run with: go test ./internal/tokenusage/... -run TestLiveDBScanSkillManager -v
//
// Skipped automatically when the live DB is not present.
func TestLiveDBScanSkillManager(t *testing.T) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		t.Skip("cannot resolve home dir:", err)
	}
	dbDir := homeDir + "/.local/share/opencode"
	if _, err := os.Stat(dbDir); os.IsNotExist(err) {
		t.Skip("opencode data dir not present")
	}

	input := ScanInput{
		RunID:              "live-verify",
		IngestedAt:         time.Now().UnixMilli(),
		ScanSinceUnixMilli: 0, // full scan
		Worktrees: []WorktreeRef{
			{
				ProjectID:     "proj-skill-manager",
				WorkspaceID:   "ws-skill-manager",
				WorkspacePath: homeDir + "/.yishan/worktrees/yishan-io/yishan-mono/skill-manager",
			},
		},
	}

	rows, err := ScanOpenCodeHourlyUsage(context.Background(), input)
	if err != nil {
		t.Fatalf("ScanOpenCodeHourlyUsage: %v", err)
	}

	var skillRows []HourlyUsageRow
	for _, r := range rows {
		if strings.Contains(r.WorkspacePath, "skill-manager") {
			skillRows = append(skillRows, r)
		}
	}
	sort.Slice(skillRows, func(i, j int) bool {
		return skillRows[i].BucketStartHourUTC < skillRows[j].BucketStartHourUTC
	})

	t.Logf("%-30s  %12s  %12s  %12s  %12s", "bucket", "total", "cache_read", "input", "output")
	t.Logf("%s", strings.Repeat("-", 84))
	var grandTotal int64
	for _, r := range skillRows {
		bucket := time.UnixMilli(r.BucketStartHourUTC).UTC().Format("2006-01-02T15:04:05Z")
		t.Logf("%-30s  %12d  %12d  %12d  %12d",
			bucket, r.TotalTokens, r.CachedInputTokens, r.InputTokens, r.OutputTokens)
		grandTotal += r.TotalTokens
	}
	t.Logf("%s", strings.Repeat("-", 84))
	t.Logf("%-30s  %12d", "TOTAL", grandTotal)
	t.Logf("Rows returned: %d", len(skillRows))

	if len(skillRows) == 0 {
		t.Skip("live skill-manager workspace rows not present in local opencode data")
	}

	// Ground truth from direct SQL (computed during investigation):
	//   SELECT SUM(input+cache_read+cache_write+output+reasoning)
	//   FROM message JOIN session WHERE directory LIKE '%skill-manager%' AND role='assistant'
	//   => 205,506,785
	const wantTotal int64 = 205_506_785
	if grandTotal != wantTotal {
		t.Errorf("total tokens: got %d, want %d (delta %+d)", grandTotal, wantTotal, grandTotal-wantTotal)
	} else {
		t.Logf("MATCH: %s", formatMillions(grandTotal))
	}

	// Verify buckets span June 19 and June 20 (the session crosses midnight).
	var hasJune19, hasJune20 bool
	for _, r := range skillRows {
		b := time.UnixMilli(r.BucketStartHourUTC).UTC()
		if b.Month() == 6 && b.Day() == 19 {
			hasJune19 = true
		}
		if b.Month() == 6 && b.Day() == 20 {
			hasJune20 = true
		}
	}
	if !hasJune19 {
		t.Error("expected at least one bucket on June 19")
	}
	if !hasJune20 {
		t.Error("expected at least one bucket on June 20")
	}
}

func formatMillions(n int64) string {
	return fmt.Sprintf("%.1fM (%d)", float64(n)/1_000_000, n)
}
