package scanner

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
	"yishan/apps/cli/internal/tokenusage/record"
)

const piSessionFixture = `{"type":"session","version":3,"id":"session-1","timestamp":"2026-06-29T10:00:00.000Z","cwd":"/tmp/pi-project"}
{"type":"model_change","id":"model-1","parentId":null,"timestamp":"2026-06-29T10:00:01.000Z","provider":"openai-codex","modelId":"gpt-5.5"}
{"type":"message","id":"user-1","parentId":"model-1","timestamp":"2026-06-29T10:00:02.000Z","message":{"role":"user","content":[{"type":"text","text":"check version"}],"timestamp":1780000002000}}
{"type":"message","id":"assistant-1","parentId":"user-1","timestamp":"2026-06-29T10:00:05.000Z","message":{"role":"assistant","content":[{"type":"text","text":"running"},{"type":"toolCall","id":"call-1","name":"bash","arguments":{"command":"pi --version"}}],"api":"openai-codex-responses","provider":"openai-codex","model":"gpt-5.5","usage":{"input":654,"output":16,"cacheRead":1536,"cacheWrite":0,"totalTokens":2206},"stopReason":"stop","timestamp":1780000005000}}
{"type":"message","id":"tool-result-1","parentId":"assistant-1","timestamp":"2026-06-29T10:00:05.100Z","message":{"role":"toolResult","toolCallId":"call-1","toolName":"bash","content":[{"type":"text","text":"0.75.1"}],"isError":false,"timestamp":1780000005100}}
{"type":"message","id":"assistant-2","parentId":"tool-result-1","timestamp":"2026-06-29T11:01:05.000Z","message":{"role":"assistant","content":[{"type":"text","text":"pi version 0.75.1"}],"api":"openai-codex-responses","provider":"openai-codex","model":"gpt-5.5","usage":{"input":606,"output":9,"cacheRead":1536,"cacheWrite":0,"totalTokens":2151},"stopReason":"stop","timestamp":1780003665000}}
`

const piModelFallbackFixture = `{"type":"session","version":3,"id":"session-2","timestamp":"2026-06-29T12:00:00.000Z","cwd":"/tmp/pi-project"}
{"type":"model_change","id":"model-1","parentId":null,"timestamp":"2026-06-29T12:00:01.000Z","provider":"deepseek","modelId":"deepseek-v4-pro"}
{"type":"message","id":"assistant-1","parentId":"model-1","timestamp":"2026-06-29T12:00:05.000Z","message":{"role":"assistant","content":[{"type":"text","text":"done"}],"usage":{"input":100,"output":20,"cacheRead":0,"cacheWrite":0,"totalTokens":120},"stopReason":"stop","timestamp":1780007205000}}
`

const piDirectCostFixture = `{"type":"session","version":3,"id":"session-3","timestamp":"2026-06-29T13:00:00.000Z","cwd":"/tmp/pi-project"}
{"type":"model_change","id":"model-1","parentId":null,"timestamp":"2026-06-29T13:00:01.000Z","provider":"openai","modelId":"gpt-5.6-terra"}
{"type":"message","id":"assistant-1","parentId":"model-1","timestamp":"2026-06-29T13:00:05.000Z","message":{"role":"assistant","content":[{"type":"text","text":"done"}],"usage":{"input":100,"output":20,"cacheRead":0,"cacheWrite":0,"reasoning":5,"totalTokens":125,"cost":{"total":0.25}},"stopReason":"stop","timestamp":1780010805000}}
`

func TestParsePiMessageActivityCountsAssistantUsageAndToolCalls(t *testing.T) {
	t.Parallel()

	rawLine := []byte(`{"type":"message","id":"assistant-1","timestamp":"2026-06-29T10:00:05.000Z","message":{"role":"assistant","content":[{"type":"text","text":"running"},{"type":"toolCall","id":"call-1","name":"bash","arguments":{"command":"pi --version"}}],"model":"gpt-5.5","usage":{"input":654,"output":16,"cacheRead":1536,"cacheWrite":0,"totalTokens":2206}}}`)
	activity, ok := parsePiMessageActivity(mapFromJSON(t, rawLine), "session-1", "/tmp/pi-project", "gpt-5.5", "session-1", testPricingCatalog())
	if !ok {
		t.Fatal("expected assistant activity to parse")
	}
	if activity.Kind != piActivityAssistantUsage {
		t.Fatalf("expected assistant usage kind, got %v", activity.Kind)
	}
	if activity.TotalTokens != 2206 {
		t.Fatalf("expected total tokens 2206, got %d", activity.TotalTokens)
	}
	if activity.ToolCallCount != 1 {
		t.Fatalf("expected 1 tool call, got %d", activity.ToolCallCount)
	}
}

