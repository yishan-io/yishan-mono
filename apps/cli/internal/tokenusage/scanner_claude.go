package tokenusage

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"yishan/apps/cli/internal/agentkind"
)

const claudeAgentKind = agentkind.Claude

type claudeSourceRecord struct {
	Type      string `json:"type"`
	SessionID string `json:"sessionId"`
	Timestamp string `json:"timestamp"`
	CWD       string `json:"cwd"`
	Message   struct {
		ID    string `json:"id"`
		Model string `json:"model"`
		Usage struct {
			InputTokens      int64 `json:"input_tokens"`
			OutputTokens     int64 `json:"output_tokens"`
			CacheReadTokens  int64 `json:"cache_read_input_tokens"`
			CacheWriteTokens int64 `json:"cache_creation_input_tokens"`
		} `json:"usage"`
	} `json:"message"`
}

type claudeActivityKind int

const (
	claudeActivityNone claudeActivityKind = iota
	claudeActivityAssistantUsage
	claudeActivityUserTurn
	claudeActivityToolUse
)

type parsedClaudeActivity struct {
	Kind             claudeActivityKind
	SessionID        string
	Timestamp        time.Time
	Model            string
	CWD              string
	InputTokens      int64
	OutputTokens     int64
	CacheReadTokens  int64
	CacheWriteTokens int64
	TurnCount        int64
	ToolCallCount    int64
}

func ScanClaudeHourlyUsage(ctx context.Context, input ScanInput) ([]HourlyUsageRow, error) {
	files, err := listClaudeTranscriptFiles(input.SessionRoot, input)
	if err != nil {
		return nil, err
	}
	buckets := make(map[hourlyKey]*hourlyAccumulator)
	for _, transcriptFile := range files {
		if err := scanClaudeTranscriptFile(ctx, transcriptFile, input, input.Worktrees, buckets); err != nil {
			return nil, err
		}
	}
	return materializeHourlyRows(buckets, input), nil
}

func listClaudeTranscriptFiles(sessionRoot string, input ScanInput) ([]string, error) {
	roots, err := resolveClaudeRoots(sessionRoot)
	if err != nil {
		return nil, err
	}
	files := make([]string, 0, 256)
	seen := make(map[string]struct{})
	for _, root := range roots {
		err := filepath.WalkDir(root, func(path string, entry os.DirEntry, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}
			if entry.IsDir() {
				return nil
			}
			if !strings.HasSuffix(entry.Name(), ".jsonl") {
				return nil
			}
			if !shouldScanFileWithModTime(path, input) {
				return nil
			}
			if _, exists := seen[path]; exists {
				return nil
			}
			seen[path] = struct{}{}
			files = append(files, path)
			return nil
		})
		if err != nil && !os.IsNotExist(err) {
			return nil, fmt.Errorf("walk claude transcript root %q: %w", root, err)
		}
	}
	sort.Strings(files)
	return files, nil
}

func resolveClaudeRoots(sessionRoot string) ([]string, error) {
	if strings.TrimSpace(sessionRoot) != "" {
		return []string{sessionRoot}, nil
	}
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("resolve user home dir: %w", err)
	}
	return []string{
		filepath.Join(homeDir, ".claude", "projects"),
		filepath.Join(homeDir, ".claude", "transcripts"),
	}, nil
}

