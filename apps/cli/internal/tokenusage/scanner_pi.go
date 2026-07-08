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
	"yishan/apps/cli/internal/config"
)

const piAgentKind = agentkind.Pi

type piActivityKind int

const (
	piActivityNone piActivityKind = iota
	piActivityAssistantUsage
	piActivityUserTurn
	piActivityToolUse
)

type piParsedActivity struct {
	Kind             piActivityKind
	SessionID        string
	Timestamp        time.Time
	Model            string
	CWD              string
	InputTokens      int64
	OutputTokens     int64
	CacheReadTokens  int64
	CacheWriteTokens int64
	TotalTokens      int64
	TurnCount        int64
	ToolCallCount    int64
}

// ScanPiHourlyUsage scans PI session JSONL files and materializes hourly usage rows.
func ScanPiHourlyUsage(ctx context.Context, input ScanInput) ([]HourlyUsageRow, error) {
	files, err := listPiSessionFiles(input.SessionRoot, input)
	if err != nil {
		return nil, err
	}
	buckets := make(map[hourlyKey]*hourlyAccumulator)
	for _, sessionFile := range files {
		if err := scanPiSessionFile(ctx, sessionFile, input, input.Worktrees, buckets); err != nil {
			return nil, err
		}
	}
	return materializeHourlyRows(buckets, input), nil
}

func listPiSessionFiles(sessionRoot string, input ScanInput) ([]string, error) {
	resolvedRoot, err := resolvePiSessionRoot(sessionRoot)
	if err != nil {
		return nil, err
	}
	files := make([]string, 0, 128)
	err = filepath.WalkDir(resolvedRoot, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			return nil
		}
		if !strings.HasSuffix(entry.Name(), ".jsonl") || !shouldScanFileWithModTime(path, input) {
			return nil
		}
		files = append(files, path)
		return nil
	})
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("walk pi session root %q: %w", resolvedRoot, err)
	}
	sort.Strings(files)
	return files, nil
}

func resolvePiSessionRoot(sessionRoot string) (string, error) {
	if strings.TrimSpace(sessionRoot) != "" {
		return sessionRoot, nil
	}
	managedRoot, err := config.ManagedPiSessionsDir()
	if err != nil {
		return "", fmt.Errorf("resolve managed pi session root: %w", err)
	}
	if _, err := os.Stat(managedRoot); err == nil || !os.IsNotExist(err) {
		return managedRoot, nil
	}
	legacyRoot, err := resolveLegacyPiSessionRoot()
	if err != nil {
		return "", err
	}
	if _, err := os.Stat(legacyRoot); err == nil {
		return legacyRoot, nil
	}
	return managedRoot, nil
}

func resolveLegacyPiSessionRoot() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolve user home dir: %w", err)
	}
	return filepath.Join(homeDir, ".pi", "agent", "sessions"), nil
}

func scanPiSessionFile(
	ctx context.Context,
	sessionFile string,
	input ScanInput,
	worktrees []WorktreeRef,
	buckets map[hourlyKey]*hourlyAccumulator,
) error {
	fileHandle, err := os.Open(sessionFile)
	if err != nil {
		return fmt.Errorf("open pi session file %q: %w", sessionFile, err)
	}
	defer fileHandle.Close()

	fallbackSessionID := piFallbackSessionID(sessionFile)
	currentSessionID := fallbackSessionID
	currentCWD := ""
	currentModel := "unknown"

	scanner := bufio.NewScanner(fileHandle)
	scanner.Buffer(make([]byte, 0, 64*1024), maxTokenUsageScanLineBytes)
	for scanner.Scan() {
		if err := ctx.Err(); err != nil {
			return err
		}
		activity, nextSessionID, nextCWD, nextModel := parsePiLine(
			scanner.Bytes(),
			currentSessionID,
			currentCWD,
			currentModel,
			fallbackSessionID,
		)
		if nextSessionID != "" {
			currentSessionID = nextSessionID
		}
		if nextCWD != "" {
			currentCWD = nextCWD
		}
		if nextModel != "" {
			currentModel = nextModel
		}
		if activity.Kind == piActivityNone || isBeforeScanWindow(activity.Timestamp, input) {
			continue
		}
		applyPiActivity(activity, sessionFile, worktrees, buckets)
	}
	if err := scanner.Err(); err != nil {
		return fmt.Errorf("scan pi session file %q: %w", sessionFile, err)
	}
	return nil
}

