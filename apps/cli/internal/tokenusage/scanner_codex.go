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

const codexAgentKind = agentkind.Codex
const maxTokenUsageScanLineBytes = 16 * 1024 * 1024

type codexUsage struct {
	InputTokens       int64
	OutputTokens      int64
	CachedInputTokens int64
	CachedWriteTokens int64
	ReasoningTokens   int64
	TotalTokens       int64
}

type codexEvent struct {
	SessionID string
	Model     string
	CWD       string
	Timestamp time.Time
	Usage     codexUsage
}

type codexSessionState struct {
	LastTotals *codexUsage
}

type hourlyKey struct {
	projectID   string
	workspaceID string
	workspace   string
	agentKind   string
	model       string
	bucket      int64
	confidence  AttributionConfidence
	sourceKind  ScannerSourceKind
	sourceID    string
}

type hourlyAccumulator struct {
	InputTokens       int64
	OutputTokens      int64
	CachedInputTokens int64
	CachedWriteTokens int64
	ReasoningTokens   int64
	TotalTokens       int64
	EventCount        int64
	TurnCount         int64
	ToolCallCount     int64
	Sessions          map[string]struct{}
}

func ScanCodexHourlyUsage(ctx context.Context, input ScanInput) ([]HourlyUsageRow, error) {
	files, err := listCodexSessionFiles(input.SessionRoot, input)
	if err != nil {
		return nil, err
	}
	buckets := make(map[hourlyKey]*hourlyAccumulator)
	states := make(map[string]*codexSessionState)
	for _, sessionFile := range files {
		if err := scanCodexSessionFile(ctx, sessionFile, input, input.Worktrees, states, buckets); err != nil {
			return nil, err
		}
	}
	return materializeHourlyRows(buckets, input), nil
}

func listCodexSessionFiles(sessionRoot string, input ScanInput) ([]string, error) {
	resolvedRoot, err := resolveCodexSessionRoot(sessionRoot)
	if err != nil {
		return nil, err
	}
	files := make([]string, 0, 128)
	err = filepath.WalkDir(resolvedRoot, func(path string, d os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if d.IsDir() {
			return nil
		}
		if strings.HasSuffix(d.Name(), ".jsonl") {
			if !shouldScanFileWithModTime(path, input) {
				return nil
			}
			files = append(files, path)
		}
		return nil
	})
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("walk codex session root %q: %w", resolvedRoot, err)
	}
	sort.Strings(files)
	return files, nil
}

func resolveCodexSessionRoot(sessionRoot string) (string, error) {
	if strings.TrimSpace(sessionRoot) != "" {
		return sessionRoot, nil
	}
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolve user home dir: %w", err)
	}
	return filepath.Join(homeDir, ".codex", "sessions"), nil
}

func scanCodexSessionFile(
	ctx context.Context,
	sessionFile string,
	input ScanInput,
	worktrees []WorktreeRef,
	states map[string]*codexSessionState,
	buckets map[hourlyKey]*hourlyAccumulator,
) error {
	fileHandle, err := os.Open(sessionFile)
	if err != nil {
		return fmt.Errorf("open codex session file %q: %w", sessionFile, err)
	}
	defer fileHandle.Close()

	var currentSessionID string
	var currentCWD string
	var currentModel string

	scanner := bufio.NewScanner(fileHandle)
	scanner.Buffer(make([]byte, 0, 64*1024), maxTokenUsageScanLineBytes)
	for scanner.Scan() {
		if err := ctx.Err(); err != nil {
			return err
		}
		line := parseCodexLine(scanner.Bytes())
		switch line.kind {
		case codexLineSessionMeta:
			if line.sessionID != "" {
				currentSessionID = line.sessionID
			}
			if line.cwd != "" {
				currentCWD = line.cwd
			}
		case codexLineTurnContext:
			if line.cwd != "" {
				currentCWD = line.cwd
			}
			if line.model != "" {
				currentModel = line.model
			}
			if line.text != "" {
				applyCodexEngagementEvent(codexEvent{
					SessionID: currentSessionID,
					Model:     currentModel,
					CWD:       currentCWD,
					Timestamp: line.timestamp,
				}, sessionFile, worktrees, buckets, 1, 0)
			}
		case codexLineTokenCount:
			model := currentModel
			if model == "" {
				model = "unknown"
			}
			event := codexEvent{
				SessionID: currentSessionID,
				Model:     model,
				CWD:       currentCWD,
				Timestamp: line.timestamp,
				Usage:     line.usage,
			}
			if event.SessionID == "" {
				continue
			}
			if isBeforeScanWindow(event.Timestamp, input) {
				state := getSessionState(states, event.SessionID)
				state.LastTotals = &event.Usage
				continue
			}
			applyCodexEvent(event, sessionFile, worktrees, states, buckets)
		default:
			if line.toolCalls > 0 {
				applyCodexEngagementEvent(codexEvent{
					SessionID: currentSessionID,
					Model:     currentModel,
					CWD:       currentCWD,
					Timestamp: line.timestamp,
				}, sessionFile, worktrees, buckets, 0, line.toolCalls)
			}
		}
	}
	if err := scanner.Err(); err != nil {
		return fmt.Errorf("scan codex session file %q: %w", sessionFile, err)
	}
	return nil
}