func TestParsePiMessageActivityUsesDirectCostWhenPresent(t *testing.T) {
	t.Parallel()

	rawLine := []byte(`{"type":"message","id":"assistant-1","timestamp":"2026-06-29T10:00:05.000Z","message":{"role":"assistant","content":[{"type":"text","text":"done"}],"model":"gpt-5.6-terra","usage":{"input":100,"output":20,"cacheRead":0,"cacheWrite":0,"reasoning":5,"totalTokens":125,"cost":{"total":0.25}}}}`)
	activity, ok := parsePiMessageActivity(mapFromJSON(t, rawLine), "session-1", "/tmp/pi-project", "gpt-5.6-terra", "session-1", testPricingCatalog())
	if !ok {
		t.Fatal("expected assistant activity to parse")
	}
	if activity.ReasoningTokens != 5 {
		t.Fatalf("expected reasoning tokens 5, got %d", activity.ReasoningTokens)
	}
	if activity.TotalCostMicrosUSD != 250_000 {
		t.Fatalf("expected direct cost 250000 micros, got %d", activity.TotalCostMicrosUSD)
	}
}

func TestScanPiHourlyUsageIntegration(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	sessionDir := filepath.Join(tmpDir, "nested")
	if err := os.MkdirAll(sessionDir, 0o755); err != nil {
		t.Fatalf("mkdir session dir: %v", err)
	}
	sessionFilePath := filepath.Join(sessionDir, "2026-06-29T10-00-00-000Z_session-1.jsonl")
	if err := os.WriteFile(sessionFilePath, []byte(piSessionFixture), 0o644); err != nil {
		t.Fatalf("write fixture: %v", err)
	}

	input := ScanInput{
		RunID:       "test-run",
		IngestedAt:  time.Date(2026, 6, 29, 13, 0, 0, 0, time.UTC).UnixMilli(),
		SessionRoot: tmpDir,
		Catalog:     testPricingCatalog(),
		Worktrees: []record.WorktreeRef{{
			ProjectID:     "proj-1",
			WorkspaceID:   "ws-1",
			WorkspacePath: "/tmp/pi-project",
		}},
	}

	rows, err := ScanPiHourlyUsage(context.Background(), input)
	if err != nil {
		t.Fatalf("scan hourly usage: %v", err)
	}
	if len(rows) != 2 {
		t.Fatalf("expected 2 hourly rows, got %d", len(rows))
	}

	var totalInput, totalOutput, totalCacheRead, totalTokens, totalCostMicros int64
	var turns, tools int64
	for _, row := range rows {
		if row.AgentKind != piAgentKind {
			t.Fatalf("expected agent kind %q, got %q", piAgentKind, row.AgentKind)
		}
		if row.WorkspaceID != "ws-1" || row.ProjectID != "proj-1" {
			t.Fatalf("expected workspace/project attribution ws-1/proj-1, got %q/%q", row.WorkspaceID, row.ProjectID)
		}
		if row.Model != "gpt-5.5" {
			t.Fatalf("expected model gpt-5.5, got %q", row.Model)
		}
		if row.ScannerSourceKind != record.SourceKindJSONL {
			t.Fatalf("expected source kind jsonl, got %q", row.ScannerSourceKind)
		}
		if !strings.Contains(row.ScannerSourceID, "session-1.jsonl") {
			t.Fatalf("expected source ID to contain session-1.jsonl, got %q", row.ScannerSourceID)
		}
		totalInput += row.InputTokens
		totalOutput += row.OutputTokens
		totalCacheRead += row.CachedInputTokens
		totalTokens += row.TotalTokens
		totalCostMicros += row.TotalCostMicrosUSD
		turns += row.TurnCount
		tools += row.ToolCallCount
	}

	if totalInput != 4332 {
		t.Fatalf("expected total input 4332, got %d", totalInput)
	}
	if totalOutput != 25 {
		t.Fatalf("expected total output 25, got %d", totalOutput)
	}
	if totalCacheRead != 3072 {
		t.Fatalf("expected total cache read 3072, got %d", totalCacheRead)
	}
	if totalTokens != 4357 {
		t.Fatalf("expected total tokens 4357, got %d", totalTokens)
	}
	if totalCostMicros != 8_586 {
		t.Fatalf("expected estimated total cost 8586 micros, got %d", totalCostMicros)
	}
	if turns != 1 {
		t.Fatalf("expected 1 turn, got %d", turns)
	}
	if tools != 1 {
		t.Fatalf("expected 1 tool call, got %d", tools)
	}
}

