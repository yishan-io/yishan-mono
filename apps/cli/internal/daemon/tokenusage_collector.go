package daemon

import (
	"context"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
	"yishan/apps/cli/internal/agentkind"
	"yishan/apps/cli/internal/api"
	cliruntime "yishan/apps/cli/internal/runtime"
	"yishan/apps/cli/internal/tokenusage"
	"yishan/apps/cli/internal/workspace"
)

const (
	tokenUsageStartupDelay = 30 * time.Second
	tokenUsageHookDebounce = 45 * time.Second
	tokenUsageSyncInterval = 15 * time.Minute
	tokenUsageSyncChunk    = 100
	tokenUsageHourLag      = 2 * time.Minute
	tokenUsageScanOverlap  = 2 * time.Hour
)

var tokenUsageScannableAgentKinds = agentkind.WithActiveTokenScanners

type tokenUsageCollector struct {
	mu                   sync.Mutex
	manager              *workspace.Manager
	runtime              *cliruntime.Runtime
	repo                 tokenusage.HourlyUsageRepository
	timers               map[string]*time.Timer
	inFlight             map[string]bool
	needsRerun           map[string]bool
	recoverySinceByAgent map[string]int64
	pending              map[string][]tokenusage.HourlyUsageRow
	syncTimer            *time.Timer
	hourTimer            *time.Timer
	closed               bool
}

type tokenUsageCollectorDebugState struct {
	Closed           bool              `json:"closed"`
	ScheduledAgents  []string          `json:"scheduledAgents"`
	InFlightAgents   []string          `json:"inFlightAgents"`
	NeedsRerunAgents []string          `json:"needsRerunAgents"`
	KnownTimers      map[string]string `json:"knownTimers"`
	PendingAgents    []string          `json:"pendingAgents"`
}

func newTokenUsageCollector(manager *workspace.Manager, runtime *cliruntime.Runtime, configPath string) (*tokenUsageCollector, error) {
	repo, err := tokenusage.NewFileHourlyUsageRepository(configPath)
	if err != nil {
		return nil, err
	}
	return &tokenUsageCollector{
		manager:              manager,
		runtime:              runtime,
		repo:                 repo,
		timers:               make(map[string]*time.Timer),
		inFlight:             make(map[string]bool),
		needsRerun:           make(map[string]bool),
		recoverySinceByAgent: make(map[string]int64),
		pending:              make(map[string][]tokenusage.HourlyUsageRow),
	}, nil
}

func (c *tokenUsageCollector) StartStartupScan() {
	c.startSyncLoop()
	c.startHourRolloverLoop()
	timer := time.AfterFunc(tokenUsageStartupDelay, func() {
		for _, agentKind := range tokenUsageScannableAgentKinds {
			c.Trigger(agentKind, "startup")
		}
	})
	c.mu.Lock()
	if c.closed {
		c.mu.Unlock()
		timer.Stop()
		return
	}
	c.timers["startup"] = timer
	c.mu.Unlock()
}

func (c *tokenUsageCollector) SyncNow(source string) {
	c.mu.Lock()
	if c.closed {
		c.mu.Unlock()
		return
	}
	c.mu.Unlock()

	for _, agentKind := range tokenUsageScannableAgentKinds {
		c.mu.Lock()
		if c.inFlight[agentKind] {
			c.mu.Unlock()
			continue
		}
		if timer := c.timers[agentKind]; timer != nil {
			timer.Stop()
			delete(c.timers, agentKind)
		}
		c.mu.Unlock()
		c.runScan(agentKind, source)
	}
}

func (c *tokenUsageCollector) Trigger(agentKind string, source string) {
	normalizedAgentKind := normalizeTokenUsageAgentKind(agentKind)
	if normalizedAgentKind == "" {
		return
	}

	c.mu.Lock()
	if c.closed {
		c.mu.Unlock()
		return
	}
	if c.inFlight[normalizedAgentKind] {
		c.needsRerun[normalizedAgentKind] = true
		c.mu.Unlock()
		return
	}
	if existingTimer := c.timers[normalizedAgentKind]; existingTimer != nil {
		existingTimer.Stop()
	}
	c.timers[normalizedAgentKind] = time.AfterFunc(tokenUsageHookDebounce, func() {
		c.runScan(normalizedAgentKind, source)
	})
	c.mu.Unlock()
}

