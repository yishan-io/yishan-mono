package collection

import (
	"context"
	"strings"
	"time"

	"github.com/rs/zerolog/log"
	"yishan/apps/cli/internal/adapter/sqlite"
)

// ensureHistoricalCostBackfillStarted records the backfill start cutoff in the
// store so the first backfill run covers rows ingested since that instant.
// The store type assertion keeps this policy internal to sqlite-backed runs.
func (c *Collector) ensureHistoricalCostBackfillStarted() {
	store, ok := c.repo.(*sqlite.HourlyUsageStore)
	if !ok {
		return
	}
	if _, err := store.EnsureCostBackfillStartedAt(context.Background(), time.Now().UTC().UnixMilli()); err != nil {
		log.Warn().Err(err).Msg("failed to initialize token usage historical cost backfill state")
	}
}

// maybeBackfillHistoricalCost recomputes estimated cost for rows without an
// estimate, from the recorded start cutoff. force=true recomputes all rows in
// the window (used after a pricing catalog refresh); otherwise only rows that
// still lack an estimate are backfilled.
func (c *Collector) maybeBackfillHistoricalCost(source string, force bool) {
	store, ok := c.repo.(*sqlite.HourlyUsageStore)
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
	updatedCount, err := store.BackfillEstimatedCost(context.Background(), startedAt, func(row sqlite.HourlyUsageRow) int64 {
		uncachedInputTokens := reconstructedUncachedInputTokens(row)
		return c.pricingCatalog.EstimateCost(
			row.Model,
			uncachedInputTokens,
			row.OutputTokens,
			row.CachedInputTokens,
			row.CachedWriteTokens,
			row.ReasoningTokens,
		)
	}, sqlite.CostBackfillOptions{RecomputeEstimated: force})
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

// reconstructedUncachedInputTokens re-derives the uncached input token count
// for cost estimation. Agents that report cached tokens separately subtract
// them from the raw input count; other agents use the raw input count.
func reconstructedUncachedInputTokens(row sqlite.HourlyUsageRow) int64 {
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
