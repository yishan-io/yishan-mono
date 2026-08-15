package collection

import (
	"context"
	"sort"
	"strings"
	"sync"
	"time"

	"slices"

	"github.com/rs/zerolog/log"
	agentkind "yishan/apps/cli/internal/agent/kind"
	"yishan/apps/cli/internal/api"
	localdb "yishan/apps/cli/internal/db"
	cliruntime "yishan/apps/cli/internal/runtime"
	"yishan/apps/cli/internal/tokenusage/attribution"
	"yishan/apps/cli/internal/tokenusage/ingestion"
	"yishan/apps/cli/internal/tokenusage/pricing"
	"yishan/apps/cli/internal/tokenusage/record"
	"yishan/apps/cli/internal/tokenusage/repository"
	"yishan/apps/cli/internal/tokenusage/scanner"
	"yishan/apps/cli/internal/workspace/instance"
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

type Collector struct {
	mu                   sync.Mutex
	registry             *instance.Registry
	runtime              *cliruntime.Runtime
	repo                 repository.HourlyUsageRepository
	pricingCatalog       pricing.Catalog
	timers               map[string]*time.Timer
	inFlight             map[string]bool
	needsRerun           map[string]bool
	recoverySinceByAgent map[string]int64
	pending              map[string][]localdb.HourlyUsageRow
	syncTimer            *time.Timer
	hourTimer            *time.Timer
	closed               bool
}

type DebugState struct {
	Closed           bool              `json:"closed"`
	ScheduledAgents  []string          `json:"scheduledAgents"`
	InFlightAgents   []string          `json:"inFlightAgents"`
	NeedsRerunAgents []string          `json:"needsRerunAgents"`
	KnownTimers      map[string]string `json:"knownTimers"`
	PendingAgents    []string          `json:"pendingAgents"`
}

// NewCollector builds the collector with an explicit pricing catalog (the
// tokenusage facade wires the disk-cached default catalog).
func NewCollector(
	registry *instance.Registry,
	runtime *cliruntime.Runtime,
	repo repository.HourlyUsageRepository,
	pricingCatalog pricing.Catalog,
) *Collector {
	return &Collector{
		registry:              registry,
		runtime:              runtime,
		repo:                 repo,
		pricingCatalog:       pricingCatalog,
		timers:               make(map[string]*time.Timer),
		inFlight:             make(map[string]bool),
		needsRerun:           make(map[string]bool),
		recoverySinceByAgent: make(map[string]int64),
		pending:              make(map[string][]localdb.HourlyUsageRow),
	}
}

func (c *Collector) StartStartupScan() {
	c.ensureHistoricalCostBackfillStarted()
	if c.pricingCatalog != nil {
		c.pricingCatalog.RefreshIfStaleAsync(func() {
			c.maybeBackfillHistoricalCost("pricing-refresh", true)
		})
	}
	c.maybeBackfillHistoricalCost("startup", false)
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

func (c *Collector) SyncNow(source string) {
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

func (c *Collector) Trigger(agentKind string, source string) {
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

func (c *Collector) runScan(agentKind string, source string) {
	scanSinceUnixMilli, shouldRun := c.beginScan(agentKind)
	if !shouldRun {
		return
	}

	startedAt := time.Now()
	records, err := c.scanAgentSince(agentKind, scanSinceUnixMilli)
	if err == nil {
		records = attribution.EnrichFromRegistry(records, c.registry)
	}
	if err == nil {
		err = c.repo.ReplaceAgentHourlyRows(context.Background(), agentKind, repository.ToHourlyRows(records))
	}
	if err != nil {
		log.Warn().Err(err).Str("agentKind", agentKind).Str("source", source).Msg("token usage scan failed")
	} else {
		log.Debug().Str("agentKind", agentKind).Str("source", source).Int("rows", len(records)).Dur("duration", time.Since(startedAt)).Msg("token usage scan completed")
		c.syncPending("scan")
	}

	shouldRerun, closed := c.finishScan(agentKind, err == nil)
	if shouldRerun && !closed {
		c.Trigger(agentKind, "rerun")
	}
}


func (c *Collector) scanAgent(agentKind string) ([]record.UsageRecord, error) {
	return c.scanAgentSince(agentKind, c.recentScanStartUnixMilli())
}

func (c *Collector) scanAgentSince(agentKind string, scanSinceUnixMilli int64) ([]record.UsageRecord, error) {
	scanInput := ingestion.BuildScanInput(c.registry, "daemon-"+agentKind, scanSinceUnixMilli, time.Now().UnixMilli(), "", c.pricingCatalog)
	switch agentKind {
	case agentkind.Codex:
		return scanner.ScanCodexHourlyUsage(context.Background(), scanInput)
	case agentkind.Claude:
		return scanner.ScanClaudeHourlyUsage(context.Background(), scanInput)
	case agentkind.OpenCode:
		return scanner.ScanOpenCodeHourlyUsage(context.Background(), scanInput)
	case agentkind.Gemini:
		return scanner.ScanGeminiHourlyUsage(context.Background(), scanInput)
	case agentkind.Pi:
		return scanner.ScanPiHourlyUsage(context.Background(), scanInput)
	default:
		return []record.UsageRecord{}, nil
	}
}

func (c *Collector) recentScanStartUnixMilli() int64 {
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

func isTokenTrackingAgentKind(kind string) bool {
	return slices.Contains(agentkind.WithTokenTracking, kind)
}

func (c *Collector) Close() {
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

func (c *Collector) DebugState() DebugState {
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

	return DebugState{
		Closed:           c.closed,
		ScheduledAgents:  scheduledAgents,
		InFlightAgents:   inFlightAgents,
		NeedsRerunAgents: needsRerunAgents,
		KnownTimers:      knownTimers,
		PendingAgents:    pendingAgents,
	}
}

func (c *Collector) startSyncLoop() {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.closed || c.syncTimer != nil {
		return
	}
	c.syncTimer = time.AfterFunc(tokenUsageSyncInterval, c.onPeriodicSync)
}

func (c *Collector) onPeriodicSync() {
	if c.pricingCatalog != nil {
		c.pricingCatalog.RefreshIfStaleAsync(func() {
			c.maybeBackfillHistoricalCost("pricing-refresh", true)
		})
	}
	c.maybeBackfillHistoricalCost("periodic", false)
	c.syncPending("periodic")
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.closed {
		return
	}
	c.syncTimer = time.AfterFunc(tokenUsageSyncInterval, c.onPeriodicSync)
}

func (c *Collector) startHourRolloverLoop() {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.closed || c.hourTimer != nil {
		return
	}
	c.hourTimer = time.AfterFunc(durationUntilNextHourPlusLag(), c.onHourRolloverSync)
}

func (c *Collector) onHourRolloverSync() {
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

func (c *Collector) syncPending(source string) {
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
		if orgID == "" || strings.EqualFold(orgID, "unknown") {
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

func (c *Collector) snapshotDirtyRowsByOrg() (map[string][]localdb.HourlyUsageRow, error) {
	rows, err := c.repo.ListDirtyHourlyRows(context.Background())
	if err != nil {
		return nil, err
	}

	rowsByOrg := make(map[string][]localdb.HourlyUsageRow)
	for _, row := range rows {
		if strings.TrimSpace(row.WorkspaceID) == "" {
			continue
		}
		orgID := row.OrganizationID
		if orgID == "" {
			orgID = attribution.OrgIDForWorkspace(c.registry, row.WorkspaceID)
		}
		if orgID == "" {
			log.Warn().Str("workspaceId", row.WorkspaceID).Msg("token usage row has no organization attribution; leaving it dirty")
			continue
		}
		rowsByOrg[orgID] = append(rowsByOrg[orgID], row)
	}
	return rowsByOrg, nil
}


func (c *Collector) syncRowsForOrg(orgID string, rows []localdb.HourlyUsageRow) error {
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
			TotalCostMicrosUSD:    row.TotalCostMicrosUSD,
			CostSource:            string(record.NormalizedCostSource(record.CostSource(row.CostSource))),
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

func (c *Collector) ensureHistoricalCostBackfillStarted() {
	store, ok := c.repo.(*localdb.HourlyUsageStore)
	if !ok {
		return
	}
	if _, err := store.EnsureCostBackfillStartedAt(context.Background(), time.Now().UTC().UnixMilli()); err != nil {
		log.Warn().Err(err).Msg("failed to initialize token usage historical cost backfill state")
	}
}

func (c *Collector) maybeBackfillHistoricalCost(source string, force bool) {
	store, ok := c.repo.(*localdb.HourlyUsageStore)
	if !ok || c.pricingCatalog == nil || !c.pricingCatalog.HasPrices() {
		return
	}
	completed, err := store.CostBackfillCompleted(context.Background())
	if err != nil {
		log.Warn().Err(err).Str("source", source).Msg("failed to read token usage historical cost backfill status")
		return
	}
	if completed && !force {
		return
	}
	startedAt, err := store.EnsureCostBackfillStartedAt(context.Background(), time.Now().UTC().UnixMilli())
	if err != nil {
		log.Warn().Err(err).Str("source", source).Msg("failed to read token usage historical cost backfill cutoff")
		return
	}
	updatedCount, err := store.BackfillEstimatedCost(context.Background(), startedAt, func(row localdb.HourlyUsageRow) int64 {
		uncachedInputTokens := reconstructedUncachedInputTokens(row)
		return c.pricingCatalog.EstimateCost(
			row.Model,
			uncachedInputTokens,
			row.OutputTokens,
			row.CachedInputTokens,
			row.CachedWriteTokens,
			row.ReasoningTokens,
		)
	}, localdb.CostBackfillOptions{RecomputeEstimated: force})
	if err != nil {
		log.Warn().Err(err).Str("source", source).Msg("token usage historical cost backfill failed")
		return
	}
	if err := store.MarkCostBackfillCompleted(context.Background()); err != nil {
		log.Warn().Err(err).Str("source", source).Msg("failed to mark token usage historical cost backfill complete")
		return
	}
	if updatedCount > 0 {
		log.Info().Str("source", source).Int("rows", updatedCount).Msg("token usage historical cost backfill completed")
		c.syncPending("cost-backfill")
	}
}

func reconstructedUncachedInputTokens(row localdb.HourlyUsageRow) int64 {
	switch strings.ToLower(strings.TrimSpace(row.AgentKind)) {
	case "pi", "opencode", "codex", "claude":
		uncachedInputTokens := row.InputTokens - row.CachedInputTokens - row.CachedWriteTokens
		if uncachedInputTokens < 0 {
			return 0
		}
		return uncachedInputTokens
	default:
		if row.InputTokens < 0 {
			return 0
		}
		return row.InputTokens
	}
}

func formatTokenUsageSyncTime(unixMillis int64) string {
	if unixMillis <= 0 {
		return ""
	}
	return time.UnixMilli(unixMillis).UTC().Format(time.RFC3339Nano)
}
