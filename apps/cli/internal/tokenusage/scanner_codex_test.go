package tokenusage

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

const codexSessionFixture = `{"timestamp":"2026-06-08T05:08:10.774Z","type":"session_meta","payload":{"id":"019ea5a1-94ae-7013-a40d-636ab48c8618","cwd":"/Users/zhex/.yishan/worktrees/yishan-io/yishan-mono/test-codex","model_provider":"openai"}}
{"timestamp":"2026-06-08T05:08:12.147Z","type":"turn_context","payload":{"turn_id":"turn-1","cwd":"/Users/zhex/.yishan/worktrees/yishan-io/yishan-mono/test-codex","model":"gpt-5.4-mini"}}
{"timestamp":"2026-06-08T05:08:15.338Z","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":1000,"cached_input_tokens":200,"output_tokens":50,"reasoning_output_tokens":10,"total_tokens":1050},"last_token_usage":{"input_tokens":1000,"cached_input_tokens":200,"output_tokens":50,"reasoning_output_tokens":10,"total_tokens":1050},"model_context_window":258400}}}
{"timestamp":"2026-06-08T05:08:15.338Z","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":2000,"cached_input_tokens":400,"output_tokens":100,"reasoning_output_tokens":20,"total_tokens":2100},"last_token_usage":{"input_tokens":2000,"cached_input_tokens":400,"output_tokens":100,"reasoning_output_tokens":20,"total_tokens":2100},"model_context_window":258400}}}
`

func TestParseCodexLineSessionMeta(t *testing.T) {
	t.Parallel()

	line := `{"timestamp":"2026-06-08T05:08:10.774Z","type":"session_meta","payload":{"id":"session-1","cwd":"/home/user/project"}}`
	parsed := parseCodexLine([]byte(line))

	if parsed.kind != codexLineSessionMeta {
		t.Fatalf("expected session_meta kind, got %v", parsed.kind)
	}
	if parsed.sessionID != "session-1" {
		t.Fatalf("expected sessionID session-1, got %q", parsed.sessionID)
	}
	if parsed.cwd != "/home/user/project" {
		t.Fatalf("expected cwd /home/user/project, got %q", parsed.cwd)
	}
}

func TestParseCodexLineTokenCount(t *testing.T) {
	t.Parallel()

	line := `{"timestamp":"2026-06-08T05:08:15.338Z","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":1000,"cached_input_tokens":200,"output_tokens":50,"reasoning_output_tokens":10,"total_tokens":1050},"last_token_usage":{"input_tokens":1000,"cached_input_tokens":200,"output_tokens":50,"reasoning_output_tokens":10,"total_tokens":1050}}}}`
	parsed := parseCodexLine([]byte(line))

	if parsed.kind != codexLineTokenCount {
		t.Fatalf("expected token_count kind, got %v", parsed.kind)
	}
	if parsed.usage.TotalTokens != 1050 {
		t.Fatalf("expected total tokens 1050, got %d", parsed.usage.TotalTokens)
	}
	if parsed.usage.InputTokens != 1000 {
		t.Fatalf("expected input tokens 1000, got %d", parsed.usage.InputTokens)
	}
	if parsed.usage.OutputTokens != 50 {
		t.Fatalf("expected output tokens 50, got %d", parsed.usage.OutputTokens)
	}
	if parsed.usage.CachedInputTokens != 200 {
		t.Fatalf("expected cached input tokens 200, got %d", parsed.usage.CachedInputTokens)
	}
	if parsed.usage.ReasoningTokens != 10 {
		t.Fatalf("expected reasoning tokens 10, got %d", parsed.usage.ReasoningTokens)
	}
}

func TestParseCodexLineTokenCountOnlyTotalUsage(t *testing.T) {
	t.Parallel()

	line := `{"timestamp":"2026-06-08T05:08:15.338Z","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":500,"output_tokens":30,"total_tokens":530}}}}`
	parsed := parseCodexLine([]byte(line))

	if parsed.kind != codexLineTokenCount {
		t.Fatalf("expected token_count kind, got %v", parsed.kind)
	}
	if parsed.usage.TotalTokens != 530 {
		t.Fatalf("expected total tokens 530, got %d", parsed.usage.TotalTokens)
	}
}

func TestParseCodexLineTurnContext(t *testing.T) {
	t.Parallel()

	line := `{"timestamp":"2026-06-08T05:08:33.544Z","type":"turn_context","payload":{"turn_id":"turn-1","cwd":"/home/user/other-project","model":"gpt-5.4-mini"}}`
	parsed := parseCodexLine([]byte(line))

	if parsed.kind != codexLineTurnContext {
		t.Fatalf("expected turn_context kind, got %v", parsed.kind)
	}
	if parsed.cwd != "/home/user/other-project" {
		t.Fatalf("expected cwd /home/user/other-project, got %q", parsed.cwd)
	}
	if parsed.model != "gpt-5.4-mini" {
		t.Fatalf("expected model gpt-5.4-mini, got %q", parsed.model)
	}
}

