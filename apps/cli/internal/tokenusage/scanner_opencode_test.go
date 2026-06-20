package tokenusage

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

// createOpenCodeTestDB creates a temporary SQLite database with the OpenCode
// schema and inserts the provided sessions and messages. Returns the db path
// and a cleanup function.
func createOpenCodeTestDB(t *testing.T, ddl string) string {
	t.Helper()
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "opencode.db")
	cmd := exec.Command("sqlite3", dbPath, ddl)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("create test db: %v\n%s", err, out)
	}
	return dbPath
}

// openCodeTestSchema is the minimal schema required by queryOpenCodeMessageRows.
const openCodeTestSchema = `
CREATE TABLE session (
  id TEXT PRIMARY KEY,
  workspace_id TEXT,
  project_id TEXT,
  directory TEXT,
  model TEXT,
  time_created INTEGER NOT NULL,
  time_updated INTEGER NOT NULL
);
CREATE TABLE message (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  time_created INTEGER NOT NULL,
  time_updated INTEGER NOT NULL,
  data TEXT NOT NULL
);
CREATE TABLE workspace (id TEXT PRIMARY KEY, directory TEXT);
CREATE TABLE project  (id TEXT PRIMARY KEY, worktree TEXT);
`

// makeMsg builds a JSON data blob for an assistant message with the given
// token counts.
func makeMsg(input, output, cacheRead, cacheWrite, reasoning int64) string {
	return fmt.Sprintf(
		`{"role":"assistant","tokens":{"input":%d,"output":%d,"cache":{"read":%d,"write":%d},"reasoning":%d}}`,
		input, output, cacheRead, cacheWrite, reasoning,
	)
}

