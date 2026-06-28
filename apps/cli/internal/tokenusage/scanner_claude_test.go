package tokenusage

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

const claudeSessionFixture = `{"type":"user","uuid":"some-uuid","sessionId":"462765f4-76c4-4691-9ba6-37812b26f50b","timestamp":"2026-05-25T21:12:46.000Z","cwd":"/Users/zhex/code/work/vestin/yishan"}
{"type":"assistant","uuid":"d09ceaa1-0d97-40df-900e-8f1f5a1f0931","sessionId":"462765f4-76c4-4691-9ba6-37812b26f50b","timestamp":"2026-05-25T21:12:48.830Z","cwd":"/Users/zhex/code/work/vestin/yishan","message":{"id":"msg_01","model":"claude-opus-4-6","role":"assistant","usage":{"input_tokens":3,"cache_creation_input_tokens":30305,"cache_read_input_tokens":0,"output_tokens":159}}}
{"type":"assistant","uuid":"d09ceaa1-0d97-40df-900e-8f1f5a1f0932","sessionId":"462765f4-76c4-4691-9ba6-37812b26f50b","timestamp":"2026-05-25T21:13:00.000Z","cwd":"/Users/zhex/code/work/vestin/yishan","message":{"id":"msg_02","model":"claude-opus-4-6","role":"assistant","usage":{"input_tokens":0,"cache_creation_input_tokens":0,"cache_read_input_tokens":144390,"output_tokens":510}}}
`

const claudeMultiSessionFixture = `{"type":"assistant","uuid":"a","sessionId":"session-a","timestamp":"2026-05-25T21:00:00.000Z","cwd":"/proj/a","message":{"id":"ma1","model":"claude-sonnet-4-5","role":"assistant","usage":{"input_tokens":100,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"output_tokens":50}}}
{"type":"assistant","uuid":"b","sessionId":"session-b","timestamp":"2026-05-25T21:01:00.000Z","cwd":"/proj/b","message":{"id":"mb1","model":"claude-opus-4-6","role":"assistant","usage":{"input_tokens":200,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"output_tokens":80}}}
`

const claudeActivityFixture = `{"type":"user","sessionId":"session-a","timestamp":"2026-05-25T21:00:00.000Z","cwd":"/proj/a","message":{"role":"user","content":"YISHAN_COMMAND: ys-start\n\nStart a new task using the ys-start workflow."}}
{"type":"assistant","sessionId":"session-a","timestamp":"2026-05-25T21:00:01.000Z","cwd":"/proj/a","message":{"id":"ma1","model":"claude-sonnet-4-5","role":"assistant","content":[{"type":"tool_use","id":"tool-1","name":"Read","input":{"file_path":"/tmp/a"}}],"usage":{"input_tokens":100,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"output_tokens":50}}}
`

func TestParseClaudeUsageRecordWithCacheWrite(t *testing.T) {
	t.Parallel()

	line := `{"type":"assistant","sessionId":"462765f4","timestamp":"2026-05-25T21:12:48.830Z","cwd":"/tmp/proj","message":{"id":"m1","model":"claude-opus-4-6","role":"assistant","usage":{"input_tokens":3,"cache_creation_input_tokens":30305,"cache_read_input_tokens":0,"output_tokens":159}}}`

	record, ok := parseClaudeUsageRecord([]byte(line), "")
	if !ok {
		t.Fatal("expected parse to succeed")
	}
	if record.SessionID != "462765f4" {
		t.Fatalf("expected sessionId 462765f4, got %q", record.SessionID)
	}
	if record.InputTokens != 3 {
		t.Fatalf("expected input tokens 3, got %d", record.InputTokens)
	}
	if record.OutputTokens != 159 {
		t.Fatalf("expected output tokens 159, got %d", record.OutputTokens)
	}
	if record.CacheReadTokens != 0 {
		t.Fatalf("expected cache read 0, got %d", record.CacheReadTokens)
	}
	if record.CacheWriteTokens != 30305 {
		t.Fatalf("expected cache write 30305, got %d", record.CacheWriteTokens)
	}
	if record.Model != "claude-opus-4-6" {
		t.Fatalf("expected model claude-opus-4-6, got %q", record.Model)
	}
}

func TestParseClaudeUsageRecordWithCacheRead(t *testing.T) {
	t.Parallel()

	line := `{"type":"assistant","sessionId":"462765f4","timestamp":"2026-05-25T21:13:00.000Z","cwd":"/tmp/proj","message":{"id":"m2","model":"claude-opus-4-6","role":"assistant","usage":{"input_tokens":0,"cache_creation_input_tokens":0,"cache_read_input_tokens":144390,"output_tokens":510}}}`

	record, ok := parseClaudeUsageRecord([]byte(line), "")
	if !ok {
		t.Fatal("expected parse to succeed")
	}
	if record.InputTokens != 0 {
		t.Fatalf("expected input tokens 0, got %d", record.InputTokens)
	}
	if record.OutputTokens != 510 {
		t.Fatalf("expected output tokens 510, got %d", record.OutputTokens)
	}
	if record.CacheReadTokens != 144390 {
		t.Fatalf("expected cache read 144390, got %d", record.CacheReadTokens)
	}
	if record.CacheWriteTokens != 0 {
		t.Fatalf("expected cache write 0, got %d", record.CacheWriteTokens)
	}
}