func (c *tokenUsageCollector) runScan(agentKind string, source string) {
	scanSinceUnixMilli, shouldRun := c.beginScan(agentKind)
	if !shouldRun {
		return
	}

	startedAt := time.Now()
	rows, err := c.scanAgentSince(agentKind, scanSinceUnixMilli)
	if err == nil {
		rows = c.filterKnownTokenUsageRows(rows)
	}
	if err == nil {
		err = c.repo.ReplaceAgentHourlyRows(context.Background(), agentKind, rows)
	}
	if err != nil {
		log.Warn().Err(err).Str("agentKind", agentKind).Str("source", source).Msg("token usage scan failed")
	} else {
		log.Debug().Str("agentKind", agentKind).Str("source", source).Int("rows", len(rows)).Dur("duration", time.Since(startedAt)).Msg("token usage scan completed")
		c.syncPending("scan")
	}

	shouldRerun, closed := c.finishScan(agentKind, err == nil)
	if shouldRerun && !closed {
		c.Trigger(agentKind, "rerun")
	}
}

func (c *tokenUsageCollector) filterKnownTokenUsageRows(rows []tokenusage.HourlyUsageRow) []tokenusage.HourlyUsageRow {
	workspaceByID := make(map[string]workspace.Workspace)
	for _, ws := range c.manager.List() {
		workspaceByID[ws.ID] = ws
	}

	filtered := make([]tokenusage.HourlyUsageRow, 0, len(rows))
	for _, row := range rows {
		if strings.EqualFold(strings.TrimSpace(row.WorkspaceID), "unknown") {
			continue
		}
		if ws, ok := workspaceByID[row.WorkspaceID]; ok {
			if strings.TrimSpace(row.ProjectID) == "" || strings.EqualFold(strings.TrimSpace(row.ProjectID), "unknown") {
				if strings.TrimSpace(ws.ProjectID) != "" {
					row.ProjectID = ws.ProjectID
				}
			}
			if strings.TrimSpace(row.WorkspacePath) == "" {
				row.WorkspacePath = ws.Path
			}
		}
		filtered = append(filtered, row)
	}
	return filtered
}

func (c *tokenUsageCollector) scanAgent(agentKind string) ([]tokenusage.HourlyUsageRow, error) {
	return c.scanAgentSince(agentKind, c.recentScanStartUnixMilli())
}

func (c *tokenUsageCollector) scanAgentSince(agentKind string, scanSinceUnixMilli int64) ([]tokenusage.HourlyUsageRow, error) {
	scanInput := tokenusage.ScanInput{
		RunID:              "daemon-" + agentKind,
		IngestedAt:         time.Now().UnixMilli(),
		ScanSinceUnixMilli: scanSinceUnixMilli,
		Worktrees:          buildTokenUsageWorktreeRefs(c.manager.List()),
	}
	switch agentKind {
	case agentkind.Codex:
		return tokenusage.ScanCodexHourlyUsage(context.Background(), scanInput)
	case agentkind.Claude:
		return tokenusage.ScanClaudeHourlyUsage(context.Background(), scanInput)
	case agentkind.OpenCode:
		return tokenusage.ScanOpenCodeHourlyUsage(context.Background(), scanInput)
	case agentkind.Gemini:
		return tokenusage.ScanGeminiHourlyUsage(context.Background(), scanInput)
	case agentkind.Pi:
		return tokenusage.ScanPiHourlyUsage(context.Background(), scanInput)
	default:
		return []tokenusage.HourlyUsageRow{}, nil
	}
}

func (c *tokenUsageCollector) recentScanStartUnixMilli() int64 {
	syncState, err := c.repo.GetHourlyUsageSyncState(context.Background())
	if err != nil {
		return 0
	}
	if syncState.LastSuccessfulSyncAt == 0 {
		return 0
	}
	return time.UnixMilli(syncState.LastSuccessfulSyncAt).UTC().Add(-tokenUsageScanOverlap).UnixMilli()
}

func normalizeTokenUsageAgentKind(agentKind string) string {
	normalized := strings.ToLower(strings.TrimSpace(agentKind))
	if isTokenTrackingAgentKind(normalized) {
		return normalized
	}
	return ""
}

func (c *tokenUsageCollector) Close() {
	c.syncPending("shutdown")
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.closed {
		return
	}
	c.closed = true
	for key, timer := range c.timers {
		timer.Stop()
		delete(c.timers, key)
	}
	if c.syncTimer != nil {
		c.syncTimer.Stop()
		c.syncTimer = nil
	}
	if c.hourTimer != nil {
		c.hourTimer.Stop()
		c.hourTimer = nil
	}
}