// TestScanOpenCodeMessageLevelBuckets verifies that tokens are attributed to
// the hourly bucket of each message's timestamp, not the session creation time.
//
// Setup:
//   - One session created 13 h ago (outside the 2 h scan window).
//   - Three messages:
//     msg1: 13 h ago (outside window) — must be excluded by SQL window clause.
//     msg2: 70 min ago (inside window, hour H-1).
//     msg3: 10 min ago (inside window, hour H or H-1 depending on clock).
//
// Expected results:
//   - msg1 is excluded; only msg2 and msg3 appear.
//   - msg2 and msg3 may land in one or two buckets depending on the clock, but
//     their combined token totals must equal exactly msg2+msg3 counts.
//   - The session count on every returned row is 1 (same session).
func TestScanOpenCodeMessageLevelBuckets(t *testing.T) {
	t.Parallel()

	now := time.Now().UTC()
	sessionCreated := now.Add(-13 * time.Hour)
	msg1Time := now.Add(-13 * time.Hour) // outside window
	msg2Time := now.Add(-70 * time.Minute)
	msg3Time := now.Add(-10 * time.Minute)

	// scanSince = now - 2h (mirrors recentScanStartUnixMilli logic)
	scanSince := now.Add(-2 * time.Hour).UnixMilli()

	ddl := openCodeTestSchema + fmt.Sprintf(`
INSERT INTO session VALUES('ses-1', NULL, NULL, '/work/myproject', 'deepseek', %d, %d);
INSERT INTO message VALUES('msg-1','ses-1',%d,%d,'%s');
INSERT INTO message VALUES('msg-2','ses-1',%d,%d,'%s');
INSERT INTO message VALUES('msg-3','ses-1',%d,%d,'%s');
`,
		sessionCreated.UnixMilli(), now.UnixMilli(),
		msg1Time.UnixMilli(), msg1Time.UnixMilli(), makeMsg(100, 10, 500, 0, 5),
		msg2Time.UnixMilli(), msg2Time.UnixMilli(), makeMsg(200, 20, 1000, 0, 10),
		msg3Time.UnixMilli(), msg3Time.UnixMilli(), makeMsg(300, 30, 1500, 0, 15),
	)
	dbPath := createOpenCodeTestDB(t, ddl)

	worktrees := []WorktreeRef{
		{ProjectID: "proj-1", WorkspaceID: "ws-1", WorkspacePath: "/work/myproject"},
	}
	input := ScanInput{
		RunID:              "test",
		IngestedAt:         now.UnixMilli(),
		ScanSinceUnixMilli: scanSince,
		Worktrees:          worktrees,
		SessionRoot:        filepath.Dir(dbPath),
	}

	rows, err := ScanOpenCodeHourlyUsage(context.Background(), input)
	if err != nil {
		t.Fatalf("ScanOpenCodeHourlyUsage: %v", err)
	}

	if len(rows) == 0 {
		t.Fatal("expected at least one row, got none")
	}

	// Aggregate across all returned rows (msg2 and msg3 may be in separate buckets).
	var totalInput, totalOutput, totalCacheRead, totalReasoning, totalAll int64
	for _, r := range rows {
		totalInput += r.InputTokens
		totalOutput += r.OutputTokens
		totalCacheRead += r.CachedInputTokens
		totalReasoning += r.ReasoningTokens
		totalAll += r.TotalTokens

		if r.SessionCount != 1 {
			t.Errorf("row bucket %d: expected SessionCount=1, got %d", r.BucketStartHourUTC, r.SessionCount)
		}
		if r.WorkspaceID != "ws-1" {
			t.Errorf("row bucket %d: expected WorkspaceID=ws-1, got %q", r.BucketStartHourUTC, r.WorkspaceID)
		}
	}

	// msg2: input=200+1000=1200, output=20, cache_read=1000, reasoning=10, total=1230
	// msg3: input=300+1500=1800, output=30, cache_read=1500, reasoning=15, total=1845
	// combined: input=3000, output=50, cache_read=2500, reasoning=25, total=3075
	wantInput := int64(200+1000) + int64(300+1500)    // 3000
	wantOutput := int64(20 + 30)                       // 50
	wantCacheRead := int64(1000 + 1500)                // 2500
	wantReasoning := int64(10 + 15)                    // 25
	wantTotal := wantInput + wantOutput + wantReasoning // 3075

	if totalInput != wantInput {
		t.Errorf("InputTokens: want %d, got %d", wantInput, totalInput)
	}
	if totalOutput != wantOutput {
		t.Errorf("OutputTokens: want %d, got %d", wantOutput, totalOutput)
	}
	if totalCacheRead != wantCacheRead {
		t.Errorf("CachedInputTokens: want %d, got %d", wantCacheRead, totalCacheRead)
	}
	if totalReasoning != wantReasoning {
		t.Errorf("ReasoningTokens: want %d, got %d", wantReasoning, totalReasoning)
	}
	if totalAll != wantTotal {
		t.Errorf("TotalTokens: want %d, got %d", wantTotal, totalAll)
	}
}

// TestScanOpenCodeOldSessionExcluded verifies that messages outside the scan
// window are excluded even when the session was recently active.
func TestScanOpenCodeOldSessionExcluded(t *testing.T) {
	t.Parallel()

	now := time.Now().UTC()
	oldMsgTime := now.Add(-3 * time.Hour) // outside 2h window
	scanSince := now.Add(-2 * time.Hour).UnixMilli()

	ddl := openCodeTestSchema + fmt.Sprintf(`
INSERT INTO session VALUES('ses-old', NULL, NULL, '/work/proj', 'model-x', %d, %d);
INSERT INTO message VALUES('msg-old','ses-old',%d,%d,'%s');
`,
		oldMsgTime.UnixMilli(), now.UnixMilli(),
		oldMsgTime.UnixMilli(), oldMsgTime.UnixMilli(), makeMsg(999, 99, 5000, 0, 50),
	)
	dbPath := createOpenCodeTestDB(t, ddl)

	input := ScanInput{
		RunID:              "test",
		IngestedAt:         now.UnixMilli(),
		ScanSinceUnixMilli: scanSince,
		Worktrees:          []WorktreeRef{},
		SessionRoot:        filepath.Dir(dbPath),
	}

	rows, err := ScanOpenCodeHourlyUsage(context.Background(), input)
	if err != nil {
		t.Fatalf("ScanOpenCodeHourlyUsage: %v", err)
	}
	if len(rows) != 0 {
		t.Errorf("expected no rows (all messages outside window), got %d", len(rows))
	}
}