func TestScanPiHourlyUsageKeepsConcurrentSessionSourcesSeparate(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	for _, sessionID := range []string{"session-3", "session-4"} {
		sessionFixture := strings.ReplaceAll(piDirectCostFixture, "session-3", sessionID)
		sessionFilePath := filepath.Join(tmpDir, "2026-06-29T13-00-00-000Z_"+sessionID+".jsonl")
		if err := os.WriteFile(sessionFilePath, []byte(sessionFixture), 0o644); err != nil {
			t.Fatalf("write %s fixture: %v", sessionID, err)
		}
	}

	input := ScanInput{
		RunID:       "test-run",
		IngestedAt:  time.Now().UnixMilli(),
		SessionRoot: tmpDir,
		Catalog:     testPricingCatalog(),
		Worktrees: []record.WorktreeRef{{
			ProjectID:     "proj-1",
			WorkspaceID:   "ws-1",
			WorkspacePath: "/tmp/pi-project",
		}},
	}
	rows, err := ScanPiHourlyUsage(context.Background(), input)
	if err != nil {
		t.Fatalf("scan hourly usage: %v", err)
	}
	if len(rows) != 2 {
		t.Fatalf("expected two source rows, got %d", len(rows))
	}

	var totalTokens, totalCostMicros int64
	sourceIDs := make(map[string]bool, len(rows))
	for _, row := range rows {
		if row.ProjectID != "proj-1" || row.WorkspaceID != "ws-1" || row.ModelNormalized != "gpt-5.6-terra" {
			t.Fatalf("expected matching final hourly key, got %#v", row)
		}
		totalTokens += row.TotalTokens
		totalCostMicros += row.TotalCostMicrosUSD
		sourceIDs[row.ScannerSourceID] = true
	}
	if len(sourceIDs) != 2 || totalTokens != 250 || totalCostMicros != 500_000 {
		t.Fatalf("expected separate sources with summed 250 tokens and 500000 cost, got %#v", rows)
	}
}

func TestScanPiUsesDirectMessageSummationNotDeltas(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	sessionFilePath := filepath.Join(tmpDir, "2026-06-29T10-00-00-000Z_session-1.jsonl")
	if err := os.WriteFile(sessionFilePath, []byte(piSessionFixture), 0o644); err != nil {
		t.Fatalf("write fixture: %v", err)
	}

	input := ScanInput{RunID: "test-run", IngestedAt: time.Now().UnixMilli(), SessionRoot: tmpDir, Catalog: testPricingCatalog()}
	rows, err := ScanPiHourlyUsage(context.Background(), input)
	if err != nil {
		t.Fatalf("scan hourly usage: %v", err)
	}

	var totalTokens int64
	for _, row := range rows {
		totalTokens += row.TotalTokens
	}
	if totalTokens != 4357 {
		t.Fatalf("expected direct sum total 4357 (2206 + 2151), got %d", totalTokens)
	}
}