func TestParseCodexLineIgnoresNonTokenCountEventMsg(t *testing.T) {
	t.Parallel()

	line := `{"timestamp":"2026-06-08T05:08:12.147Z","type":"event_msg","payload":{"type":"task_started"}}`
	parsed := parseCodexLine([]byte(line))

	if parsed.kind != codexLineOther {
		t.Fatalf("expected other kind, got %v", parsed.kind)
	}
}

func TestParseCodexLineInvalidJSON(t *testing.T) {
	t.Parallel()

	parsed := parseCodexLine([]byte("not json"))
	if parsed.kind != codexLineOther {
		t.Fatalf("expected other kind for invalid JSON, got %v", parsed.kind)
	}
}

func TestScanCodexSessionFile(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	sessionFilePath := filepath.Join(tmpDir, "session.jsonl")
	if err := os.WriteFile(sessionFilePath, []byte(codexSessionFixture), 0o644); err != nil {
		t.Fatalf("write fixture: %v", err)
	}

	input := ScanInput{
		RunID:      "test-run",
		IngestedAt: time.Date(2026, 6, 8, 10, 0, 0, 0, time.UTC).UnixMilli(),
		Worktrees:  nil,
	}

	states := make(map[string]*codexSessionState)
	buckets := make(map[hourlyKey]*hourlyAccumulator)

	err := scanCodexSessionFile(context.Background(), sessionFilePath, input, nil, states, buckets)
	if err != nil {
		t.Fatalf("scan session file: %v", err)
	}

	if len(buckets) == 0 {
		t.Fatal("expected at least one bucket, got 0")
	}

	var totalTokens int64
	for _, acc := range buckets {
		totalTokens += acc.TotalTokens
	}
	if totalTokens != 2100 {
		t.Fatalf("expected total tokens 2100 (1050 first event + 1050 delta from second), got %d", totalTokens)
	}
}

func TestScanCodexHourlyUsageIntegration(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	sessionFilePath := filepath.Join(tmpDir, "session.jsonl")
	if err := os.WriteFile(sessionFilePath, []byte(codexSessionFixture), 0o644); err != nil {
		t.Fatalf("write fixture: %v", err)
	}

	input := ScanInput{
		RunID:       "test-run",
		IngestedAt:  time.Date(2026, 6, 8, 10, 0, 0, 0, time.UTC).UnixMilli(),
		SessionRoot: tmpDir,
		Worktrees:   nil,
	}

	rows, err := ScanCodexHourlyUsage(context.Background(), input)
	if err != nil {
		t.Fatalf("scan hourly usage: %v", err)
	}

	if len(rows) == 0 {
		t.Fatal("expected at least one row, got 0")
	}

	for _, row := range rows {
		if row.AgentKind != "codex" {
			t.Fatalf("expected agent kind codex, got %q", row.AgentKind)
		}
		if row.ScannerSourceKind != SourceKindJSONL {
			t.Fatalf("expected source kind jsonl, got %q", row.ScannerSourceKind)
		}
		if !strings.Contains(row.ScannerSourceID, "session.jsonl") {
			t.Fatalf("expected source ID to contain session.jsonl, got %q", row.ScannerSourceID)
		}
		if row.Model != "gpt-5.4-mini" {
			t.Fatalf("expected model gpt-5.4-mini, got %q", row.Model)
		}
	}
}

func TestScanCodexSessionFileModelFallback(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	fixture := `{"timestamp":"2026-06-08T05:08:10.774Z","type":"session_meta","payload":{"id":"session-1","cwd":"/tmp"}}
{"timestamp":"2026-06-08T05:08:15.338Z","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":100,"output_tokens":50,"total_tokens":150}}}}}
`
	sessionFilePath := filepath.Join(tmpDir, "session.jsonl")
	if err := os.WriteFile(sessionFilePath, []byte(fixture), 0o644); err != nil {
		t.Fatalf("write fixture: %v", err)
	}

	input := ScanInput{
		RunID:      "test-run",
		IngestedAt: time.Date(2026, 6, 8, 10, 0, 0, 0, time.UTC).UnixMilli(),
		Worktrees:  nil,
	}

	buckets := make(map[hourlyKey]*hourlyAccumulator)
	err := scanCodexSessionFile(context.Background(), sessionFilePath, input, nil, make(map[string]*codexSessionState), buckets)
	if err != nil {
		t.Fatalf("scan: %v", err)
	}

	for key := range buckets {
		if key.model != "unknown" {
			t.Fatalf("expected model unknown (no turn_context), got %q", key.model)
		}
	}
}