func scanClaudeTranscriptFile(
	ctx context.Context,
	transcriptFile string,
	input ScanInput,
	worktrees []WorktreeRef,
	buckets map[hourlyKey]*hourlyAccumulator,
) error {
	fileHandle, err := os.Open(transcriptFile)
	if err != nil {
		return fmt.Errorf("open claude transcript file %q: %w", transcriptFile, err)
	}
	defer fileHandle.Close()

	fallbackSessionID := strings.TrimSuffix(filepath.Base(transcriptFile), ".jsonl")
	scanner := bufio.NewScanner(fileHandle)
	scanner.Buffer(make([]byte, 0, 64*1024), maxTokenUsageScanLineBytes)
	for scanner.Scan() {
		if err := ctx.Err(); err != nil {
			return err
		}
		activity, ok := parseClaudeActivity(scanner.Bytes(), fallbackSessionID)
		if !ok {
			continue
		}
		if isBeforeScanWindow(activity.Timestamp, input) {
			continue
		}
		workspace, confidence := resolveWorktree(activity.CWD, worktrees)
		key := makeClaudeHourlyKey(activity.Timestamp, activity.Model, workspace, confidence, transcriptFile)
		acc := getAccumulator(buckets, key)
		if activity.Kind == claudeActivityAssistantUsage {
			delta := codexUsage{
				InputTokens:       activity.InputTokens,
				OutputTokens:      activity.OutputTokens,
				CachedInputTokens: activity.CacheReadTokens,
				CachedWriteTokens: activity.CacheWriteTokens,
				ReasoningTokens:   0,
				TotalTokens:       activity.InputTokens + activity.OutputTokens,
			}
			if delta.TotalTokens <= 0 {
				continue
			}
			accumulateDelta(acc, delta, activity.SessionID)
			if activity.ToolCallCount > 0 {
				accumulateEngagementCounts(acc, activity.SessionID, 0, activity.ToolCallCount)
			}
			continue
		}
		accumulateEngagementCounts(acc, activity.SessionID, activity.TurnCount, activity.ToolCallCount)
	}
	if err := scanner.Err(); err != nil {
		return fmt.Errorf("scan claude transcript file %q: %w", transcriptFile, err)
	}
	return nil
}

type parsedClaudeUsageRecord struct {
	SessionID        string
	Timestamp        time.Time
	Model            string
	CWD              string
	InputTokens      int64
	OutputTokens     int64
	CacheReadTokens  int64
	CacheWriteTokens int64
}

func parseClaudeUsageRecord(rawLine []byte, fallbackSessionID string) (parsedClaudeUsageRecord, bool) {
	var record claudeSourceRecord
	if err := json.Unmarshal(rawLine, &record); err != nil {
		return parsedClaudeUsageRecord{}, false
	}
	if record.Type != "assistant" {
		return parsedClaudeUsageRecord{}, false
	}
	timestamp, err := time.Parse(time.RFC3339Nano, strings.TrimSpace(record.Timestamp))
	if err != nil {
		return parsedClaudeUsageRecord{}, false
	}
	sessionID := strings.TrimSpace(record.SessionID)
	if sessionID == "" {
		sessionID = fallbackSessionID
	}
	if sessionID == "" {
		return parsedClaudeUsageRecord{}, false
	}
	inputTokens := record.Message.Usage.InputTokens
	outputTokens := record.Message.Usage.OutputTokens
	cacheReadTokens := record.Message.Usage.CacheReadTokens
	cacheWriteTokens := record.Message.Usage.CacheWriteTokens
	if inputTokens+outputTokens+cacheReadTokens+cacheWriteTokens <= 0 {
		return parsedClaudeUsageRecord{}, false
	}
	return parsedClaudeUsageRecord{
		SessionID:        sessionID,
		Timestamp:        timestamp,
		Model:            firstNonEmptyModel(record.Message.Model),
		CWD:              strings.TrimSpace(record.CWD),
		InputTokens:      inputTokens,
		OutputTokens:     outputTokens,
		CacheReadTokens:  cacheReadTokens,
		CacheWriteTokens: cacheWriteTokens,
	}, true
}