// TestScanOpenCodeNoWindow verifies that with ScanSinceUnixMilli == 0 (startup
// full scan) all messages are returned regardless of age.
func TestScanOpenCodeNoWindow(t *testing.T) {
	t.Parallel()

	now := time.Now().UTC()
	oldTime := now.Add(-48 * time.Hour)

	ddl := openCodeTestSchema + fmt.Sprintf(`
INSERT INTO session VALUES('ses-full', NULL, NULL, '/work/old', 'model-y', %d, %d);
INSERT INTO message VALUES('msg-full','ses-full',%d,%d,'%s');
`,
		oldTime.UnixMilli(), now.UnixMilli(),
		oldTime.UnixMilli(), oldTime.UnixMilli(), makeMsg(100, 10, 500, 0, 0),
	)
	dbPath := createOpenCodeTestDB(t, ddl)

	input := ScanInput{
		RunID:              "test",
		IngestedAt:         now.UnixMilli(),
		ScanSinceUnixMilli: 0, // no window
		Worktrees:          []WorktreeRef{},
		SessionRoot:        filepath.Dir(dbPath),
	}

	rows, err := ScanOpenCodeHourlyUsage(context.Background(), input)
	if err != nil {
		t.Fatalf("ScanOpenCodeHourlyUsage: %v", err)
	}
	if len(rows) == 0 {
		t.Fatal("expected rows with no scan window, got none")
	}
	// input = 100+500 = 600
	if rows[0].InputTokens != 600 {
		t.Errorf("InputTokens: want 600, got %d", rows[0].InputTokens)
	}
}

// TestNormalizeOpenCodeModel covers the JSON model payload parsing.
func TestNormalizeOpenCodeModel(t *testing.T) {
	t.Parallel()

	cases := []struct {
		raw  string
		want string
	}{
		{"deepseek/deepseek-v4-pro", "deepseek/deepseek-v4-pro"},
		{"", "unknown"},
		{`{"id":"deepseek-v4-pro","providerID":"deepseek"}`, "deepseek/deepseek-v4-pro"},
		{`{"modelID":"flash","providerId":"ds"}`, "ds/flash"},
		{`{"id":"only-id"}`, "only-id"},
		{`{bad json`, `{bad json`},
	}
	for _, tc := range cases {
		got := normalizeOpenCodeModel(tc.raw)
		if got != tc.want {
			t.Errorf("normalizeOpenCodeModel(%q) = %q, want %q", tc.raw, got, tc.want)
		}
	}
}

// TestParseOpenCodeTimestamp verifies epoch-ms → RFC3339 conversion.
func TestParseOpenCodeTimestamp(t *testing.T) {
	t.Parallel()

	// 0 → empty
	if got := parseOpenCodeTimestamp(float64(0)); got != "" {
		t.Errorf("zero ms: want empty, got %q", got)
	}
	// negative → empty
	if got := parseOpenCodeTimestamp(float64(-1)); got != "" {
		t.Errorf("negative ms: want empty, got %q", got)
	}
	// non-numeric → empty
	if got := parseOpenCodeTimestamp("not-a-number"); got != "" {
		t.Errorf("string: want empty, got %q", got)
	}
	// valid ms
	ms := float64(time.Date(2026, 6, 20, 0, 0, 0, 0, time.UTC).UnixMilli())
	got := parseOpenCodeTimestamp(ms)
	if got == "" {
		t.Error("valid ms: want non-empty, got empty")
	}
}

// Ensure the test binary can find sqlite3 at test time.
func TestMain(m *testing.M) {
	if _, err := exec.LookPath("sqlite3"); err != nil {
		fmt.Fprintln(os.Stderr, "sqlite3 not found in PATH, skipping opencode scanner tests")
		os.Exit(0)
	}
	os.Exit(m.Run())
}
