package tokenusage

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
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

func TestLiveDBScanCurrentWorkspaceActivityCounts(t *testing.T) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		t.Skip("cannot resolve home dir:", err)
	}
	dbPath := filepath.Join(homeDir, ".local", "share", "opencode", "opencode.db")
	if _, err := os.Stat(dbPath); os.IsNotExist(err) {
		t.Skip("opencode db not present")
	}

	cwd, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	repoRoot := filepath.Clean(filepath.Join(cwd, "../../../.."))
	scanSince := time.Now().Add(-24 * time.Hour).UnixMilli()
	input := ScanInput{
		RunID:              "live-activity-counts",
		IngestedAt:         time.Now().UnixMilli(),
		ScanSinceUnixMilli: scanSince,
		Worktrees: []WorktreeRef{{
			ProjectID:     "proj-live",
			WorkspaceID:   "ws-live",
			WorkspacePath: repoRoot,
		}},
	}

	rows, err := ScanOpenCodeHourlyUsage(context.Background(), input)
	if err != nil {
		t.Fatalf("ScanOpenCodeHourlyUsage: %v", err)
	}

	var turnCount int64
	var toolCallCount int64
	for _, row := range rows {
		if normalizeComparablePath(row.WorkspacePath) != normalizeComparablePath(repoRoot) {
			continue
		}
		turnCount += row.TurnCount
		toolCallCount += row.ToolCallCount
	}
	if turnCount == 0 && toolCallCount == 0 {
		t.Skipf("no recent opencode activity matched workspace %s in last 24h", repoRoot)
	}

	pathFilter := buildLiveOpenCodePathFilter(repoRoot)
	tokenPositiveFilter := strings.Join([]string{
		"(",
		"COALESCE(json_extract(m.data, '$.tokens.input'), 0) +",
		"COALESCE(json_extract(m.data, '$.tokens.output'), 0) +",
		"COALESCE(json_extract(m.data, '$.tokens.reasoning'), 0) +",
		"COALESCE(json_extract(m.data, '$.tokens.cache.read'), 0) +",
		"COALESCE(json_extract(m.data, '$.tokens.cache.write'), 0)",
		") > 0",
	}, " ")
	query := strings.Join([]string{
		"SELECT",
		"  (",
		"    SELECT COUNT(DISTINCT m.id)",
		"    FROM message m",
		"    JOIN session s ON s.id = m.session_id",
		"    LEFT JOIN workspace w ON w.id = s.workspace_id",
		"    LEFT JOIN project p ON p.id = s.project_id",
		"    JOIN part pt ON pt.message_id = m.id AND pt.session_id = m.session_id",
		"    WHERE json_extract(m.data, '$.role') = 'user'",
		fmt.Sprintf("      AND m.time_created >= %d", scanSince),
		"      AND json_extract(pt.data, '$.type') = 'text'",
		"      AND " + pathFilter,
		"  ) AS turn_count,",
		"  (",
		"    SELECT COUNT(*)",
		"    FROM part pt",
		"    JOIN message m ON m.id = pt.message_id",
		"    JOIN session s ON s.id = m.session_id",
		"    LEFT JOIN workspace w ON w.id = s.workspace_id",
		"    LEFT JOIN project p ON p.id = s.project_id",
		"    WHERE json_extract(m.data, '$.role') = 'assistant'",
		fmt.Sprintf("      AND m.time_created >= %d", scanSince),
		"      AND json_extract(pt.data, '$.type') = 'tool'",
		"      AND " + tokenPositiveFilter,
		"      AND " + pathFilter,
		"  ) AS tool_call_count",
	}, " ")

	counts, err := queryLiveOpenCodeCounts(dbPath, query)
	if err != nil {
		t.Fatalf("query live open code counts: %v", err)
	}

	t.Logf("workspace: %s", repoRoot)
	t.Logf("scanner counts: turns=%d tools=%d", turnCount, toolCallCount)
	t.Logf("sql counts: turns=%d tools=%d", counts.TurnCount, counts.ToolCallCount)

	if turnCount != counts.TurnCount {
		t.Fatalf("turn count mismatch: scanner=%d sql=%d", turnCount, counts.TurnCount)
	}
	if toolCallCount != counts.ToolCallCount {
		t.Fatalf("tool call count mismatch: scanner=%d sql=%d", toolCallCount, counts.ToolCallCount)
	}
}

func buildLiveOpenCodePathFilter(workspacePath string) string {
	escapedPath := strings.ReplaceAll(workspacePath, "'", "''")
	likeValue := escapedPath + "%"
	return strings.Join([]string{
		"(",
		fmt.Sprintf("COALESCE(s.directory, '') LIKE '%s'", likeValue),
		"OR",
		fmt.Sprintf("COALESCE(w.directory, '') LIKE '%s'", likeValue),
		"OR",
		fmt.Sprintf("COALESCE(p.worktree, '') LIKE '%s'", likeValue),
		")",
	}, " ")
}

func queryLiveOpenCodeCounts(dbPath string, query string) (struct {
	TurnCount     int64 `json:"turn_count"`
	ToolCallCount int64 `json:"tool_call_count"`
}, error) {
	cmd := exec.Command("sqlite3", "-json", dbPath, query)
	rawOutput, err := cmd.Output()
	if err != nil {
		return struct {
			TurnCount     int64 `json:"turn_count"`
			ToolCallCount int64 `json:"tool_call_count"`
		}{}, err
	}
	var rows []struct {
		TurnCount     int64 `json:"turn_count"`
		ToolCallCount int64 `json:"tool_call_count"`
	}
	if err := json.Unmarshal(rawOutput, &rows); err != nil {
		return struct {
			TurnCount     int64 `json:"turn_count"`
			ToolCallCount int64 `json:"tool_call_count"`
		}{}, err
	}
	if len(rows) == 0 {
		return struct {
			TurnCount     int64 `json:"turn_count"`
			ToolCallCount int64 `json:"tool_call_count"`
		}{}, nil
	}
	return rows[0], nil
}