func (c *tokenUsageCollector) DebugState() tokenUsageCollectorDebugState {
	c.mu.Lock()
	defer c.mu.Unlock()

	scheduledAgents := make([]string, 0, len(c.timers))
	knownTimers := make(map[string]string, len(c.timers))
	for key := range c.timers {
		scheduledAgents = append(scheduledAgents, key)
		if key == "startup" {
			knownTimers[key] = "startup-delay"
		} else {
			knownTimers[key] = "agent-debounce"
		}
	}
	if c.syncTimer != nil {
		knownTimers["periodic-sync"] = tokenUsageSyncInterval.String()
		scheduledAgents = append(scheduledAgents, "periodic-sync")
	}
	if c.hourTimer != nil {
		knownTimers["hour-rollover-sync"] = tokenUsageHourLag.String()
		scheduledAgents = append(scheduledAgents, "hour-rollover-sync")
	}
	sort.Strings(scheduledAgents)

	inFlightAgents := make([]string, 0, len(c.inFlight))
	for key, inFlight := range c.inFlight {
		if inFlight {
			inFlightAgents = append(inFlightAgents, key)
		}
	}
	sort.Strings(inFlightAgents)

	needsRerunAgents := make([]string, 0, len(c.needsRerun))
	for key, needsRerun := range c.needsRerun {
		if needsRerun {
			needsRerunAgents = append(needsRerunAgents, key)
		}
	}
	sort.Strings(needsRerunAgents)

	pendingAgents := make([]string, 0, len(c.pending))
	for key, rows := range c.pending {
		if len(rows) > 0 {
			pendingAgents = append(pendingAgents, key)
		}
	}
	sort.Strings(pendingAgents)

	return tokenUsageCollectorDebugState{
		Closed:           c.closed,
		ScheduledAgents:  scheduledAgents,
		InFlightAgents:   inFlightAgents,
		NeedsRerunAgents: needsRerunAgents,
		KnownTimers:      knownTimers,
		PendingAgents:    pendingAgents,
	}
}

func (c *tokenUsageCollector) startSyncLoop() {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.closed || c.syncTimer != nil {
		return
	}
	c.syncTimer = time.AfterFunc(tokenUsageSyncInterval, c.onPeriodicSync)
}

func (c *tokenUsageCollector) onPeriodicSync() {
	c.syncPending("periodic")
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.closed {
		return
	}
	c.syncTimer = time.AfterFunc(tokenUsageSyncInterval, c.onPeriodicSync)
}

func (c *tokenUsageCollector) startHourRolloverLoop() {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.closed || c.hourTimer != nil {
		return
	}
	c.hourTimer = time.AfterFunc(durationUntilNextHourPlusLag(), c.onHourRolloverSync)
}

func (c *tokenUsageCollector) onHourRolloverSync() {
	c.syncPending("hour-rollover")
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.closed {
		return
	}
	c.hourTimer = time.AfterFunc(durationUntilNextHourPlusLag(), c.onHourRolloverSync)
}

func durationUntilNextHourPlusLag() time.Duration {
	now := time.Now().UTC()
	nextHour := now.Truncate(time.Hour).Add(time.Hour)
	target := nextHour.Add(tokenUsageHourLag)
	return time.Until(target)
}