func piFallbackSessionID(sessionFile string) string {
	baseName := strings.TrimSuffix(filepath.Base(sessionFile), ".jsonl")
	separatorIndex := strings.LastIndex(baseName, "_")
	if separatorIndex < 0 || separatorIndex == len(baseName)-1 {
		return baseName
	}
	return strings.TrimSpace(baseName[separatorIndex+1:])
}

func parsePiLine(
	rawLine []byte,
	currentSessionID string,
	currentCWD string,
	currentModel string,
	fallbackSessionID string,
) (piParsedActivity, string, string, string) {
	var top map[string]any
	if err := json.Unmarshal(rawLine, &top); err != nil {
		return piParsedActivity{}, "", "", ""
	}

	lineType := getString(top, "type")
	switch lineType {
	case "session":
		return piParsedActivity{}, firstNonEmptyPiValue(getString(top, "id", "sessionId", "session_id")), cleanCWDPath(getString(top, "cwd")), ""
	case "model_change":
		return piParsedActivity{}, "", "", strings.TrimSpace(getString(top, "modelId", "model"))
	case "message":
		activity, ok := parsePiMessageActivity(top, currentSessionID, currentCWD, currentModel, fallbackSessionID)
		if !ok {
			return piParsedActivity{}, "", "", ""
		}
		return activity, "", "", ""
	default:
		return piParsedActivity{}, "", "", ""
	}
}

func parsePiMessageActivity(
	top map[string]any,
	currentSessionID string,
	currentCWD string,
	currentModel string,
	fallbackSessionID string,
) (piParsedActivity, bool) {
	message, ok := top["message"].(map[string]any)
	if !ok {
		return piParsedActivity{}, false
	}
	timestamp, ok := parseTimestamp(getString(top, "timestamp"))
	if !ok {
		return piParsedActivity{}, false
	}
	sessionID := firstNonEmptyPiValue(currentSessionID, fallbackSessionID)
	if sessionID == "" {
		return piParsedActivity{}, false
	}
	cwd := firstNonEmptyPiValue(cleanCWDPath(getString(top, "cwd")), currentCWD)
	model := firstNonEmptyPiValue(getString(message, "model"), currentModel)
	if strings.TrimSpace(model) == "" {
		model = "unknown"
	}

	switch getString(message, "role") {
	case "assistant":
		usage, hasUsage := parsePiUsage(message["usage"])
		toolCalls := countPiAssistantToolCalls(message["content"])
		if hasUsage {
			return piParsedActivity{
				Kind:             piActivityAssistantUsage,
				SessionID:        sessionID,
				Timestamp:        timestamp,
				Model:            model,
				CWD:              cwd,
				InputTokens:      usage.InputTokens,
				OutputTokens:     usage.OutputTokens,
				CacheReadTokens:  usage.CachedInputTokens,
				CacheWriteTokens: usage.CachedWriteTokens,
				TotalTokens:      usage.TotalTokens,
				ToolCallCount:    toolCalls,
			}, true
		}
		if toolCalls == 0 {
			return piParsedActivity{}, false
		}
		return piParsedActivity{
			Kind:          piActivityToolUse,
			SessionID:     sessionID,
			Timestamp:     timestamp,
			Model:         model,
			CWD:           cwd,
			ToolCallCount: toolCalls,
		}, true
	case "user":
		text, ok := extractPiUserText(message["content"])
		if !ok || shouldSkipClaudeUserText(text) {
			return piParsedActivity{}, false
		}
		return piParsedActivity{
			Kind:      piActivityUserTurn,
			SessionID: sessionID,
			Timestamp: timestamp,
			Model:     model,
			CWD:       cwd,
			TurnCount: 1,
		}, true
	default:
		return piParsedActivity{}, false
	}
}