type codexLineKind int

const (
	codexLineOther codexLineKind = iota
	codexLineSessionMeta
	codexLineTurnContext
	codexLineTokenCount
)

type codexParsedLine struct {
	kind      codexLineKind
	sessionID string
	cwd       string
	model     string
	timestamp time.Time
	usage     codexUsage
	text      string
	toolCalls int64
}

func parseCodexLine(rawLine []byte) codexParsedLine {
	var top map[string]any
	if err := json.Unmarshal(rawLine, &top); err != nil {
		return codexParsedLine{}
	}
	nested, _ := top["payload"].(map[string]any)
	if nested == nil {
		return codexParsedLine{}
	}

	lineType := getString(top, "type")
	switch lineType {
	case "session_meta":
		return codexParsedLine{
			kind:      codexLineSessionMeta,
			sessionID: getString(nested, "id"),
			cwd:       cleanCWDPath(getString(nested, "cwd")),
		}
	case "turn_context":
		return codexParsedLine{
			kind:      codexLineTurnContext,
			cwd:       cleanCWDPath(getString(nested, "cwd")),
			model:     getString(nested, "model"),
			timestamp: mustParseCodexTimestamp(getString(top, "timestamp")),
			text:      getCodexUserInputText(top),
		}
	case "event_msg":
		if getString(nested, "type") != "token_count" {
			return codexParsedLine{}
		}
		eventTime, ok := parseTimestamp(getString(top, "timestamp"))
		if !ok {
			return codexParsedLine{}
		}
		tokenInfo, _ := nested["info"].(map[string]any)
		usage, ok := parseCodexTokenUsage(tokenInfo)
		if !ok {
			return codexParsedLine{}
		}
		return codexParsedLine{
			kind:      codexLineTokenCount,
			timestamp: eventTime,
			usage:     usage,
		}
	default:
		if lineType == "response_item" {
			return parseCodexResponseItem(top)
		}
		return codexParsedLine{}
	}
}

func parseCodexResponseItem(top map[string]any) codexParsedLine {
	payload, _ := top["payload"].(map[string]any)
	if payload == nil {
		return codexParsedLine{}
	}
	eventTime, ok := parseTimestamp(getString(top, "timestamp"))
	if !ok {
		return codexParsedLine{}
	}
	switch getString(payload, "type") {
	case "message":
		if getString(payload, "role") != "user" {
			return codexParsedLine{}
		}
		text := getCodexInputTextFromContent(payload["content"])
		if shouldSkipCodexUserText(text) {
			return codexParsedLine{}
		}
		return codexParsedLine{
			kind:      codexLineTurnContext,
			timestamp: eventTime,
			text:      text,
		}
	case "function_call", "custom_tool_call":
		return codexParsedLine{kind: codexLineOther, timestamp: eventTime, toolCalls: 1}
	default:
		return codexParsedLine{}
	}
}

func getCodexUserInputText(top map[string]any) string {
	payload, _ := top["payload"].(map[string]any)
	if payload == nil {
		return ""
	}
	text := getCodexInputTextFromContent(payload["content"])
	if shouldSkipCodexUserText(text) {
		return ""
	}
	return text
}

func getCodexInputTextFromContent(content any) string {
	items, ok := content.([]any)
	if !ok {
		return ""
	}
	for _, item := range items {
		entry, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if getString(entry, "type") == "input_text" {
			return normalizeInjectedUserText(getString(entry, "text"))
		}
	}
	return ""
}

func shouldSkipCodexUserText(text string) bool {
	trimmed := normalizeInjectedUserText(text)
	if trimmed == "" {
		return true
	}
	return strings.HasPrefix(trimmed, "<turn_aborted>")
}

func mustParseCodexTimestamp(rawTime string) time.Time {
	timestamp, ok := parseTimestamp(rawTime)
	if !ok {
		return time.Time{}
	}
	return timestamp
}

func parseTimestamp(rawTime string) (time.Time, bool) {
	if rawTime == "" {
		return time.Time{}, false
	}
	parsed, err := time.Parse(time.RFC3339Nano, rawTime)
	if err != nil {
		return time.Time{}, false
	}
	return parsed, true
}