func parseClaudeActivity(rawLine []byte, fallbackSessionID string) (parsedClaudeActivity, bool) {
	var top map[string]any
	if err := json.Unmarshal(rawLine, &top); err != nil {
		return parsedClaudeActivity{}, false
	}

	lineType := getString(top, "type")
	sessionID := getString(top, "sessionId")
	if sessionID == "" {
		sessionID = fallbackSessionID
	}
	if sessionID == "" {
		return parsedClaudeActivity{}, false
	}
	timestamp, err := time.Parse(time.RFC3339Nano, getString(top, "timestamp"))
	if err != nil {
		return parsedClaudeActivity{}, false
	}
	cwd := strings.TrimSpace(getString(top, "cwd"))

	switch lineType {
	case "assistant":
		record, ok := parseClaudeUsageRecord(rawLine, fallbackSessionID)
		if ok {
			_, toolCalls := parseClaudeAssistantToolUse(top)
			return parsedClaudeActivity{
				Kind:             claudeActivityAssistantUsage,
				SessionID:        record.SessionID,
				Timestamp:        record.Timestamp,
				Model:            record.Model,
				CWD:              record.CWD,
				InputTokens:      record.InputTokens,
				OutputTokens:     record.OutputTokens,
				CacheReadTokens:  record.CacheReadTokens,
				CacheWriteTokens: record.CacheWriteTokens,
				ToolCallCount:    toolCalls,
			}, true
		}
		model, toolCalls := parseClaudeAssistantToolUse(top)
		if toolCalls == 0 {
			return parsedClaudeActivity{}, false
		}
		return parsedClaudeActivity{
			Kind:          claudeActivityToolUse,
			SessionID:     sessionID,
			Timestamp:     timestamp,
			Model:         model,
			CWD:           cwd,
			ToolCallCount: toolCalls,
		}, true
	case "user":
		message, ok := top["message"].(map[string]any)
		if !ok {
			return parsedClaudeActivity{}, false
		}
		text, ok := extractClaudeUserText(message["content"])
		if !ok || shouldSkipClaudeUserText(text) {
			return parsedClaudeActivity{}, false
		}
		return parsedClaudeActivity{
			Kind:      claudeActivityUserTurn,
			SessionID: sessionID,
			Timestamp: timestamp,
			Model:     "unknown",
			CWD:       cwd,
			TurnCount: 1,
		}, true
	case "tool_use":
		return parsedClaudeActivity{
			Kind:          claudeActivityToolUse,
			SessionID:     sessionID,
			Timestamp:     timestamp,
			Model:         "unknown",
			CWD:           cwd,
			ToolCallCount: 1,
		}, true
	default:
		return parsedClaudeActivity{}, false
	}
}

func parseClaudeAssistantToolUse(top map[string]any) (string, int64) {
	message, ok := top["message"].(map[string]any)
	if !ok {
		return "unknown", 0
	}
	content, ok := message["content"].([]any)
	if !ok {
		return firstNonEmptyModel(getString(message, "model")), 0
	}
	var toolCallCount int64
	for _, item := range content {
		entry, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if getString(entry, "type") == "tool_use" {
			toolCallCount++
		}
	}
	return firstNonEmptyModel(getString(message, "model")), toolCallCount
}

func extractClaudeUserText(content any) (string, bool) {
	text, ok := content.(string)
	if !ok {
		return "", false
	}
	trimmed := normalizeInjectedUserText(text)
	return trimmed, trimmed != ""
}

func shouldSkipClaudeUserText(text string) bool {
	trimmed := normalizeInjectedUserText(text)
	if trimmed == "" {
		return true
	}
	return strings.HasPrefix(trimmed, "<turn_aborted>")
}

func normalizeInjectedUserText(text string) string {
	trimmed := strings.TrimSpace(text)
	if strings.HasPrefix(trimmed, "# AGENTS.md instructions for ") {
		closingTagIndex := strings.LastIndex(trimmed, "</INSTRUCTIONS>")
		if closingTagIndex >= 0 {
			trimmed = strings.TrimSpace(trimmed[closingTagIndex+len("</INSTRUCTIONS>"):])
		} else {
			return ""
		}
	}
	return trimmed
}

func firstNonEmptyModel(value string) string {
	if strings.TrimSpace(value) == "" {
		return "unknown"
	}
	return value
}

func makeClaudeHourlyKey(
	timestamp time.Time,
	model string,
	workspace WorktreeRef,
	confidence AttributionConfidence,
	transcriptFile string,
) hourlyKey {
	bucketTime := timestamp.UTC().Truncate(time.Hour)
	return hourlyKey{
		projectID:   workspace.ProjectID,
		workspaceID: workspace.WorkspaceID,
		workspace:   workspace.WorkspacePath,
		agentKind:   claudeAgentKind,
		model:       normalizeModel(model),
		bucket:      bucketTime.UnixMilli(),
		confidence:  confidence,
		sourceKind:  SourceKindJSONL,
		sourceID:    transcriptFile,
	}
}