func TestParseClaudeUsageRecordIgnoresNonAssistant(t *testing.T) {
	t.Parallel()

	line := `{"type":"user","sessionId":"s1","timestamp":"2026-05-25T21:12:46.000Z"}`
	_, ok := parseClaudeUsageRecord([]byte(line), "")
	if ok {
		t.Fatal("expected non-assistant line to be skipped")
	}
}

func TestScanClaudeTranscriptFile(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	transcriptPath := filepath.Join(tmpDir, "transcript.jsonl")
	if err := os.WriteFile(transcriptPath, []byte(claudeSessionFixture), 0o644); err != nil {
		t.Fatalf("write fixture: %v", err)
	}

	input := ScanInput{
		RunID:      "test-run",
		IngestedAt: time.Date(2026, 5, 26, 0, 0, 0, 0, time.UTC).UnixMilli(),
		Worktrees:  nil,
	}

	buckets := make(map[hourlyKey]*hourlyAccumulator)
	err := scanClaudeTranscriptFile(context.Background(), transcriptPath, input, nil, buckets)
	if err != nil {
		t.Fatalf("scan: %v", err)
	}

	if len(buckets) == 0 {
		t.Fatal("expected at least one bucket")
	}

	var totalInput, totalOutput, totalCacheRead, totalCacheWrite, totalTokens int64
	for _, acc := range buckets {
		totalInput += acc.InputTokens
		totalOutput += acc.OutputTokens
		totalCacheRead += acc.CachedInputTokens
		totalCacheWrite += acc.CachedWriteTokens
		totalTokens += acc.TotalTokens
	}

	if totalInput != 174698 {
		t.Fatalf("expected input 174698, got %d", totalInput)
	}
	if totalOutput != 669 {
		t.Fatalf("expected output 669 (159+510), got %d", totalOutput)
	}
	if totalCacheRead != 144390 {
		t.Fatalf("expected cache read 144390, got %d", totalCacheRead)
	}
	if totalCacheWrite != 30305 {
		t.Fatalf("expected cache write 30305, got %d", totalCacheWrite)
	}
	if totalTokens != 175367 {
		t.Fatalf("expected total tokens 175367, got %d", totalTokens)
	}
}

func TestScanClaudeHourlyUsageIntegration(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	transcriptPath := filepath.Join(tmpDir, "transcript.jsonl")
	if err := os.WriteFile(transcriptPath, []byte(claudeMultiSessionFixture), 0o644); err != nil {
		t.Fatalf("write fixture: %v", err)
	}

	input := ScanInput{
		RunID:       "test-run",
		IngestedAt:  time.Date(2026, 5, 26, 0, 0, 0, 0, time.UTC).UnixMilli(),
		SessionRoot: tmpDir,
		Worktrees:   nil,
	}

	rows, err := ScanClaudeHourlyUsage(context.Background(), input)
	if err != nil {
		t.Fatalf("scan hourly: %v", err)
	}

	if len(rows) == 0 {
		t.Fatal("expected at least one row")
	}

	for _, row := range rows {
		if row.AgentKind != "claude" {
			t.Fatalf("expected agent kind claude, got %q", row.AgentKind)
		}
		if row.ScannerSourceKind != SourceKindJSONL {
			t.Fatalf("expected source kind jsonl, got %q", row.ScannerSourceKind)
		}
		if !strings.Contains(row.ScannerSourceID, "transcript.jsonl") {
			t.Fatalf("expected source ID to contain transcript.jsonl, got %q", row.ScannerSourceID)
		}
	}

	sessionIDs := make(map[string]bool)
	for _, row := range rows {
		sessionIDs[row.ScannerSourceID] = true
	}
	if len(sessionIDs) != 1 {
		t.Fatalf("expected 1 source, got %d", len(sessionIDs))
	}
}

func TestScanClaudeCountsTurnsToolsAndSkills(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	transcriptPath := filepath.Join(tmpDir, "transcript.jsonl")
	if err := os.WriteFile(transcriptPath, []byte(claudeActivityFixture), 0o644); err != nil {
		t.Fatalf("write fixture: %v", err)
	}

	input := ScanInput{RunID: "test-run", IngestedAt: time.Now().UnixMilli(), SessionRoot: tmpDir}
	rows, err := ScanClaudeHourlyUsage(context.Background(), input)
	if err != nil {
		t.Fatalf("scan hourly: %v", err)
	}

	var turns, tools, skills int64
	for _, row := range rows {
		turns += row.TurnCount
		tools += row.ToolCallCount
	}
	if turns != 1 {
		t.Fatalf("expected 1 turn, got %d", turns)
	}
	if tools != 1 {
		t.Fatalf("expected 1 tool call, got %d", tools)
	}
	if skills != 0 {
		t.Fatalf("expected 0 skills, got %d", skills)
	}
}