func firstNonEmptyPiValue(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func parsePiUsage(value any) (codexUsage, bool) {
	record, ok := value.(map[string]any)
	if !ok {
		return codexUsage{}, false
	}
	inputTokens := getInt64(record, "input")
	outputTokens := getInt64(record, "output")
	cacheReadTokens := getInt64(record, "cacheRead")
	cacheWriteTokens := getInt64(record, "cacheWrite")
	normalizedInputTokens := inputTokens + cacheReadTokens + cacheWriteTokens
	totalTokens := getInt64(record, "totalTokens")
	if totalTokens <= 0 {
		totalTokens = normalizedInputTokens + outputTokens
	}
	if totalTokens <= 0 {
		return codexUsage{}, false
	}
	return codexUsage{
		InputTokens:       normalizedInputTokens,
		OutputTokens:      outputTokens,
		CachedInputTokens: cacheReadTokens,
		CachedWriteTokens: cacheWriteTokens,
		TotalTokens:       totalTokens,
	}, true
}

func countPiAssistantToolCalls(content any) int64 {
	items, ok := content.([]any)
	if !ok {
		return 0
	}
	var toolCallCount int64
	for _, item := range items {
		entry, ok := item.(map[string]any)
		if ok && getString(entry, "type") == "toolCall" {
			toolCallCount++
		}
	}
	return toolCallCount
}

func extractPiUserText(content any) (string, bool) {
	if text, ok := content.(string); ok {
		trimmed := normalizeInjectedUserText(text)
		return trimmed, trimmed != ""
	}
	items, ok := content.([]any)
	if !ok {
		return "", false
	}
	parts := make([]string, 0, len(items))
	for _, item := range items {
		entry, ok := item.(map[string]any)
		if !ok || getString(entry, "type") != "text" {
			continue
		}
		text := normalizeInjectedUserText(getString(entry, "text"))
		if text != "" {
			parts = append(parts, text)
		}
	}
	combined := strings.TrimSpace(strings.Join(parts, "\n"))
	return combined, combined != ""
}

func applyPiActivity(
	activity piParsedActivity,
	sessionFile string,
	worktrees []WorktreeRef,
	buckets map[hourlyKey]*hourlyAccumulator,
) {
	workspace, confidence := resolveWorktree(activity.CWD, worktrees)
	key := makePiHourlyKey(activity.Timestamp, activity.Model, workspace, confidence, sessionFile)
	acc := getAccumulator(buckets, key)
	if activity.Kind == piActivityAssistantUsage {
		accumulateDelta(acc, codexUsage{
			InputTokens:       activity.InputTokens,
			OutputTokens:      activity.OutputTokens,
			CachedInputTokens: activity.CacheReadTokens,
			CachedWriteTokens: activity.CacheWriteTokens,
			TotalTokens:       activity.TotalTokens,
		}, activity.SessionID)
		if activity.ToolCallCount > 0 {
			accumulateEngagementCounts(acc, activity.SessionID, 0, activity.ToolCallCount)
		}
		return
	}
	accumulateEngagementCounts(acc, activity.SessionID, activity.TurnCount, activity.ToolCallCount)
}

func makePiHourlyKey(
	timestamp time.Time,
	model string,
	workspace WorktreeRef,
	confidence AttributionConfidence,
	sessionFile string,
) hourlyKey {
	bucketTime := timestamp.UTC().Truncate(time.Hour)
	return hourlyKey{
		projectID:   workspace.ProjectID,
		workspaceID: workspace.WorkspaceID,
		workspace:   workspace.WorkspacePath,
		agentKind:   piAgentKind,
		model:       normalizeModel(model),
		bucket:      bucketTime.UnixMilli(),
		confidence:  confidence,
		sourceKind:  SourceKindJSONL,
		sourceID:    sessionFile,
	}
}