func TestScanPiFallsBackToLatestModelChange(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	sessionFilePath := filepath.Join(tmpDir, "2026-06-29T12-00-00-000Z_session-2.jsonl")
	if err := os.WriteFile(sessionFilePath, []byte(piModelFallbackFixture), 0o644); err != nil {
		t.Fatalf("write fixture: %v", err)
	}

	input := ScanInput{RunID: "test-run", IngestedAt: time.Now().UnixMilli(), SessionRoot: tmpDir, Catalog: testPricingCatalog()}
	rows, err := ScanPiHourlyUsage(context.Background(), input)
	if err != nil {
		t.Fatalf("scan hourly usage: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("expected 1 row, got %d", len(rows))
	}
	if rows[0].Model != "deepseek-v4-pro" {
		t.Fatalf("expected model fallback deepseek-v4-pro, got %q", rows[0].Model)
	}
	if rows[0].TotalCostMicrosUSD != 61 {
		t.Fatalf("expected estimated cost 61 micros, got %d", rows[0].TotalCostMicrosUSD)
	}
}

func TestScanPiPrefersDirectCostOverFallbackPricing(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	sessionFilePath := filepath.Join(tmpDir, "2026-06-29T13-00-00-000Z_session-3.jsonl")
	if err := os.WriteFile(sessionFilePath, []byte(piDirectCostFixture), 0o644); err != nil {
		t.Fatalf("write fixture: %v", err)
	}

	input := ScanInput{RunID: "test-run", IngestedAt: time.Now().UnixMilli(), SessionRoot: tmpDir, Catalog: testPricingCatalog()}
	rows, err := ScanPiHourlyUsage(context.Background(), input)
	if err != nil {
		t.Fatalf("scan hourly usage: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("expected 1 row, got %d", len(rows))
	}
	if rows[0].TotalCostMicrosUSD != 250_000 {
		t.Fatalf("expected direct cost 250000 micros, got %d", rows[0].TotalCostMicrosUSD)
	}
}

func TestScanPiPreservesExplicitZeroDirectCost(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	fixture := `{"type":"session","version":3,"id":"session-4","timestamp":"2026-06-29T13:00:00.000Z","cwd":"/tmp/pi-project"}
{"type":"model_change","id":"model-1","parentId":null,"timestamp":"2026-06-29T13:00:01.000Z","provider":"openai","modelId":"gpt-5.6-terra"}
{"type":"message","id":"assistant-1","parentId":"model-1","timestamp":"2026-06-29T13:00:05.000Z","message":{"role":"assistant","content":[{"type":"text","text":"done"}],"usage":{"input":100,"output":20,"cacheRead":0,"cacheWrite":0,"totalTokens":120,"cost":{"total":0}},"stopReason":"stop","timestamp":1780010805000}}
`
	sessionFilePath := filepath.Join(tmpDir, "2026-06-29T13-00-00-000Z_session-4.jsonl")
	if err := os.WriteFile(sessionFilePath, []byte(fixture), 0o644); err != nil {
		t.Fatalf("write fixture: %v", err)
	}

	input := ScanInput{RunID: "test-run", IngestedAt: time.Now().UnixMilli(), SessionRoot: tmpDir, Catalog: testPricingCatalog()}
	rows, err := ScanPiHourlyUsage(context.Background(), input)
	if err != nil {
		t.Fatalf("scan hourly usage: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("expected 1 row, got %d", len(rows))
	}
	if rows[0].TotalCostMicrosUSD != 0 {
		t.Fatalf("expected explicit zero direct cost to remain zero, got %d", rows[0].TotalCostMicrosUSD)
	}
}

func TestResolvePiSessionRootPrefersManagedRoot(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)

	managedRoot := filepath.Join(homeDir, ".yishan", "pi", "agent", "sessions")
	if err := os.MkdirAll(managedRoot, 0o755); err != nil {
		t.Fatalf("mkdir managed root: %v", err)
	}
	legacyRoot := filepath.Join(homeDir, ".pi", "agent", "sessions")
	if err := os.MkdirAll(legacyRoot, 0o755); err != nil {
		t.Fatalf("mkdir legacy root: %v", err)
	}

	resolvedRoot, err := resolvePiSessionRoot("")
	if err != nil {
		t.Fatalf("resolve pi session root: %v", err)
	}
	if resolvedRoot != managedRoot {
		t.Fatalf("expected managed root %q, got %q", managedRoot, resolvedRoot)
	}
}

func TestResolvePiSessionRootFallsBackToLegacyRoot(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)

	legacyRoot := filepath.Join(homeDir, ".pi", "agent", "sessions")
	if err := os.MkdirAll(legacyRoot, 0o755); err != nil {
		t.Fatalf("mkdir legacy root: %v", err)
	}

	resolvedRoot, err := resolvePiSessionRoot("")
	if err != nil {
		t.Fatalf("resolve pi session root: %v", err)
	}
	if resolvedRoot != legacyRoot {
		t.Fatalf("expected legacy root %q, got %q", legacyRoot, resolvedRoot)
	}
}

func mapFromJSON(t *testing.T, rawLine []byte) map[string]any {
	t.Helper()
	var top map[string]any
	if err := json.Unmarshal(rawLine, &top); err != nil {
		t.Fatalf("unmarshal json: %v", err)
	}
	return top
}