func parseCodexTokenUsage(info map[string]any) (codexUsage, bool) {
	totalUsage, totalOK := usageFromAny(info["total_token_usage"])
	if !totalOK {
		totalUsage, totalOK = usageFromAny(info["usage"])
	}
	if !totalOK {
		return codexUsage{}, false
	}
	lastUsage, _ := usageFromAny(info["last_token_usage"])
	if lastUsage.TotalTokens > 0 {
		return lastUsage, true
	}
	return totalUsage, true
}

func usageFromAny(value any) (codexUsage, bool) {
	record, ok := value.(map[string]any)
	if !ok {
		return codexUsage{}, false
	}
	input := getInt64(record, "input_tokens")
	output := getInt64(record, "output_tokens")
	cachedInput := getInt64(record, "cached_input_tokens", "cache_read_input_tokens")
	cachedWrite := getInt64(record, "cached_output_tokens", "cache_creation_output_tokens", "cache_creation_input_tokens")
	reasoning := getInt64(record, "reasoning_output_tokens")
	total := getInt64(record, "total_tokens")
	return codexUsage{InputTokens: input, OutputTokens: output, CachedInputTokens: cachedInput, CachedWriteTokens: cachedWrite, ReasoningTokens: reasoning, TotalTokens: total}, true
}

func cleanCWDPath(cwd string) string {
	if cwd == "" {
		return ""
	}
	cleaned := filepath.Clean(cwd)
	if cleaned == "." {
		return ""
	}
	return cleaned
}

func applyCodexEvent(
	event codexEvent,
	sessionFile string,
	worktrees []WorktreeRef,
	states map[string]*codexSessionState,
	buckets map[hourlyKey]*hourlyAccumulator,
) {
	state := getSessionState(states, event.SessionID)
	delta := computeDeltaUsage(event.Usage, state.LastTotals)
	state.LastTotals = &event.Usage
	if delta.TotalTokens <= 0 {
		return
	}
	workspace, confidence := resolveWorktree(event.CWD, worktrees)
	key := makeHourlyKey(event, workspace, confidence, sessionFile)
	acc := getAccumulator(buckets, key)
	accumulateDelta(acc, delta, event.SessionID)
}

func applyCodexEngagementEvent(
	event codexEvent,
	sessionFile string,
	worktrees []WorktreeRef,
	buckets map[hourlyKey]*hourlyAccumulator,
	turnCount int64,
	toolCallCount int64,
) {
	if event.SessionID == "" || event.Timestamp.IsZero() {
		return
	}
	workspace, confidence := resolveWorktree(event.CWD, worktrees)
	key := makeHourlyKey(event, workspace, confidence, sessionFile)
	acc := getAccumulator(buckets, key)
	accumulateEngagementCounts(acc, event.SessionID, turnCount, toolCallCount)
}

func getSessionState(states map[string]*codexSessionState, sessionID string) *codexSessionState {
	state, ok := states[sessionID]
	if ok {
		return state
	}
	state = &codexSessionState{}
	states[sessionID] = state
	return state
}

func computeDeltaUsage(current codexUsage, previous *codexUsage) codexUsage {
	if previous == nil {
		return current
	}
	return codexUsage{
		InputTokens:       maxInt64(current.InputTokens-previous.InputTokens, 0),
		OutputTokens:      maxInt64(current.OutputTokens-previous.OutputTokens, 0),
		CachedInputTokens: maxInt64(current.CachedInputTokens-previous.CachedInputTokens, 0),
		CachedWriteTokens: maxInt64(current.CachedWriteTokens-previous.CachedWriteTokens, 0),
		ReasoningTokens:   maxInt64(current.ReasoningTokens-previous.ReasoningTokens, 0),
		TotalTokens:       maxInt64(current.TotalTokens-previous.TotalTokens, 0),
	}
}

func resolveWorktree(cwd string, worktrees []WorktreeRef) (WorktreeRef, AttributionConfidence) {
	if cwd == "" {
		return unknownWorktree(), AttributionFallbackUnknown
	}
	normalizedCWD := normalizeComparablePath(cwd)
	longest := -1
	selected := unknownWorktree()
	selectedConfidence := AttributionFallbackUnknown
	for _, worktree := range worktrees {
		if match, exact := matchWorktree(normalizedCWD, worktree.WorkspacePath); match {
			if len(worktree.WorkspacePath) > longest {
				longest = len(worktree.WorkspacePath)
				selected = worktree
				selectedConfidence = AttributionPrefixMatch
				if exact {
					selectedConfidence = AttributionExact
				}
			}
		}
	}
	return selected, selectedConfidence
}

func unknownWorktree() WorktreeRef {
	return WorktreeRef{ProjectID: "unknown", WorkspaceID: "unknown", WorkspacePath: ""}
}

