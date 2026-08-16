package scanner

import (
	"sort"
	"strings"
	"time"
	"yishan/apps/cli/internal/tokenusage/attribution"
	"yishan/apps/cli/internal/tokenusage/record"
)

type hourlyKey struct {
	projectID   string
	workspaceID string
	workspace   string
	agentKind   string
	model       string
	bucket      int64
	confidence  record.AttributionConfidence
	sourceKind  record.ScannerSourceKind
	sourceID    string
}

type hourlyAccumulator struct {
	InputTokens        int64
	OutputTokens       int64
	CachedInputTokens  int64
	CachedWriteTokens  int64
	ReasoningTokens    int64
	TotalTokens        int64
	TotalCostMicrosUSD int64
	CostSource         record.CostSource
	EventCount         int64
	TurnCount          int64
	ToolCallCount      int64
	Sessions           map[string]struct{}
}

func applyCodexEvent(
	event codexEvent,
	sessionFile string,
	worktrees []record.WorktreeRef,
	states map[string]*codexSessionState,
	buckets map[hourlyKey]*hourlyAccumulator,
) {
	state := getSessionState(states, event.SessionID)
	delta := computeDeltaUsage(event.Usage, state.LastTotals)
	state.LastTotals = &event.Usage
	if delta.TotalTokens <= 0 {
		return
	}
	workspace, confidence := attribution.ResolveWorktree(event.CWD, worktrees)
	key := makeHourlyKey(event, workspace, confidence, sessionFile)
	acc := getAccumulator(buckets, key)
	accumulateDelta(acc, delta, event.SessionID)
}

func applyCodexEngagementEvent(
	event codexEvent,
	sessionFile string,
	worktrees []record.WorktreeRef,
	buckets map[hourlyKey]*hourlyAccumulator,
	turnCount int64,
	toolCallCount int64,
) {
	if event.SessionID == "" || event.Timestamp.IsZero() {
		return
	}
	workspace, confidence := attribution.ResolveWorktree(event.CWD, worktrees)
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
		InputTokens:        maxInt64(current.InputTokens-previous.InputTokens, 0),
		OutputTokens:       maxInt64(current.OutputTokens-previous.OutputTokens, 0),
		CachedInputTokens:  maxInt64(current.CachedInputTokens-previous.CachedInputTokens, 0),
		CachedWriteTokens:  maxInt64(current.CachedWriteTokens-previous.CachedWriteTokens, 0),
		ReasoningTokens:    maxInt64(current.ReasoningTokens-previous.ReasoningTokens, 0),
		TotalTokens:        maxInt64(current.TotalTokens-previous.TotalTokens, 0),
		TotalCostMicrosUSD: maxInt64(current.TotalCostMicrosUSD-previous.TotalCostMicrosUSD, 0),
		CostSource:         current.CostSource,
	}
}

func makeHourlyKey(
	event codexEvent,
	workspace record.WorktreeRef,
	confidence record.AttributionConfidence,
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
		sourceKind:  record.SourceKindJSONL,
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
	acc.TotalCostMicrosUSD += delta.TotalCostMicrosUSD
	if record.CostSourcePriority(delta.CostSource) > record.CostSourcePriority(acc.CostSource) {
		acc.CostSource = delta.CostSource
	}
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

func materializeHourlyRows(buckets map[hourlyKey]*hourlyAccumulator, input ScanInput) []record.UsageRecord {
	rows := make([]record.UsageRecord, 0, len(buckets))
	for key, acc := range buckets {
		rows = append(rows, record.UsageRecord{
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
			TotalCostMicrosUSD:    acc.TotalCostMicrosUSD,
			CostSource:            record.NormalizedCostSource(acc.CostSource),
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