func (c *tokenUsageCollector) syncPending(source string) {
	if c.runtime == nil || !c.runtime.APIConfigured() {
		return
	}
	syncState, err := c.repo.GetHourlyUsageSyncState(context.Background())
	if err != nil {
		log.Warn().Err(err).Str("source", source).Msg("token usage sync state read failed")
		return
	}
	if syncState.DirtyRows == 0 {
		return
	}

	log.Debug().
		Str("source", source).
		Int("dirtyRows", syncState.DirtyRows).
		Int("totalRows", syncState.TotalRows).
		Str("lastSuccessfulSyncAt", formatTokenUsageSyncTime(syncState.LastSuccessfulSyncAt)).
		Msg("token usage sync starting")

	pendingByOrg, err := c.snapshotDirtyRowsByOrg()
	if err != nil {
		log.Warn().Err(err).Str("source", source).Msg("token usage dirty rows read failed")
		return
	}
	for orgID, rows := range pendingByOrg {
		if strings.TrimSpace(orgID) == "" || strings.EqualFold(orgID, "unknown") {
			continue
		}
		if len(rows) == 0 {
			continue
		}
		syncedAt := time.Now().UnixMilli()
		if err := c.syncRowsForOrg(orgID, rows); err != nil {
			log.Warn().Err(err).
				Str("orgId", orgID).
				Str("source", source).
				Int("rows", len(rows)).
				Str("oldestBucket", formatTokenUsageSyncTime(rows[0].BucketStartHourUTC)).
				Str("newestBucket", formatTokenUsageSyncTime(rows[len(rows)-1].BucketStartHourUTC)).
				Msg("token usage sync failed")
			continue
		}
		if err := c.repo.MarkHourlyRowsSynced(context.Background(), rows, syncedAt); err != nil {
			log.Warn().Err(err).
				Str("orgId", orgID).
				Str("source", source).
				Int("rows", len(rows)).
				Msg("token usage sync mark-clean failed")
			continue
		}
		log.Debug().
			Str("orgId", orgID).
			Str("source", source).
			Int("rows", len(rows)).
			Str("oldestBucket", formatTokenUsageSyncTime(rows[0].BucketStartHourUTC)).
			Str("newestBucket", formatTokenUsageSyncTime(rows[len(rows)-1].BucketStartHourUTC)).
			Str("syncedAt", formatTokenUsageSyncTime(syncedAt)).
			Msg("token usage sync completed")
	}
}

func (c *tokenUsageCollector) snapshotDirtyRowsByOrg() (map[string][]tokenusage.HourlyUsageRow, error) {
	rows, err := c.repo.ListDirtyHourlyRows(context.Background())
	if err != nil {
		return nil, err
	}

	rowsByOrg := make(map[string][]tokenusage.HourlyUsageRow)
	for _, row := range rows {
		if strings.TrimSpace(row.WorkspaceID) == "" {
			continue
		}
		orgID := c.resolveOrgIDForWorkspace(row.WorkspaceID)
		if orgID == "" {
			continue
		}
		rowsByOrg[orgID] = append(rowsByOrg[orgID], row)
	}
	return rowsByOrg, nil
}

func (c *tokenUsageCollector) resolveOrgIDForWorkspace(workspaceID string) string {
	for _, ws := range c.manager.List() {
		if ws.ID == workspaceID {
			return strings.TrimSpace(ws.OrgID)
		}
	}
	return ""
}

func (c *tokenUsageCollector) syncRowsForOrg(orgID string, rows []tokenusage.HourlyUsageRow) error {
	rowInputs := make([]api.TokenUsageHourlyRowInput, 0, len(rows))
	for _, row := range rows {
		rowInputs = append(rowInputs, api.TokenUsageHourlyRowInput{
			ProjectID:             row.ProjectID,
			WorkspaceID:           row.WorkspaceID,
			WorkspacePath:         row.WorkspacePath,
			AgentKind:             row.AgentKind,
			Model:                 row.Model,
			ModelNormalized:       row.ModelNormalized,
			BucketStartHourUTC:    time.UnixMilli(row.BucketStartHourUTC).UTC().Format(time.RFC3339Nano),
			InputTokens:           row.InputTokens,
			OutputTokens:          row.OutputTokens,
			CachedInputTokens:     row.CachedInputTokens,
			CachedWriteTokens:     row.CachedWriteTokens,
			ReasoningTokens:       row.ReasoningTokens,
			TotalTokens:           row.TotalTokens,
			EventCount:            row.EventCount,
			SessionCount:          row.SessionCount,
			TurnCount:             row.TurnCount,
			ToolCallCount:         row.ToolCallCount,
			AttributionConfidence: string(row.AttributionConfidence),
			IngestedAt:            time.UnixMilli(row.IngestedAt).UTC().Format(time.RFC3339Nano),
			RunID:                 row.RunID,
		})
	}

	for start := 0; start < len(rowInputs); start += tokenUsageSyncChunk {
		end := start + tokenUsageSyncChunk
		if end > len(rowInputs) {
			end = len(rowInputs)
		}
		if c.runtime == nil {
			return nil
		}
		if _, err := c.runtime.APIClient().UpsertTokenUsageHourly(orgID, rowInputs[start:end]); err != nil {
			return err
		}
	}
	return nil
}

func formatTokenUsageSyncTime(unixMillis int64) string {
	if unixMillis <= 0 {
		return ""
	}
	return time.UnixMilli(unixMillis).UTC().Format(time.RFC3339Nano)
}