func matchWorktree(normalizedCWD string, workspacePath string) (bool, bool) {
	normalizedWorkspace := normalizeComparablePath(workspacePath)
	if normalizedWorkspace == "" {
		return false, false
	}
	if normalizedCWD == normalizedWorkspace {
		return true, true
	}
	if strings.HasPrefix(normalizedCWD, normalizedWorkspace+"/") {
		return true, false
	}
	return false, false
}

func normalizeComparablePath(pathValue string) string {
	normalized := filepath.ToSlash(filepath.Clean(pathValue))
	if normalized == "." {
		return ""
	}
	return strings.ToLower(normalized)
}

func makeHourlyKey(
	event codexEvent,
	workspace WorktreeRef,
	confidence AttributionConfidence,
	sessionFile string,
) hourlyKey {
	bucketTime := event.Timestamp.UTC().Truncate(time.Hour)
	return hourlyKey{
		projectID:   workspace.ProjectID,
		workspaceID: workspace.WorkspaceID,
		workspace:   workspace.WorkspacePath,
		agentKind:   codexAgentKind,
		model:       normalizeModel(event.Model),
		bucket:      bucketTime.UnixMilli(),
		confidence:  confidence,
		sourceKind:  SourceKindJSONL,
		sourceID:    sessionFile,
	}
}

func normalizeModel(model string) string {
	trimmed := strings.TrimSpace(strings.ToLower(model))
	if trimmed == "" {
		return "unknown"
	}
	return trimmed
}

func getAccumulator(buckets map[hourlyKey]*hourlyAccumulator, key hourlyKey) *hourlyAccumulator {
	acc, ok := buckets[key]
	if ok {
		return acc
	}
	acc = &hourlyAccumulator{Sessions: map[string]struct{}{}}
	buckets[key] = acc
	return acc
}

func accumulateDelta(acc *hourlyAccumulator, delta codexUsage, sessionID string) {
	acc.InputTokens += delta.InputTokens
	acc.OutputTokens += delta.OutputTokens
	acc.CachedInputTokens += delta.CachedInputTokens
	acc.CachedWriteTokens += delta.CachedWriteTokens
	acc.ReasoningTokens += delta.ReasoningTokens
	acc.TotalTokens += delta.TotalTokens
	acc.EventCount++
	acc.Sessions[sessionID] = struct{}{}
}

func accumulateEngagementCounts(
	acc *hourlyAccumulator,
	sessionID string,
	turnCount int64,
	toolCallCount int64,
) {
	acc.TurnCount += turnCount
	acc.ToolCallCount += toolCallCount
	if strings.TrimSpace(sessionID) != "" {
		acc.Sessions[sessionID] = struct{}{}
	}
}

func materializeHourlyRows(buckets map[hourlyKey]*hourlyAccumulator, input ScanInput) []HourlyUsageRow {
	rows := make([]HourlyUsageRow, 0, len(buckets))
	for key, acc := range buckets {
		rows = append(rows, HourlyUsageRow{
			ProjectID:             key.projectID,
			WorkspaceID:           key.workspaceID,
			WorkspacePath:         key.workspace,
			AgentKind:             key.agentKind,
			Model:                 key.model,
			ModelNormalized:       key.model,
			BucketStartHourUTC:    key.bucket,
			InputTokens:           acc.InputTokens,
			OutputTokens:          acc.OutputTokens,
			CachedInputTokens:     acc.CachedInputTokens,
			CachedWriteTokens:     acc.CachedWriteTokens,
			ReasoningTokens:       acc.ReasoningTokens,
			TotalTokens:           acc.TotalTokens,
			EventCount:            acc.EventCount,
			SessionCount:          int64(len(acc.Sessions)),
			TurnCount:             acc.TurnCount,
			ToolCallCount:         acc.ToolCallCount,
			AttributionConfidence: key.confidence,
			ScannerSourceKind:     key.sourceKind,
			ScannerSourceID:       key.sourceID,
			IngestedAt:            input.IngestedAt,
			RunID:                 input.RunID,
			UpdatedAt:             input.IngestedAt,
		})
	}
	sort.Slice(rows, func(i, j int) bool {
		return rows[i].BucketStartHourUTC < rows[j].BucketStartHourUTC
	})
	return rows
}

func getString(record map[string]any, keys ...string) string {
	for _, key := range keys {
		value, ok := record[key]
		if !ok {
			continue
		}
		asString, ok := value.(string)
		if ok && strings.TrimSpace(asString) != "" {
			return strings.TrimSpace(asString)
		}
	}
	return ""
}

func getInt64(record map[string]any, keys ...string) int64 {
	for _, key := range keys {
		value, ok := record[key]
		if !ok {
			continue
		}
		number, ok := value.(float64)
		if ok {
			return int64(number)
		}
	}
	return 0
}

func maxInt64(left int64, right int64) int64 {
	if left > right {
		return left
	}
	return right
}
