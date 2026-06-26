package tokenusage

import (
	"bufio"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestLiveClaudeActivityCounts(t *testing.T) {
	transcriptPath := "/Users/zhex/.claude/projects/-Users-zhex--yishan-worktrees-yishan-io-yishan-mono-pr-check-improve/96cf01cd-3e83-4d8d-a47a-98b34fceca48.jsonl"
	if _, err := os.Stat(transcriptPath); os.IsNotExist(err) {
		t.Skip("claude live transcript not present")
	}

	buckets := make(map[hourlyKey]*hourlyAccumulator)
	input := ScanInput{RunID: "live-claude", IngestedAt: time.Now().UnixMilli()}
	if err := scanClaudeTranscriptFile(context.Background(), transcriptPath, input, nil, buckets); err != nil {
		t.Fatalf("scanClaudeTranscriptFile: %v", err)
	}

	scannerTurns, scannerTools, scannerSkills := sumActivityCounts(buckets)
	groundTurns, groundTools, groundSkills, err := directClaudeActivityCounts(transcriptPath)
	if err != nil {
		t.Fatalf("directClaudeActivityCounts: %v", err)
	}

	t.Logf("claude scanner: turns=%d tools=%d skills=%d", scannerTurns, scannerTools, scannerSkills)
	t.Logf("claude direct: turns=%d tools=%d skills=%d", groundTurns, groundTools, groundSkills)

	if scannerTurns != groundTurns || scannerTools != groundTools || scannerSkills != groundSkills {
		t.Fatalf(
			"claude mismatch scanner=(%d,%d,%d) direct=(%d,%d,%d)",
			scannerTurns,
			scannerTools,
			scannerSkills,
			groundTurns,
			groundTools,
			groundSkills,
		)
	}
}

func TestLiveCodexActivityCounts(t *testing.T) {
	sessionPath := "/Users/zhex/.codex/sessions/2025/12/29/rollout-2025-12-29T17-14-41-019b6850-c067-7c70-a1a4-8182a2a5ab63.jsonl"
	if _, err := os.Stat(sessionPath); os.IsNotExist(err) {
		t.Skip("codex live session not present")
	}

	buckets := make(map[hourlyKey]*hourlyAccumulator)
	states := make(map[string]*codexSessionState)
	input := ScanInput{RunID: "live-codex", IngestedAt: time.Now().UnixMilli()}
	if err := scanCodexSessionFile(context.Background(), sessionPath, input, nil, states, buckets); err != nil {
		t.Fatalf("scanCodexSessionFile: %v", err)
	}

	scannerTurns, scannerTools, scannerSkills := sumActivityCounts(buckets)
	groundTurns, groundTools, groundSkills, err := directCodexActivityCounts(sessionPath)
	if err != nil {
		t.Fatalf("directCodexActivityCounts: %v", err)
	}

	t.Logf("codex scanner: turns=%d tools=%d skills=%d", scannerTurns, scannerTools, scannerSkills)
	t.Logf("codex direct: turns=%d tools=%d skills=%d", groundTurns, groundTools, groundSkills)

	if scannerTurns != groundTurns || scannerTools != groundTools || scannerSkills != groundSkills {
		t.Fatalf(
			"codex mismatch scanner=(%d,%d,%d) direct=(%d,%d,%d)",
			scannerTurns,
			scannerTools,
			scannerSkills,
			groundTurns,
			groundTools,
			groundSkills,
		)
	}
}

func sumActivityCounts(buckets map[hourlyKey]*hourlyAccumulator) (int64, int64, int64) {
	var turns int64
	var tools int64
	for _, acc := range buckets {
		turns += acc.TurnCount
		tools += acc.ToolCallCount
	}
	return turns, tools, 0
}

func directClaudeActivityCounts(transcriptPath string) (int64, int64, int64, error) {
	fileHandle, err := os.Open(transcriptPath)
	if err != nil {
		return 0, 0, 0, err
	}
	defer fileHandle.Close()

	scanner := bufio.NewScanner(fileHandle)
	scanner.Buffer(make([]byte, 0, 64*1024), maxTokenUsageScanLineBytes)
	var turns int64
	var tools int64
	var skills int64
	for scanner.Scan() {
		var top map[string]any
		if err := json.Unmarshal(scanner.Bytes(), &top); err != nil {
			continue
		}
		switch getString(top, "type") {
		case "user":
			message, _ := top["message"].(map[string]any)
			text, ok := extractClaudeUserText(message["content"])
			if !ok || shouldSkipClaudeUserText(text) {
				continue
			}
			turns++
		case "tool_use":
			tools++
		case "assistant":
			_, toolCalls := parseClaudeAssistantToolUse(top)
			tools += toolCalls
		}
	}
	if err := scanner.Err(); err != nil {
		return 0, 0, 0, err
	}
	return turns, tools, skills, nil
}

func directCodexActivityCounts(sessionPath string) (int64, int64, int64, error) {
	fileHandle, err := os.Open(sessionPath)
	if err != nil {
		return 0, 0, 0, err
	}
	defer fileHandle.Close()

	scanner := bufio.NewScanner(fileHandle)
	scanner.Buffer(make([]byte, 0, 64*1024), maxTokenUsageScanLineBytes)
	var turns int64
	var tools int64
	var skills int64
	for scanner.Scan() {
		var top map[string]any
		if err := json.Unmarshal(scanner.Bytes(), &top); err != nil {
			continue
		}
		if getString(top, "type") != "response_item" {
			continue
		}
		payload, _ := top["payload"].(map[string]any)
		if payload == nil {
			continue
		}
		switch getString(payload, "type") {
		case "message":
			if getString(payload, "role") != "user" {
				continue
			}
			text := getCodexInputTextFromContent(payload["content"])
			if shouldSkipCodexUserText(text) {
				continue
			}
			turns++
		case "function_call", "custom_tool_call":
			tools++
		}
	}
	if err := scanner.Err(); err != nil {
		return 0, 0, 0, err
	}
	return turns, tools, skills, nil
}

func TestLiveFixturesPathsExist(t *testing.T) {
	for _, path := range []string{
		"/Users/zhex/.claude/projects/-Users-zhex--yishan-worktrees-yishan-io-yishan-mono-pr-check-improve/96cf01cd-3e83-4d8d-a47a-98b34fceca48.jsonl",
		"/Users/zhex/.codex/sessions/2025/12/29/rollout-2025-12-29T17-14-41-019b6850-c067-7c70-a1a4-8182a2a5ab63.jsonl",
	} {
		if _, err := os.Stat(filepath.Clean(path)); err == nil {
			return
		}
	}
	t.Skip("live fixture files not present on this machine")
}
